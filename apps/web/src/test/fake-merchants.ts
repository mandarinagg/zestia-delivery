import { type Permission, type Role, can } from '@zestia/auth';
import {
  type Branch,
  type MerchantDetail,
  type MerchantStatus,
  type MerchantSummary,
  createBranchSchema,
  createMerchantSchema,
  merchantListQuerySchema,
  updateBranchSchema,
  updateMerchantSchema,
} from '@zestia/contracts';
import type { z } from 'zod';

/**
 * SOLO TESTS. `/api/v1/merchants` en memoria con el contrato de la API real (#19): valida y
 * normaliza con los mismos esquemas de `@zestia/contracts` y aplica la misma matriz de permisos.
 * Cada empresa ve solo lo suyo.
 */

type Reply = { status: number; body?: unknown };

interface StoredMerchant extends Omit<MerchantSummary, 'branchCount'> {
  tenantId: string;
  branches: (Branch & { archived: boolean })[];
}

const NOW = '2026-11-18T12:00:00.000Z';
let seq = 0;
const nextId = () => `0192f0c4-1000-7000-8000-${String(++seq).padStart(12, '0')}`;

const err = (status: number, code: string, extra: object = {}): Reply => ({
  status,
  body: { statusCode: status, code, ...extra },
});

function validate<S extends z.ZodType>(
  schema: S,
  value: unknown,
): { ok: true; data: z.output<S> } | { ok: false; reply: Reply } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    reply: err(400, 'VALIDATION_FAILED', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }),
  };
}

export class FakeMerchants {
  private merchants: StoredMerchant[] = [];

  reset(): void {
    this.merchants = [];
  }

  /** Siembra un comercio directo en la "base". */
  seed(
    tenantId: string,
    data: Partial<Omit<StoredMerchant, 'tenantId' | 'branches'>> & {
      name: string;
      branches?: Partial<Branch>[];
    },
  ): MerchantDetail {
    const id = data.id ?? nextId();
    const merchant: StoredMerchant = {
      id,
      tenantId,
      name: data.name,
      ruc: data.ruc ?? null,
      phone: data.phone ?? null,
      status: data.status ?? 'ACTIVE',
      createdAt: NOW,
      updatedAt: NOW,
      branches: (data.branches ?? []).map((b) => ({
        id: nextId(),
        merchantId: id,
        name: 'Sucursal',
        address: 'Calle 1',
        neighborhood: 'Centro',
        city: 'Asunción',
        references: null,
        phone: null,
        openingHours: {},
        createdAt: NOW,
        updatedAt: NOW,
        ...b,
        archived: false,
      })),
    };
    this.merchants.push(merchant);
    return this.detail(merchant);
  }

  /** Atiende `path` (sin `/api/v1`) o devuelve `null` si no es de comercios. */
  handle(
    method: string,
    path: string,
    search: URLSearchParams,
    body: unknown,
    who: { tenantId: string; role: Role },
  ): Reply | null {
    const match =
      /^\/merchants(?:\/([^/]+))?(?:\/(suspend|reactivate|archive|branches))?(?:\/([^/]+))?(?:\/(archive))?$/.exec(
        path,
      );
    if (!match) return null;
    const [, id, action, branchId, branchAction] = match;
    const permission: Permission = method === 'GET' ? 'merchants:read' : 'merchants:manage';
    if (!can(who.role, permission)) return err(403, 'PERMISSION_DENIED');

    if (!id) {
      if (method === 'GET') return this.list(who.tenantId, search);
      if (method === 'POST') {
        const parsed = validate(createMerchantSchema, body);
        if (!parsed.ok) return parsed.reply;
        if (this.nameTaken(who.tenantId, parsed.data.name)) return err(409, 'DUPLICATE_NAME');
        return { status: 201, body: this.summary(this.seed(who.tenantId, parsed.data)) };
      }
      return err(404, 'NOT_FOUND');
    }

    const merchant = this.merchants.find((m) => m.id === id && m.tenantId === who.tenantId);
    if (!merchant) return err(404, 'NOT_FOUND');

    if (!action && method === 'GET') return { status: 200, body: this.detail(merchant) };
    if (action && action !== 'branches' && method === 'POST') {
      const rules: Record<string, [MerchantStatus[], MerchantStatus]> = {
        suspend: [['ACTIVE'], 'SUSPENDED'],
        reactivate: [['SUSPENDED'], 'ACTIVE'],
        archive: [['ACTIVE', 'SUSPENDED'], 'ARCHIVED'],
      };
      const [from, to] = rules[action]!;
      if (!from.includes(merchant.status)) return err(409, 'INVALID_STATUS_TRANSITION');
      merchant.status = to;
      return { status: 200, body: this.summary(merchant) };
    }
    if (merchant.status === 'ARCHIVED') return err(409, 'MERCHANT_ARCHIVED');

    if (!action && method === 'PATCH') {
      const parsed = validate(updateMerchantSchema, body);
      if (!parsed.ok) return parsed.reply;
      if (parsed.data.name && this.nameTaken(who.tenantId, parsed.data.name, merchant.id)) {
        return err(409, 'DUPLICATE_NAME');
      }
      Object.assign(merchant, parsed.data);
      return { status: 200, body: this.summary(merchant) };
    }

    if (action === 'branches' && !branchId && method === 'POST') {
      const parsed = validate(createBranchSchema, body);
      if (!parsed.ok) return parsed.reply;
      if (this.branchTaken(merchant, parsed.data.name)) return err(409, 'DUPLICATE_NAME');
      const branch = {
        ...parsed.data,
        id: nextId(),
        merchantId: merchant.id,
        createdAt: NOW,
        updatedAt: NOW,
        archived: false,
      };
      merchant.branches.push(branch);
      return { status: 201, body: strip(branch) };
    }

    const branch = merchant.branches.find((b) => b.id === branchId && !b.archived);
    if (action === 'branches' && branchId && !branch) return err(404, 'NOT_FOUND');
    if (branch && !branchAction && method === 'PATCH') {
      const parsed = validate(updateBranchSchema, body);
      if (!parsed.ok) return parsed.reply;
      if (parsed.data.name && this.branchTaken(merchant, parsed.data.name, branch.id)) {
        return err(409, 'DUPLICATE_NAME');
      }
      Object.assign(branch, parsed.data);
      return { status: 200, body: strip(branch) };
    }
    if (branch && branchAction === 'archive' && method === 'POST') {
      branch.archived = true;
      return { status: 204 };
    }
    return err(404, 'NOT_FOUND');
  }

  private list(tenantId: string, search: URLSearchParams): Reply {
    const parsed = validate(merchantListQuerySchema, Object.fromEntries(search));
    if (!parsed.ok) return parsed.reply;
    const { status, q, cursor, limit } = parsed.data;
    const term = q?.toLowerCase();
    const rows = this.merchants
      .filter((m) => m.tenantId === tenantId)
      .filter((m) => (status ? m.status === status : m.status !== 'ARCHIVED'))
      .filter((m) => !term || m.name.toLowerCase().includes(term) || m.ruc?.startsWith(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    const offset = cursor ? Number(atob(cursor)) : 0;
    if (!Number.isInteger(offset)) return err(400, 'INVALID_CURSOR');
    const page = rows.slice(offset, offset + limit);
    const more = offset + limit < rows.length;
    return {
      status: 200,
      body: {
        data: page.map((m) => this.summary(m)),
        nextCursor: more ? btoa(String(offset + limit)) : null,
      },
    };
  }

  private nameTaken(tenantId: string, name: string, except?: string): boolean {
    return this.merchants.some(
      (m) =>
        m.tenantId === tenantId &&
        m.id !== except &&
        m.status !== 'ARCHIVED' &&
        m.name.toLowerCase() === name.toLowerCase(),
    );
  }

  private branchTaken(merchant: StoredMerchant, name: string, except?: string): boolean {
    return merchant.branches.some(
      (b) => !b.archived && b.id !== except && b.name.toLowerCase() === name.toLowerCase(),
    );
  }

  private summary(m: StoredMerchant | MerchantDetail): MerchantSummary {
    const branches = 'tenantId' in m ? m.branches.filter((b) => !b.archived) : m.branches;
    return {
      id: m.id,
      name: m.name,
      ruc: m.ruc,
      phone: m.phone,
      status: m.status,
      branchCount: branches.length,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  private detail(m: StoredMerchant): MerchantDetail {
    return {
      ...this.summary(m),
      branches: m.branches.filter((b) => !b.archived).map(strip),
    };
  }
}

function strip({ archived: _archived, ...branch }: Branch & { archived: boolean }): Branch {
  return branch;
}
