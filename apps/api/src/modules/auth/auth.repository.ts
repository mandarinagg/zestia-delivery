import { Injectable } from '@nestjs/common';
import type { UserStatus } from '../../generated/prisma/enums';
import { TenantDb, type TenantTx } from '../tenancy';

export type AttemptKind = 'LOGIN' | 'PASSWORD_RESET' | 'CHANGE_PASSWORD';

export interface RateLimitPolicy {
  readonly windowSeconds: number;
  readonly maxPerAccount: number;
  readonly maxPerIp: number;
}

export type AttemptRegistration =
  | { readonly allowed: true; readonly attemptId: string }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface LoginCandidate {
  readonly userId: string;
  readonly passwordHash: string | null;
  readonly status: UserStatus;
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly activeTenantId: string | null;
  /** Segundos hasta el vencimiento por inactividad, ya renovado y sin pasar el absoluto. */
  readonly idleRemainingSeconds: number;
  /** Segundos hasta el vencimiento absoluto. */
  readonly absoluteRemainingSeconds: number;
}

export interface NewSession {
  readonly attemptId: string;
  readonly tokenHash: Buffer;
  readonly idleSeconds: number;
  readonly absoluteSeconds: number;
  readonly activeTenantId: string | null;
  /** Hash del token de sesión que traía el navegador (se revoca: rotación en el login). */
  readonly replacedTokenHash: Buffer | null;
  /** Hash nuevo si los parámetros de Argon2 cambiaron. */
  readonly rehash: string | null;
}

/**
 * Acceso a las tablas de autenticación EXCLUSIVAMENTE a través de las funciones
 * `SECURITY DEFINER` de la migración `*_auth_sessions` (el rol de la app no tiene GRANT sobre
 * esas tablas). Cada llamada corre en una transacción sin tenant (`TenantDb.runUnscoped`).
 * SQL solo con tagged templates (parametrizado).
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly db: TenantDb) {}

  private run<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.db.runUnscoped(fn);
  }

  async registerAttempt(
    kind: AttemptKind,
    account: string,
    ip: string,
    policy: RateLimitPolicy,
  ): Promise<AttemptRegistration> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<
          { attempt_id: string | null; allowed: boolean; retry_after_seconds: number }[]
        >`
        SELECT attempt_id, allowed, retry_after_seconds
        FROM auth_attempt_register(${kind}::auth_attempt_kind, ${account}, ${ip},
          ${policy.windowSeconds}::int, ${policy.maxPerAccount}::int, ${policy.maxPerIp}::int)`,
    );
    const row = rows[0];
    if (!row) throw new Error('auth_attempt_register no devolvió resultado');
    if (row.allowed && row.attempt_id) return { allowed: true, attemptId: row.attempt_id };
    return { allowed: false, retryAfterSeconds: Math.max(1, row.retry_after_seconds) };
  }

  async loginLookup(attemptId: string, email: string): Promise<LoginCandidate | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ user_id: string; password_hash: string | null; user_status: UserStatus }[]>`
        SELECT user_id, password_hash, user_status
        FROM auth_login_lookup(${attemptId}::uuid, ${email})`,
    );
    const row = rows[0];
    return row
      ? { userId: row.user_id, passwordHash: row.password_hash, status: row.user_status }
      : null;
  }

  async loginComplete(session: NewSession): Promise<string | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ session_id: string | null }[]>`
        SELECT auth_login_complete(${session.attemptId}::uuid, ${session.tokenHash}::bytea,
          ${session.idleSeconds}::int, ${session.absoluteSeconds}::int,
          ${session.activeTenantId}::uuid, ${session.replacedTokenHash}::bytea,
          ${session.rehash}::text) AS session_id`,
    );
    return rows[0]?.session_id ?? null;
  }

  /** Con `renew = false` valida y devuelve los restantes sin alargar la sesión (`session-status`). */
  async findSession(tokenHash: Buffer, renew = true): Promise<SessionRecord | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<
          {
            session_id: string;
            user_id: string;
            active_tenant_id: string | null;
            idle_remaining_seconds: number;
            absolute_remaining_seconds: number;
          }[]
        >`
        SELECT session_id, user_id, active_tenant_id, idle_remaining_seconds,
               absolute_remaining_seconds
        FROM auth_session_lookup(${tokenHash}::bytea, ${renew}::boolean)`,
    );
    const row = rows[0];
    return row
      ? {
          sessionId: row.session_id,
          userId: row.user_id,
          activeTenantId: row.active_tenant_id,
          idleRemainingSeconds: row.idle_remaining_seconds,
          absoluteRemainingSeconds: row.absolute_remaining_seconds,
        }
      : null;
  }

  async revokeSession(tokenHash: Buffer): Promise<{ sessionId: string; userId: string } | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ session_id: string; user_id: string }[]>`
        SELECT session_id, user_id FROM auth_session_revoke(${tokenHash}::bytea)`,
    );
    const row = rows[0];
    return row ? { sessionId: row.session_id, userId: row.user_id } : null;
  }

  async setActiveTenant(tokenHash: Buffer, tenantId: string): Promise<boolean> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ ok: boolean }[]>`
        SELECT auth_session_set_active_tenant(${tokenHash}::bytea, ${tenantId}::uuid) AS ok`,
    );
    return rows[0]?.ok === true;
  }

  async sessionCredentials(
    tokenHash: Buffer,
  ): Promise<{ userId: string; passwordHash: string | null } | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ user_id: string; password_hash: string | null }[]>`
        SELECT user_id, password_hash FROM auth_session_credentials(${tokenHash}::bytea)`,
    );
    const row = rows[0];
    return row ? { userId: row.user_id, passwordHash: row.password_hash } : null;
  }

  async changePassword(
    tokenHash: Buffer,
    attemptId: string,
    newPasswordHash: string,
    newTokenHash: Buffer,
  ): Promise<string | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ user_id: string | null }[]>`
        SELECT auth_change_password(${tokenHash}::bytea, ${attemptId}::uuid,
          ${newPasswordHash}::text, ${newTokenHash}::bytea) AS user_id`,
    );
    return rows[0]?.user_id ?? null;
  }

  async issuePasswordReset(
    attemptId: string,
    email: string,
    tokenHash: Buffer,
    ttlSeconds: number,
  ): Promise<string | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ user_id: string | null }[]>`
        SELECT auth_password_reset_issue(${attemptId}::uuid, ${email}, ${tokenHash}::bytea,
          ${ttlSeconds}::int) AS user_id`,
    );
    return rows[0]?.user_id ?? null;
  }

  async completePasswordReset(tokenHash: Buffer, newPasswordHash: string): Promise<string | null> {
    const rows = await this.run(
      (tx) =>
        tx.$queryRaw<{ user_id: string | null }[]>`
        SELECT auth_password_reset_complete(${tokenHash}::bytea, ${newPasswordHash}::text) AS user_id`,
    );
    return rows[0]?.user_id ?? null;
  }
}
