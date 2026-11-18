import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Principal } from './principal';
import { isUuid, type TenantContext } from './tenant-context';
import { runInDbScope } from './tenant-transaction';

export type TenantResolution =
  | { readonly ok: true; readonly context: TenantContext }
  | {
      readonly ok: false;
      readonly reason: 'INVALID_PRINCIPAL' | 'NO_ACTIVE_MEMBERSHIP' | 'TENANT_SELECTION_REQUIRED';
    };

/**
 * Resuelve el tenant activo desde la membresía del usuario autenticado.
 *
 * La consulta corre con `app.user_id` fijado y SIN `app.tenant_id`: RLS solo deja ver las
 * membresías propias (política `memberships_self_lookup`) de tenants `ACTIVE`.
 */
@Injectable()
export class TenantResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(principal: Principal): Promise<TenantResolution> {
    const { userId, activeTenantId } = principal;
    if (!isUuid(userId) || (activeTenantId !== null && !isUuid(activeTenantId))) {
      return { ok: false, reason: 'INVALID_PRINCIPAL' };
    }

    const memberships = await runInDbScope(this.prisma, { tenantId: null, userId }, (tx) =>
      tx.membership.findMany({
        where: {
          userId,
          ...(activeTenantId !== null ? { tenantId: activeTenantId } : {}),
          tenant: { status: 'ACTIVE' },
        },
        select: { id: true, tenantId: true, role: true },
        orderBy: { createdAt: 'asc' },
        take: 2,
      }),
    );

    const [membership, another] = memberships;
    if (!membership) return { ok: false, reason: 'NO_ACTIVE_MEMBERSHIP' };
    if (another) return { ok: false, reason: 'TENANT_SELECTION_REQUIRED' };
    return {
      ok: true,
      context: {
        tenantId: membership.tenantId,
        userId,
        membershipId: membership.id,
        role: membership.role,
      },
    };
  }
}
