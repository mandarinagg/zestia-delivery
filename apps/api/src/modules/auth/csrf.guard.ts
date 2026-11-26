import type { IncomingMessage } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_HEADER } from '@zestia/contracts';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings';
import { readSessionToken } from './session-cookie';
import { deriveCsrfToken, safeEqual } from './tokens';

export const SKIP_CSRF_TOKEN = 'zestia:skip-csrf-token';

/**
 * Endpoint que cambia estado SIN exigir el token CSRF (solo login, olvido y reset de
 * contraseña: todavía no hay sesión ni token). El chequeo de Origin se aplica igual.
 */
export const SkipCsrfToken = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_CSRF_TOKEN, reason);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? null : parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Protección CSRF global (APP_GUARD) para toda request que cambia estado (no GET/HEAD/OPTIONS):
 *
 *  1. **Origen**: si viene `Origin`, debe estar en `APP_ORIGINS` (`Origin: null` se rechaza);
 *     si no viene, se mira `Referer`; si tampoco, se rechaza `Sec-Fetch-Site: cross-site`.
 *     Clientes que no son navegadores (curl, integraciones) no mandan estas cabeceras y pasan:
 *     no son un vector de CSRF porque no llevan la cookie de la víctima.
 *  2. **Token** (si la request trae cookie de sesión): cabecera `X-CSRF-Token` igual a
 *     HMAC(token de sesión) — ver `deriveCsrfToken`. Un sitio atacante no puede calcularlo
 *     porque no puede leer la cookie HttpOnly. Excepción: `@SkipCsrfToken()`.
 *
 *  3. **Solo JSON** en cuerpos (ver `checkJsonBody`): un formulario HTML de otro sitio no puede
 *     mandar `application/json` sin preflight CORS, que la API no habilita.
 *
 * Complementa `SameSite=Strict` de la cookie de sesión.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    if (SAFE_METHODS.has((req.method ?? 'GET').toUpperCase())) return true;

    this.checkOrigin(req);
    this.checkJsonBody(req);

    const skip = this.reflector.getAllAndOverride<string | undefined>(SKIP_CSRF_TOKEN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip !== undefined) return true;

    const sessionToken = readSessionToken(req, this.settings.cookieSecure);
    // Sin cookie de sesión la request no está autenticada por cookie: no hay CSRF posible
    // (el endpoint responderá 401 si necesita sesión).
    if (!sessionToken) return true;

    const header = req.headers[CSRF_HEADER];
    if (typeof header !== 'string' || !safeEqual(header, deriveCsrfToken(sessionToken))) {
      throw new ForbiddenException({ statusCode: 403, code: 'CSRF_TOKEN_INVALID' });
    }
    return true;
  }

  /**
   * Solo JSON: Express también parsea `application/x-www-form-urlencoded`, que un formulario
   * HTML de otro sitio puede enviar sin preflight. Una request con cuerpo que no es JSON → 415.
   */
  private checkJsonBody(req: IncomingMessage): void {
    const length = req.headers['content-length'];
    const hasBody =
      (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined;
    if (!hasBody) return;
    const type = req.headers['content-type'] ?? '';
    if (!/^application\/json\s*(;|$)/i.test(type)) {
      throw new UnsupportedMediaTypeException({ statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    }
  }

  private checkOrigin(req: IncomingMessage): void {
    const reject = (): never => {
      throw new ForbiddenException({ statusCode: 403, code: 'CSRF_ORIGIN_REJECTED' });
    };
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!this.settings.allowedOrigins.has(origin)) reject();
      return;
    }
    const referer = req.headers.referer;
    if (referer !== undefined) {
      const refererOrigin = originOf(referer);
      if (!refererOrigin || !this.settings.allowedOrigins.has(refererOrigin)) reject();
      return;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') reject();
  }
}
