import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { MembershipRole, TenantStatus } from '../../generated/prisma/enums';
import type { Principal } from './principal';
import { isUuid, type TenantContext } from './tenant-context';
import { runInDbScope } from './tenant-transaction';

export type TenantResolution =
  | { readonly ok: true; readonly context: TenantContext }
  | {
      readonly ok: false;
      readonly reason: 'INVALID_PRINCIPAL' | 'NO_ACTIVE_MEMBERSHIP' | 'TENANT_SELECTION_REQUIRED';
    };

/** Membresía del usuario autenticado, con datos mínimos del tenant (selector de empresa). */
export interface MembershipSummary {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly tenantStatus: TenantStatus;
  readonly role: MembershipRole;
}

/**
 * El usuario autenticado y sus membresías activas (incluidas las de tenants suspendidos, que el
 * selector muestra deshabilitadas). Las membresías deshabilitadas (#18) no se listan.
 */
export interface UserIdentity {
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
  readonly memberships: readonly MembershipSummary[];
}

/**
 * Resuelve el tenant activo desde la membresía del usuario autenticado.
 *
 * La consulta corre con `app.user_id` fijado y SIN `app.tenant_id`: RLS solo deja ver las
 * membresías propias (política `memberships_self_lookup`). Cuentan solo las membresías
 * `ACTIVE` (#18: un Admin puede deshabilitar a alguien en su empresa) de tenants `ACTIVE`.
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
          status: 'ACTIVE',
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

  /**
   * El usuario y sus membresías, con el mismo alcance que `resolve()` (solo `app.user_id`):
   * RLS deja ver únicamente el propio usuario, sus membresías y esos tenants. `null` si el
   * usuario no existe (o el id no es válido).
   */
  async describeUser(userId: string): Promise<UserIdentity | null> {
    if (!isUuid(userId)) return null;
    return runInDbScope(this.prisma, { tenantId: null, userId }, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });
      if (!user) return null;
      const memberships = await tx.membership.findMany({
        where: { userId, status: 'ACTIVE' },
        select: {
          id: true,
          role: true,
          tenant: { select: { id: true, name: true, slug: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return {
        user,
        memberships: memberships.map((m) => ({
          membershipId: m.id,
          tenantId: m.tenant.id,
          tenantName: m.tenant.name,
          tenantSlug: m.tenant.slug,
          tenantStatus: m.tenant.status,
          role: m.role,
        })),
      };
    });
  }
}
