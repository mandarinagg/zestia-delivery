import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Branch,
  CreateBranch,
  CreateMerchant,
  MerchantDetail,
  MerchantErrorCode,
  MerchantListQuery,
  MerchantPage,
  MerchantStatus,
  MerchantSummary,
  OpeningHours,
  UpdateBranch,
  UpdateMerchant,
} from '@zestia/contracts';
import type { Merchant, MerchantBranch } from '../../generated/prisma/client';
import { decodeNameCursor, encodeNameCursor } from '../../http/name-cursor';
import { AuditService, auditDiff, type AuditFieldSpec } from '../audit';
import { MerchantsRepository, type MerchantWithCount } from './merchants.repository';

/**
 * Qué se audita de cada entidad (#17). RUC, teléfonos, dirección y referencias pueden ser de
 * una persona: se registra que cambiaron, no el valor.
 */
const MERCHANT_AUDIT: AuditFieldSpec<Merchant> = {
  fields: ['name', 'status', 'deletedAt'],
  redacted: ['ruc', 'phone'],
};

type BranchSnapshot = Omit<MerchantBranch, 'openingHours'> & { openingHours: string };
const BRANCH_AUDIT: AuditFieldSpec<BranchSnapshot> = {
  fields: ['name', 'neighborhood', 'city', 'openingHours', 'deletedAt'],
  redacted: ['address', 'references', 'phone'],
};

/** El horario es un objeto: para el diff se compara su JSON (orden de días fijo). */
function branchSnapshot(branch: MerchantBranch): BranchSnapshot {
  return { ...branch, openingHours: JSON.stringify(branch.openingHours) };
}

/** Transiciones de estado permitidas: acción → (desde, hacia). Archivado es final. */
const TRANSITIONS = {
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED', action: 'merchants.suspended' },
  reactivate: { from: ['SUSPENDED'], to: 'ACTIVE', action: 'merchants.reactivated' },
  archive: { from: ['ACTIVE', 'SUSPENDED'], to: 'ARCHIVED', action: 'merchants.archived' },
} as const satisfies Record<
  string,
  { from: readonly MerchantStatus[]; to: MerchantStatus; action: string }
>;
export type MerchantTransition = keyof typeof TRANSITIONS;

function conflict(code: MerchantErrorCode): ConflictException {
  return new ConflictException({ statusCode: 409, code });
}

/** Violación del índice único de nombre (Postgres 23505 / Prisma P2002). */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  return (
    e.code === 'P2002' ||
    e.code === '23505' ||
    e.cause?.code === '23505' ||
    (typeof e.message === 'string' && e.message.includes('23505'))
  );
}

async function withDuplicateCheck<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('DUPLICATE_NAME');
    throw error;
  }
}

/* --- Vistas --------------------------------------------------------------------------------- */

function toSummary(m: MerchantWithCount): MerchantSummary {
  return {
    id: m.id,
    name: m.name,
    ruc: m.ruc,
    phone: m.phone,
    status: m.status,
    branchCount: m._count.branches,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function toBranch(b: MerchantBranch): Branch {
  return {
    id: b.id,
    merchantId: b.merchantId,
    name: b.name,
    address: b.address,
    neighborhood: b.neighborhood,
    city: b.city,
    references: b.references,
    phone: b.phone,
    openingHours: b.openingHours as OpeningHours,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/**
 * Comercios y sucursales (#19). Cada cambio se audita en la misma transacción
 * (`AuditService.recordChange`). Inexistente y "de otro tenant" son siempre 404.
 */
@Injectable()
export class MerchantsService {
  constructor(
    private readonly merchants: MerchantsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(query: MerchantListQuery): Promise<MerchantPage> {
    const rows = await this.merchants.list({
      status: query.status,
      q: query.q || undefined,
      after: query.cursor ? decodeNameCursor(query.cursor) : undefined,
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map(toSummary),
      nextCursor: rows.length > query.limit && last ? encodeNameCursor(last) : null,
    };
  }

  async detail(id: string): Promise<MerchantDetail> {
    const merchant = await this.merchants.findById(id);
    if (!merchant) throw new NotFoundException();
    const branches = await this.merchants.branches(id);
    return { ...toSummary(merchant), branches: branches.map(toBranch) };
  }

  async create(input: CreateMerchant): Promise<MerchantSummary> {
    const created = await withDuplicateCheck(() => this.merchants.create(input));
    await this.audit.recordChange({
      action: 'merchants.created',
      entity: { type: 'merchant', id: created.id },
      changes: auditDiff(null, created, MERCHANT_AUDIT),
    });
    return toSummary(created);
  }

  async update(id: string, input: UpdateMerchant): Promise<MerchantSummary> {
    const before = await this.lockEditable(id);
    const after = await withDuplicateCheck(() => this.merchants.update(id, input));
    await this.audit.recordChange({
      action: 'merchants.updated',
      entity: { type: 'merchant', id },
      changes: auditDiff(before, after, MERCHANT_AUDIT),
    });
    return toSummary(after);
  }

  async transition(id: string, transition: MerchantTransition): Promise<MerchantSummary> {
    const rule = TRANSITIONS[transition];
    const before = await this.merchants.lockById(id);
    if (!before) throw new NotFoundException();
    if (!(rule.from as readonly MerchantStatus[]).includes(before.status)) {
      throw conflict('INVALID_STATUS_TRANSITION');
    }
    const after = await this.merchants.update(id, {
      status: rule.to,
      deletedAt: rule.to === 'ARCHIVED' ? new Date() : null,
    });
    await this.audit.recordChange({
      action: rule.action,
      entity: { type: 'merchant', id },
      changes: auditDiff(before, after, MERCHANT_AUDIT),
    });
    return toSummary(after);
  }

  async createBranch(merchantId: string, input: CreateBranch): Promise<Branch> {
    await this.lockEditable(merchantId);
    const created = await withDuplicateCheck(() => this.merchants.createBranch(merchantId, input));
    await this.audit.recordChange({
      action: 'merchants.branch_created',
      entity: { type: 'merchant_branch', id: created.id },
      changes: auditDiff(null, branchSnapshot(created), BRANCH_AUDIT),
      metadata: { merchantId },
    });
    return toBranch(created);
  }

  async updateBranch(merchantId: string, branchId: string, input: UpdateBranch): Promise<Branch> {
    await this.lockEditable(merchantId);
    const before = await this.merchants.findBranch(merchantId, branchId);
    if (!before) throw new NotFoundException();
    const after = await withDuplicateCheck(() => this.merchants.updateBranch(branchId, input));
    await this.audit.recordChange({
      action: 'merchants.branch_updated',
      entity: { type: 'merchant_branch', id: branchId },
      changes: auditDiff(branchSnapshot(before), branchSnapshot(after), BRANCH_AUDIT),
      metadata: { merchantId },
    });
    return toBranch(after);
  }

  async archiveBranch(merchantId: string, branchId: string): Promise<void> {
    await this.lockEditable(merchantId);
    const before = await this.merchants.findBranch(merchantId, branchId);
    if (!before) throw new NotFoundException();
    const after = await this.merchants.updateBranch(branchId, { deletedAt: new Date() });
    await this.audit.recordChange({
      action: 'merchants.branch_archived',
      entity: { type: 'merchant_branch', id: branchId },
      changes: auditDiff(branchSnapshot(before), branchSnapshot(after), BRANCH_AUDIT),
      metadata: { merchantId },
    });
  }

  /** Bloquea el comercio para modificarlo: 404 si no existe, 409 si está archivado. */
  private async lockEditable(id: string): Promise<Merchant> {
    const merchant = await this.merchants.lockById(id);
    if (!merchant) throw new NotFoundException();
    if (merchant.status === 'ARCHIVED') throw conflict('MERCHANT_ARCHIVED');
    return merchant;
  }
}
