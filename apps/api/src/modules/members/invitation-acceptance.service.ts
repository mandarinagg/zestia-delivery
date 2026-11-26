import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AcceptInvitation,
  AcceptInvitationResponse,
  InvitationPreview,
  MemberErrorCode,
} from '@zestia/contracts';
import type { MembershipRole } from '../../generated/prisma/enums';
import { AuditService } from '../audit';
import { PasswordHasher, hashToken } from '../auth';
import { TenantDb } from '../tenancy';
import { memberConflict } from './members.service';

interface PeekRow {
  invitation_id: string;
  tenant_id: string;
  tenant_name: string;
  email: string;
  role: MembershipRole;
  expires_at: Date;
  existing_user_id: string | null;
  /** Ids nuevos (uuid v7) por si hace falta crear la cuenta y la membresía. */
  new_user_id: string;
  new_membership_id: string;
}

type AcceptOutcome = 'ACCEPTED' | 'INVALID' | 'DETAILS_REQUIRED' | 'ALREADY_MEMBER' | 'STALE';

function badRequest(code: MemberErrorCode): BadRequestException {
  return new BadRequestException({ statusCode: 400, code });
}

/**
 * Aceptar una invitación (#18). Sin sesión en el tenant: autoriza el token de un solo uso que
 * llegó por email (256 bits; en la DB solo su SHA-256), igual que el reset de contraseña.
 *
 *  1. `auth_invitation_peek` (SECURITY DEFINER, sin tenant): ¿token vigente? ¿de qué tenant?
 *     ¿ya hay cuenta para el email? Es barato: un token inventado no llega a hashear nada.
 *  2. `auth_invitation_accept` DENTRO de la transacción del tenant de la invitación (contexto
 *     armado por el servidor con lo que devolvió el paso 1), junto con la auditoría.
 *
 * No inicia sesión: después de aceptar, la persona ingresa con su email y contraseña.
 */
@Injectable()
export class InvitationAcceptanceService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
  ) {}

  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.peek(token);
    if (!invitation) throw badRequest('INVITATION_INVALID');
    return {
      tenantName: invitation.tenant_name,
      email: invitation.email,
      role: invitation.role,
      accountExists: invitation.existing_user_id !== null,
      expiresAt: invitation.expires_at.toISOString(),
    };
  }

  async accept(
    input: AcceptInvitation,
    correlationId: string | null,
  ): Promise<AcceptInvitationResponse> {
    let passwordHash: string | null = null;
    // Un reintento si la cuenta apareció entre el peek y la aceptación (STALE).
    for (let attempt = 0; attempt < 2; attempt++) {
      const invitation = await this.peek(input.token);
      if (!invitation) throw badRequest('INVITATION_INVALID');
      const accountExists = invitation.existing_user_id !== null;
      if (!accountExists) {
        if (!input.name || !input.password) throw badRequest('ACCOUNT_DETAILS_REQUIRED');
        passwordHash ??= await this.hasher.hash(input.password);
      }
      const userId = invitation.existing_user_id ?? invitation.new_user_id;
      const membershipId = invitation.new_membership_id;

      const outcome = await this.db.run(
        {
          tenantId: invitation.tenant_id,
          userId,
          membershipId,
          role: invitation.role,
          correlationId,
        },
        async () => {
          const [row] = await this.db.tx.$queryRaw<{ outcome: AcceptOutcome }[]>`
            SELECT auth_invitation_accept(
              ${hashToken(input.token)}, ${invitation.tenant_id}::uuid, ${userId}::uuid,
              ${membershipId}::uuid, ${accountExists ? null : (input.name ?? null)},
              ${accountExists ? null : passwordHash}
            ) AS outcome`;
          if (row?.outcome === 'ACCEPTED') {
            await this.audit.recordChange({
              action: 'users.invitation_accepted',
              entity: { type: 'membership', id: membershipId },
              changes: { role: { from: null, to: invitation.role } },
              metadata: { invitationId: invitation.invitation_id, accountCreated: !accountExists },
            });
          }
          return row?.outcome ?? 'INVALID';
        },
      );

      switch (outcome) {
        case 'ACCEPTED':
          return { accountCreated: !accountExists, email: invitation.email };
        case 'STALE':
          continue;
        case 'DETAILS_REQUIRED':
          throw badRequest('ACCOUNT_DETAILS_REQUIRED');
        case 'ALREADY_MEMBER':
          throw memberConflict('ALREADY_MEMBER');
        default:
          throw badRequest('INVITATION_INVALID');
      }
    }
    throw badRequest('INVITATION_INVALID');
  }

  private async peek(token: string): Promise<PeekRow | null> {
    const rows = await this.db.runUnscoped(
      (tx) => tx.$queryRaw<PeekRow[]>`
        SELECT p.*, app_uuid_v7() AS new_user_id, app_uuid_v7() AS new_membership_id
          FROM auth_invitation_peek(${hashToken(token)}) p`,
    );
    return rows[0] ?? null;
  }
}
