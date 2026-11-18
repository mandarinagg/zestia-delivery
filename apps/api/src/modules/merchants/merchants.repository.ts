import { Injectable } from '@nestjs/common';
import type { Merchant } from '../../generated/prisma/client';
import { TenantDb } from '../tenancy';

/**
 * Acceso a comercios. Patrón para todo repositorio de negocio:
 *  - el cliente sale SOLO de `TenantDb.tx` (transacción con `app.tenant_id`; RLS en la DB);
 *  - además se filtra por `tenantId` del contexto (defensa en profundidad, ADR-004).
 */
@Injectable()
export class MerchantsRepository {
  constructor(private readonly db: TenantDb) {}

  findById(id: string): Promise<Merchant | null> {
    return this.db.tx.merchant.findFirst({
      where: { id, tenantId: this.db.context.tenantId, deletedAt: null },
    });
  }
}
