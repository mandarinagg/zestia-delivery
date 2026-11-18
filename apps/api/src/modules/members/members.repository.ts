import { Injectable } from '@nestjs/common';
import type { AssignableRole, MembershipStatus } from '@zestia/contracts';
import type { Invitation, Membership, Prisma } from '../../generated/prisma/client';
import { TenantDb } from '../tenancy';

export type MemberRow = Membership & {
  user: { name: string; email: string; status: 'ACTIVE' | 'DISABLED' };
};

const WITH_USER = { user: { select: { name: true, email: true, status: true } } } as const;

/** La invitación sin el hash del token (no sale nunca del repositorio). */
export type InvitationRow = Omit<Invitation, 'tokenHash'> & {
  invitedBy: { id: string; name: string } | null;
};

const INVITATION_FIELDS = {
  id: true,
  tenantId: true,
  email: true,
  role: true,
  invitedById: true,
  expiresAt: true,
  acceptedAt: true,
  acceptedUserId: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  invitedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.InvitationSelect;

/**
 * Membresías e invitaciones del tenant activo (#18). Mismo patrón que los demás repositorios:
 * `TenantDb.tx` (RLS) y además filtro por `tenantId` del contexto.
 *
 * Los datos de la cuenta (nombre, email) se leen por la relación `user`: RLS de `users` solo
 * deja ver la propia cuenta y las de miembros del tenant activo.
 */
@Injectable()
export class MembersRepository {
  constructor(private readonly db: TenantDb) {}

  private get tenantId(): string {
    return this.db.context.tenantId;
  }

  /* --- Miembros ---------------------------------------------------------------------------- */

  findMember(id: string): Promise<MemberRow | null> {
    return this.db.tx.membership.findFirst({
      where: { id, tenantId: this.tenantId },
      include: WITH_USER,
    });
  }

  /** Para modificar: bloquea la membresía hasta el fin de la transacción. */
  async lockMember(id: string): Promise<MemberRow | null> {
    const rows = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM memberships WHERE id = ${id}::uuid AND tenant_id = ${this.tenantId}::uuid
      FOR UPDATE`;
    return rows.length ? this.findMember(id) : null;
  }

  /**
   * Bloquea y devuelve los propietarios activos (en orden de id, siempre el mismo: dos cambios
   * simultáneos se serializan sin deadlock). Para no dejar al tenant sin propietario.
   */
  async lockActiveOwners(): Promise<string[]> {
    const rows = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM memberships
       WHERE tenant_id = ${this.tenantId}::uuid AND role = 'OWNER' AND status = 'ACTIVE'
       ORDER BY id
         FOR UPDATE`;
    return rows.map((r) => r.id);
  }

  /** Por nombre y después por id (cursor estable). */
  listMembers(options: {
    status?: MembershipStatus;
    q?: string;
    after?: { name: string; id: string };
    take: number;
  }): Promise<MemberRow[]> {
    const and: Prisma.MembershipWhereInput[] = [{ tenantId: this.tenantId }];
    if (options.status) and.push({ status: options.status });
    if (options.q) {
      and.push({
        user: {
          OR: [
            { name: { contains: options.q, mode: 'insensitive' } },
            { email: { contains: options.q.toLowerCase() } },
          ],
        },
      });
    }
    if (options.after) {
      const { name, id } = options.after;
      and.push({ OR: [{ user: { name: { gt: name } } }, { user: { name }, id: { gt: id } }] });
    }
    return this.db.tx.membership.findMany({
      where: { AND: and },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
      take: options.take,
      include: WITH_USER,
    });
  }

  updateMember(
    id: string,
    data: { role?: AssignableRole; status?: MembershipStatus },
  ): Promise<MemberRow> {
    return this.db.tx.membership.update({
      where: { id, tenantId: this.tenantId },
      data,
      include: WITH_USER,
    });
  }

  /** ¿Hay una cuenta con ese email (normalizado) que ya es miembro (activo o no)? */
  async isMemberEmail(email: string): Promise<boolean> {
    const found = await this.db.tx.membership.findFirst({
      where: { tenantId: this.tenantId, user: { email } },
      select: { id: true },
    });
    return found !== null;
  }

  tenantName(): Promise<string | null> {
    return this.db.tx.tenant
      .findUnique({ where: { id: this.tenantId }, select: { name: true } })
      .then((t) => t?.name ?? null);
  }

  userName(id: string): Promise<string | null> {
    return this.db.tx.user
      .findUnique({ where: { id }, select: { name: true } })
      .then((u) => u?.name ?? null);
  }

  /* --- Invitaciones ------------------------------------------------------------------------ */

  /** Abiertas (ni aceptadas ni revocadas), más nuevas primero. */
  listOpenInvitations(): Promise<InvitationRow[]> {
    return this.db.tx.invitation.findMany({
      where: { tenantId: this.tenantId, acceptedAt: null, revokedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: INVITATION_FIELDS,
    });
  }

  findOpenInvitationByEmail(email: string): Promise<InvitationRow | null> {
    return this.db.tx.invitation.findFirst({
      where: { tenantId: this.tenantId, email, acceptedAt: null, revokedAt: null },
      select: INVITATION_FIELDS,
    });
  }

  async lockInvitation(id: string): Promise<InvitationRow | null> {
    const rows = await this.db.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM invitations WHERE id = ${id}::uuid AND tenant_id = ${this.tenantId}::uuid
      FOR UPDATE`;
    if (!rows.length) return null;
    return this.db.tx.invitation.findFirst({
      where: { id, tenantId: this.tenantId },
      select: INVITATION_FIELDS,
    });
  }

  createInvitation(data: {
    email: string;
    role: AssignableRole;
    tokenHash: Buffer;
    invitedById: string;
    expiresAt: Date;
  }): Promise<InvitationRow> {
    return this.db.tx.invitation.create({
      data: { ...data, tokenHash: new Uint8Array(data.tokenHash), tenantId: this.tenantId },
      select: INVITATION_FIELDS,
    });
  }

  updateInvitation(
    id: string,
    data: { tokenHash?: Buffer; expiresAt?: Date; revokedAt?: Date },
  ): Promise<InvitationRow> {
    const { tokenHash, ...rest } = data;
    return this.db.tx.invitation.update({
      where: { id, tenantId: this.tenantId },
      data: { ...rest, ...(tokenHash ? { tokenHash: new Uint8Array(tokenHash) } : {}) },
      select: INVITATION_FIELDS,
    });
  }
}
