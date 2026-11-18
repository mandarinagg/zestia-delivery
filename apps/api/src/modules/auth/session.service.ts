import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings';
import { AuthRepository, type SessionRecord } from './auth.repository';
import { readSessionToken } from './session-cookie';
import { hashToken } from './tokens';

/** Sesión válida de la request actual (token en claro solo en memoria, nunca en logs). */
export interface CurrentSession extends SessionRecord {
  readonly token: string;
  readonly tokenHash: Buffer;
}

const CURRENT_SESSION = Symbol('zestia.currentSession');

type RequestWithSession = IncomingMessage & {
  [CURRENT_SESSION]?: Promise<CurrentSession | null>;
};

/**
 * Lee la sesión de la cookie y la valida en la DB (`auth_session_lookup`: no revocada, sin
 * vencer, usuario ACTIVE). El resultado se memoriza en la request: el guard de tenancy y el
 * controller comparten una sola consulta.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly repository: AuthRepository,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  /** Token de la cookie (sin validar contra la DB), o `null`. */
  tokenFrom(req: IncomingMessage): string | null {
    return readSessionToken(req, this.settings.cookieSecure);
  }

  current(req: IncomingMessage): Promise<CurrentSession | null> {
    const request = req as RequestWithSession;
    request[CURRENT_SESSION] ??= this.lookup(req);
    return request[CURRENT_SESSION];
  }

  /** Olvida la sesión memorizada (después de logout, rotación o cambio de tenant). */
  forget(req: IncomingMessage): void {
    delete (req as RequestWithSession)[CURRENT_SESSION];
  }

  private async lookup(req: IncomingMessage): Promise<CurrentSession | null> {
    const token = this.tokenFrom(req);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const record = await this.repository.findSession(tokenHash);
    return record ? { ...record, token, tokenHash } : null;
  }
}
