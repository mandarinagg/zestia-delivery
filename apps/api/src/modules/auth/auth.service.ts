import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthSessionResponse } from '@zestia/contracts';
import { AuditService, type AuditActor, type AuditMetadata } from '../audit';
import { MAIL_TRANSPORT, type MailTransport } from '../mail';
import { TenantDb, TenantResolver } from '../tenancy';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './password-hasher';
import { passwordResetMail } from './password-reset-mail';
import type { CurrentSession } from './session.service';
import { deriveCsrfToken, generateToken, hashToken } from './tokens';

/** Datos de la request que necesitan el rate limit y la auditoría (nunca se loguean). */
export interface RequestMeta {
  readonly ip: string;
  readonly correlationId: string | null;
}

export type Failure<R extends string> = { readonly ok: false; readonly reason: R };
export type RateLimited = {
  readonly ok: false;
  readonly reason: 'TOO_MANY_ATTEMPTS';
  readonly retryAfterSeconds: number;
};

export type LoginResult =
  | {
      readonly ok: true;
      readonly token: string;
      readonly userId: string;
      readonly activeTenantId: string | null;
    }
  | Failure<'INVALID_CREDENTIALS'>
  | RateLimited;

export type ChangePasswordResult =
  | { readonly ok: true; readonly token: string }
  | Failure<'INVALID_CURRENT_PASSWORD' | 'UNAUTHENTICATED'>
  | RateLimited;

export type SwitchTenantResult =
  { readonly ok: true } | Failure<'NO_ACTIVE_MEMBERSHIP' | 'UNAUTHENTICATED'>;

/** Acciones de auditoría de este módulo (formato `dominio.acción[.detalle]`). */
export const AUTH_AUDIT = {
  loginSucceeded: 'auth.login.succeeded',
  loginFailed: 'auth.login.failed',
  logout: 'auth.logout',
  resetRequested: 'auth.password_reset.requested',
  resetCompleted: 'auth.password_reset.completed',
  resetFailed: 'auth.password_reset.failed',
  passwordChanged: 'auth.password.changed',
  passwordChangeFailed: 'auth.password.change_failed',
  tenantSwitched: 'auth.tenant.switched',
  tenantSwitchDenied: 'auth.tenant.switch_denied',
} as const;

/**
 * Flujos de autenticación. Reglas transversales:
 *  - mensajes genéricos: login fallido = `INVALID_CREDENTIALS` sea cual sea la causa (email
 *    desconocido, contraseña incorrecta, usuario deshabilitado); el pedido de reset responde
 *    igual exista o no el email;
 *  - tiempo parejo: siempre se verifica un hash Argon2 (señuelo si no hay cuenta);
 *  - la causa real queda en la auditoría (sin PII), no en la respuesta ni en los logs.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly tenants: TenantResolver,
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async login(
    email: string,
    password: string,
    previousToken: string | null,
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const attempt = await this.repository.registerAttempt(
      'LOGIN',
      email,
      meta.ip,
      this.settings.loginRateLimit,
    );
    if (!attempt.allowed) {
      // Los fallos que llevaron al bloqueo ya están auditados; los rechazos por rate limit no
      // escriben filas (un atacante no puede inflar la auditoría).
      this.logger.warn({ correlationId: meta.correlationId }, 'login bloqueado por rate limit');
      return {
        ok: false,
        reason: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: attempt.retryAfterSeconds,
      };
    }

    const candidate = await this.repository.loginLookup(attempt.attemptId, email);
    const passwordOk = await this.hasher.verify(candidate?.passwordHash ?? null, password);

    const failure = !candidate
      ? 'UNKNOWN_ACCOUNT'
      : candidate.status !== 'ACTIVE'
        ? 'USER_DISABLED'
        : candidate.passwordHash === null
          ? 'NO_PASSWORD'
          : !passwordOk
            ? 'BAD_PASSWORD'
            : null;
    if (failure !== null || !candidate || candidate.passwordHash === null) {
      await this.record(AUTH_AUDIT.loginFailed, { type: 'ANONYMOUS' }, meta, {
        entity: candidate ? { type: 'user', id: candidate.userId } : null,
        metadata: { reason: failure ?? 'UNKNOWN_ACCOUNT' },
      });
      return { ok: false, reason: 'INVALID_CREDENTIALS' };
    }

    // Tenant activo inicial: el único tenant ACTIVE del usuario; con varios, lo elige después
    // (POST /switch-tenant). El guard de tenancy lo revalida en cada request igual.
    const resolution = await this.tenants.resolve({
      userId: candidate.userId,
      activeTenantId: null,
    });
    const activeTenantId = resolution.ok ? resolution.context.tenantId : null;
    const token = generateToken();
    const rehashed = this.hasher.needsRehash(candidate.passwordHash);
    const sessionId = await this.repository.loginComplete({
      attemptId: attempt.attemptId,
      tokenHash: hashToken(token),
      idleSeconds: this.settings.idleSeconds,
      absoluteSeconds: this.settings.absoluteSeconds,
      activeTenantId,
      replacedTokenHash: previousToken ? hashToken(previousToken) : null,
      rehash: rehashed ? await this.hasher.hash(password) : null,
    });
    if (!sessionId) {
      // Carrera: el usuario se deshabilitó entre la verificación y la creación de la sesión.
      await this.record(AUTH_AUDIT.loginFailed, { type: 'ANONYMOUS' }, meta, {
        entity: { type: 'user', id: candidate.userId },
        metadata: { reason: 'SESSION_REJECTED' },
      });
      return { ok: false, reason: 'INVALID_CREDENTIALS' };
    }
    await this.record(AUTH_AUDIT.loginSucceeded, { type: 'USER', id: candidate.userId }, meta, {
      entity: { type: 'session', id: sessionId },
      metadata: { paramsUpgraded: rehashed, rotatedPrevious: previousToken !== null },
    });
    return { ok: true, token, userId: candidate.userId, activeTenantId };
  }

  /** Revoca la sesión del token (si estaba activa) y lo audita. */
  async logout(token: string | null, meta: RequestMeta): Promise<void> {
    if (!token) return;
    const revoked = await this.repository.revokeSession(hashToken(token));
    if (!revoked) return;
    await this.record(AUTH_AUDIT.logout, { type: 'USER', id: revoked.userId }, meta, {
      entity: { type: 'session', id: revoked.sessionId },
    });
  }

  /**
   * Usuario, membresías, tenant activo y token CSRF de una sesión. El tenant activo se
   * informa solo si hoy pasa la misma validación que el guard (membresía en un tenant ACTIVE).
   */
  async sessionView(session: {
    readonly userId: string;
    readonly token: string;
    readonly activeTenantId: string | null;
  }): Promise<AuthSessionResponse | null> {
    const identity = await this.tenants.describeUser(session.userId);
    if (!identity) return null;
    const resolution = await this.tenants.resolve({
      userId: session.userId,
      activeTenantId: session.activeTenantId,
    });
    return {
      user: identity.user,
      memberships: identity.memberships.map(
        ({ tenantId, tenantName, tenantSlug, tenantStatus, role }) => ({
          tenantId,
          tenantName,
          tenantSlug,
          tenantStatus,
          role,
        }),
      ),
      activeTenantId: resolution.ok ? resolution.context.tenantId : null,
      csrfToken: deriveCsrfToken(session.token),
    };
  }

  async switchTenant(
    session: CurrentSession,
    tenantId: string,
    meta: RequestMeta,
  ): Promise<SwitchTenantResult> {
    const actor: AuditActor = { type: 'USER', id: session.userId };
    const resolution = await this.tenants.resolve({
      userId: session.userId,
      activeTenantId: tenantId,
    });
    if (!resolution.ok) {
      await this.record(AUTH_AUDIT.tenantSwitchDenied, actor, meta, {
        entity: { type: 'tenant', id: tenantId },
        metadata: { reason: resolution.reason },
      });
      return { ok: false, reason: 'NO_ACTIVE_MEMBERSHIP' };
    }
    if (!(await this.repository.setActiveTenant(session.tokenHash, tenantId))) {
      return { ok: false, reason: 'UNAUTHENTICATED' };
    }
    // Evento del tenant de destino, escrito DENTRO de su contexto (RLS: tenant_id = ese tenant).
    await this.tenantDb.run(resolution.context, () =>
      this.record(AUTH_AUDIT.tenantSwitched, actor, meta, {
        entity: { type: 'tenant', id: tenantId },
        metadata: { role: resolution.context.role },
      }),
    );
    return { ok: true };
  }

  async changePassword(
    session: CurrentSession,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<ChangePasswordResult> {
    const actor: AuditActor = { type: 'USER', id: session.userId };
    const attempt = await this.repository.registerAttempt(
      'CHANGE_PASSWORD',
      session.userId,
      meta.ip,
      this.settings.changePasswordRateLimit,
    );
    if (!attempt.allowed) {
      return {
        ok: false,
        reason: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: attempt.retryAfterSeconds,
      };
    }
    const credentials = await this.repository.sessionCredentials(session.tokenHash);
    if (!credentials) return { ok: false, reason: 'UNAUTHENTICATED' };
    if (!(await this.hasher.verify(credentials.passwordHash, currentPassword))) {
      await this.record(AUTH_AUDIT.passwordChangeFailed, actor, meta, {
        entity: { type: 'user', id: session.userId },
        metadata: { reason: 'BAD_PASSWORD' },
      });
      return { ok: false, reason: 'INVALID_CURRENT_PASSWORD' };
    }
    const newToken = generateToken();
    const changed = await this.repository.changePassword(
      session.tokenHash,
      attempt.attemptId,
      await this.hasher.hash(newPassword),
      hashToken(newToken),
    );
    if (!changed) return { ok: false, reason: 'UNAUTHENTICATED' };
    await this.record(AUTH_AUDIT.passwordChanged, actor, meta, {
      entity: { type: 'user', id: session.userId },
      metadata: { otherSessionsRevoked: true, sessionRotated: true },
    });
    return { ok: true, token: newToken };
  }

  /**
   * Pedido de reset. Misma respuesta y mismo trabajo en la DB exista o no la cuenta; el email
   * se envía en segundo plano para que la latencia del SMTP no delate que la cuenta existe.
   */
  async requestPasswordReset(
    email: string,
    meta: RequestMeta,
  ): Promise<RateLimited | { ok: true }> {
    const attempt = await this.repository.registerAttempt(
      'PASSWORD_RESET',
      email,
      meta.ip,
      this.settings.resetRateLimit,
    );
    if (!attempt.allowed) {
      return {
        ok: false,
        reason: 'TOO_MANY_ATTEMPTS',
        retryAfterSeconds: attempt.retryAfterSeconds,
      };
    }
    const token = generateToken();
    const userId = await this.repository.issuePasswordReset(
      attempt.attemptId,
      email,
      hashToken(token),
      this.settings.resetTtlSeconds,
    );
    await this.record(AUTH_AUDIT.resetRequested, { type: 'ANONYMOUS' }, meta, {
      entity: userId ? { type: 'user', id: userId } : null,
      metadata: { accountFound: userId !== null },
    });
    if (userId) {
      const message = passwordResetMail(
        email,
        this.settings.webBaseUrl,
        token,
        Math.round(this.settings.resetTtlSeconds / 60),
      );
      void this.mail.send(message).catch((error: unknown) => {
        // Sin destinatario ni detalle del servidor SMTP (puede incluir la dirección).
        const code = (error as { code?: unknown }).code;
        this.logger.error(
          { correlationId: meta.correlationId, errorCode: typeof code === 'string' ? code : null },
          'no se pudo enviar el email de reset de contraseña',
        );
      });
    }
    return { ok: true };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<{ ok: true } | Failure<'INVALID_OR_EXPIRED_TOKEN'>> {
    const userId = await this.repository.completePasswordReset(
      hashToken(token),
      await this.hasher.hash(newPassword),
    );
    if (!userId) {
      await this.record(AUTH_AUDIT.resetFailed, { type: 'ANONYMOUS' }, meta, {
        metadata: { reason: 'INVALID_OR_EXPIRED_TOKEN' },
      });
      return { ok: false, reason: 'INVALID_OR_EXPIRED_TOKEN' };
    }
    await this.record(AUTH_AUDIT.resetCompleted, { type: 'USER', id: userId }, meta, {
      entity: { type: 'user', id: userId },
      metadata: { allSessionsRevoked: true },
    });
    return { ok: true };
  }

  private record(
    action: string,
    actor: AuditActor,
    meta: RequestMeta,
    extra: {
      entity?: { type: string; id: string } | null;
      metadata?: AuditMetadata;
    } = {},
  ): Promise<void> {
    return this.audit.record({ action, actor, correlationId: meta.correlationId, ...extra });
  }
}
