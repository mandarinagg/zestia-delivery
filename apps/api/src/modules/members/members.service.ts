import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { can } from '@zestia/auth';
import type {
  AssignableRole,
  CreateInvitation,
  Invitation,
  InvitationList,
  Member,
  MemberErrorCode,
  MemberListQuery,
  MemberPage,
  MembershipStatus,
} from '@zestia/contracts';
import { ENV, type Env } from '../../config/env';
import type { MembershipRole } from '../../generated/prisma/enums';
import { decodeNameCursor, encodeNameCursor } from '../../http/name-cursor';
import { AuditService } from '../audit';
import { generateToken, hashToken } from '../auth';
import { MAIL_TRANSPORT, type MailTransport } from '../mail';
import { TenantDb } from '../tenancy';
import { invitationMail } from './invitation-mail';
import { type InvitationRow, type MemberRow, MembersRepository } from './members.repository';

export function memberConflict(code: MemberErrorCode): ConflictException {
  return new ConflictException({ statusCode: 409, code });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, code: 'PERMISSION_DENIED' });
}

/** Violación de un índice único (Postgres 23505 / Prisma P2002). */
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

function toMember(m: MemberRow): Member {
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.status,
    accountStatus: m.user.status,
    createdAt: m.createdAt.toISOString(),
  };
}

function toInvitation(i: InvitationRow, now = new Date()): Invitation {
  const status = i.acceptedAt
    ? 'ACCEPTED'
    : i.revokedAt
      ? 'REVOKED'
      : i.expiresAt <= now
        ? 'EXPIRED'
        : 'PENDING';
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    status,
    invitedBy: i.invitedBy,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

/**
 * Usuarios del tenant e invitaciones (#18), del lado de quien administra.
 *
 * Reglas (además de los permisos del endpoint):
 *  - dar, quitar o tocar el rol Propietario exige `users:manage-owners` (solo Propietario);
 *  - nadie cambia su propio rol ni se deshabilita a sí mismo;
 *  - el tenant nunca queda sin un Propietario activo (se bloquean las filas de propietarios);
 *  - cada cambio se audita en la misma transacción; el email de la invitación va oculto.
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly repository: MembersRepository,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /* --- Miembros ---------------------------------------------------------------------------- */

  async list(query: MemberListQuery): Promise<MemberPage> {
    const rows = await this.repository.listMembers({
      status: query.status,
      q: query.q || undefined,
      after: query.cursor ? decodeNameCursor(query.cursor) : undefined,
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map(toMember),
      nextCursor:
        rows.length > query.limit && last
          ? encodeNameCursor({ name: last.user.name, id: last.id })
          : null,
    };
  }

  async findOne(id: string): Promise<Member> {
    const member = await this.repository.findMember(id);
    if (!member) throw new NotFoundException();
    return toMember(member);
  }

  async changeRole(id: string, role: AssignableRole): Promise<Member> {
    const before = await this.lockForChange(id, role === 'OWNER');
    if (before.role === role) return toMember(before);
    if (before.role === 'OWNER' && before.status === 'ACTIVE') await this.assertAnotherOwner(id);
    const after = await this.repository.updateMember(id, { role });
    await this.audit.recordChange({
      action: 'users.role_changed',
      entity: { type: 'membership', id },
      changes: { role: { from: before.role, to: after.role } },
      metadata: { userId: after.userId },
    });
    return toMember(after);
  }

  async setStatus(id: string, status: MembershipStatus): Promise<Member> {
    const before = await this.lockForChange(id, false);
    if (before.status === status) throw memberConflict('INVALID_STATUS_TRANSITION');
    if (status === 'DISABLED' && before.role === 'OWNER') await this.assertAnotherOwner(id);
    const after = await this.repository.updateMember(id, { status });
    await this.audit.recordChange({
      action: status === 'DISABLED' ? 'users.disabled' : 'users.enabled',
      entity: { type: 'membership', id },
      changes: { status: { from: before.status, to: after.status } },
      metadata: { userId: after.userId },
    });
    return toMember(after);
  }

  /**
   * Bloquea la membresía a modificar y aplica las reglas comunes: existe (404), no es la
   * propia (409) y, si toca el rol Propietario, quien la cambia puede gestionarlo (403).
   */
  private async lockForChange(id: string, grantsOwner: boolean): Promise<MemberRow> {
    // Orden de bloqueo fijo: primero los propietarios activos, después la membresía.
    await this.repository.lockActiveOwners();
    const member = await this.repository.lockMember(id);
    if (!member) throw new NotFoundException();
    if (member.userId === this.db.context.userId) throw memberConflict('SELF_MODIFICATION');
    this.assertCanManageRole(member.role === 'OWNER' || grantsOwner);
    return member;
  }

  /** El tenant no puede quedarse sin propietario activo (las filas ya están bloqueadas). */
  private async assertAnotherOwner(exceptId: string): Promise<void> {
    const owners = await this.repository.lockActiveOwners();
    if (!owners.some((id) => id !== exceptId)) throw memberConflict('LAST_OWNER');
  }

  private assertCanManageRole(involvesOwner: boolean): void {
    if (involvesOwner && !can(this.db.context.role, 'users:manage-owners')) {
      throw permissionDenied();
    }
  }

  /* --- Invitaciones ------------------------------------------------------------------------ */

  async listInvitations(): Promise<InvitationList> {
    const now = new Date();
    const rows = await this.repository.listOpenInvitations();
    return { data: rows.map((i) => toInvitation(i, now)) };
  }

  async invite(input: CreateInvitation): Promise<Invitation> {
    this.assertCanManageRole(input.role === 'OWNER');
    if (await this.repository.isMemberEmail(input.email)) throw memberConflict('ALREADY_MEMBER');

    const open = await this.repository.findOpenInvitationByEmail(input.email);
    if (open) {
      if (open.expiresAt > new Date()) throw memberConflict('INVITATION_PENDING');
      // Una vencida se reemplaza: queda revocada (y auditada) y se crea otra.
      await this.revokeRow(open, 'SUPERSEDED');
    }

    const token = generateToken();
    let created: InvitationRow;
    try {
      created = await this.repository.createInvitation({
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedById: this.db.context.userId,
        expiresAt: this.expiresAt(),
      });
    } catch (error) {
      // Carrera con otra invitación al mismo email (índice único de abiertas).
      if (isUniqueViolation(error)) throw memberConflict('INVITATION_PENDING');
      throw error;
    }
    await this.audit.recordChange({
      action: 'users.invited',
      entity: { type: 'invitation', id: created.id },
      changes: { email: { redacted: true }, role: { from: null, to: created.role } },
    });
    await this.send(created, token);
    return toInvitation(created);
  }

  /** Nuevo token y nuevo vencimiento; el enlace anterior deja de servir. */
  async resend(id: string): Promise<Invitation> {
    const invitation = await this.lockOpenInvitation(id);
    const token = generateToken();
    const updated = await this.repository.updateInvitation(id, {
      tokenHash: hashToken(token),
      expiresAt: this.expiresAt(),
    });
    await this.audit.recordChange({
      action: 'users.invitation_resent',
      entity: { type: 'invitation', id },
      changes: {
        expiresAt: {
          from: invitation.expiresAt.toISOString(),
          to: updated.expiresAt.toISOString(),
        },
      },
    });
    await this.send(updated, token);
    return toInvitation(updated);
  }

  async revoke(id: string): Promise<void> {
    const invitation = await this.lockOpenInvitation(id);
    await this.revokeRow(invitation, 'REVOKED');
  }

  private async lockOpenInvitation(id: string): Promise<InvitationRow> {
    const invitation = await this.repository.lockInvitation(id);
    if (!invitation) throw new NotFoundException();
    this.assertCanManageRole(invitation.role === 'OWNER');
    if (invitation.acceptedAt || invitation.revokedAt) throw memberConflict('INVITATION_CLOSED');
    return invitation;
  }

  private async revokeRow(invitation: InvitationRow, reason: 'REVOKED' | 'SUPERSEDED') {
    await this.repository.updateInvitation(invitation.id, { revokedAt: new Date() });
    await this.audit.recordChange({
      action: 'users.invitation_revoked',
      entity: { type: 'invitation', id: invitation.id },
      changes: null,
      metadata: { reason },
    });
  }

  private expiresAt(): Date {
    return new Date(Date.now() + this.env.INVITATION_TTL_HOURS * 3_600_000);
  }

  /**
   * Manda el email dentro de la transacción: si falla, la invitación no se guarda (502) y quien
   * invita puede reintentar. En el log no van ni el destinatario ni el token.
   */
  private async send(invitation: InvitationRow, token: string): Promise<void> {
    const [tenantName, inviterName] = await Promise.all([
      this.repository.tenantName(),
      this.repository.userName(this.db.context.userId),
    ]);
    try {
      await this.mail.send(
        invitationMail({
          to: invitation.email,
          tenantName: tenantName ?? 'tu empresa',
          inviterName,
          role: invitation.role as MembershipRole,
          webBaseUrl: this.env.WEB_BASE_URL,
          token,
          ttlHours: this.env.INVITATION_TTL_HOURS,
        }),
      );
    } catch (error) {
      this.logger.error(
        { invitationId: invitation.id, err: error instanceof Error ? error.name : 'unknown' },
        'no se pudo enviar el email de invitación',
      );
      throw new BadGatewayException({ statusCode: 502, code: 'MAIL_DELIVERY_FAILED' });
    }
  }
}
