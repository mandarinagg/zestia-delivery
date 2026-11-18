import { Injectable } from '@nestjs/common';
import type { CreateBranch, CreateMerchant, MerchantStatus } from '@zestia/contracts';
import type { Merchant, MerchantBranch, Prisma } from '../../generated/prisma/client';
import { TenantDb } from '../tenancy';

export type MerchantWithCount = Merchant & { _count: { branches: number } };

const ACTIVE_BRANCHES = { where: { deletedAt: null } } as const;
const WITH_COUNT = { _count: { select: { branches: ACTIVE_BRANCHES } } } as const;

/**
 * Acceso a comercios y sucursales. Patrón para todo repositorio de negocio:
 *  - el cliente sale SOLO de `TenantDb.tx` (transacción con `app.tenant_id`; RLS en la DB);
 *  - además se filtra por `tenantId` del contexto (defensa en profundidad, ADR-004).
 */
@Injectable()
export class MerchantsRepository {
  constructor(private readonly db: TenantDb) {}

  private get tenantId(): string {
    return this.db.context.tenantId;
  }

  /** Incluye archivados (el detalle se puede ver); `null` si no existe en este tenant. */
  findById(id: string): Promise<MerchantWithCount | null> {
    return this.db.tx.merchant.findFirst({
      where: { id, tenantId: this.tenantId },
      include: WITH_COUNT,
    });
  }

  /** Para modificar: bloquea la fila hasta el fin de la transacción (`FOR UPDATE`). */
  async lockById(id: string): Promise<Merchant | null> {
    const rows = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM merchants WHERE id = ${id}::uuid AND tenant_id = ${this.tenantId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) return null;
    return this.db.tx.merchant.findFirst({ where: { id, tenantId: this.tenantId } });
  }

  /**
   * Por nombre y después por id (orden estable para el cursor). Sin `status`: activos y
   * suspendidos.
   */
  list(options: {
    status?: MerchantStatus;
    q?: string;
    after?: { name: string; id: string };
    take: number;
  }): Promise<MerchantWithCount[]> {
    const and: Prisma.MerchantWhereInput[] = [
      { tenantId: this.tenantId },
      options.status ? { status: options.status } : { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    ];
    if (options.q) {
      and.push({
        OR: [
          { name: { contains: options.q, mode: 'insensitive' } },
          { ruc: { startsWith: options.q } },
        ],
      });
    }
    if (options.after) {
      const { name, id } = options.after;
      and.push({ OR: [{ name: { gt: name } }, { name, id: { gt: id } }] });
    }
    return this.db.tx.merchant.findMany({
      where: { AND: and },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: options.take,
      include: WITH_COUNT,
    });
  }

  create(data: CreateMerchant): Promise<MerchantWithCount> {
    return this.db.tx.merchant.create({
      data: { ...data, tenantId: this.tenantId },
      include: WITH_COUNT,
    });
  }

  update(id: string, data: Prisma.MerchantUpdateManyMutationInput): Promise<MerchantWithCount> {
    return this.db.tx.merchant.update({
      where: { tenantId_id: { tenantId: this.tenantId, id } },
      data,
      include: WITH_COUNT,
    });
  }

  branches(merchantId: string): Promise<MerchantBranch[]> {
    return this.db.tx.merchantBranch.findMany({
      where: { tenantId: this.tenantId, merchantId, deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  findBranch(merchantId: string, branchId: string): Promise<MerchantBranch | null> {
    return this.db.tx.merchantBranch.findFirst({
      where: { id: branchId, merchantId, tenantId: this.tenantId, deletedAt: null },
    });
  }

  createBranch(merchantId: string, data: CreateBranch): Promise<MerchantBranch> {
    return this.db.tx.merchantBranch.create({
      data: { ...data, tenantId: this.tenantId, merchantId },
    });
  }

  updateBranch(
    branchId: string,
    data: Prisma.MerchantBranchUpdateManyMutationInput,
  ): Promise<MerchantBranch> {
    return this.db.tx.merchantBranch.update({
      where: { tenantId_id: { tenantId: this.tenantId, id: branchId } },
      data,
    });
  }
}
