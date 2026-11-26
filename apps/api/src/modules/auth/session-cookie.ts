import type { IncomingMessage, ServerResponse } from 'node:http';
import { TOKEN_RE } from './tokens';

/**
 * Cookie de sesión:
 *  - `HttpOnly` (el JS del frontend no la lee), `SameSite=Strict`, `Path=/`, sin `Domain`;
 *  - con `Secure` usa el prefijo `__Host-` (el navegador exige Secure, Path=/ y sin Domain:
 *    un subdominio no puede pisarla). Sin Secure (solo desarrollo en http://localhost) el
 *    prefijo no es válido y se usa el nombre simple;
 *  - `Max-Age` = vencimiento absoluto de la sesión (el servidor además vence por inactividad).
 *
 * `SameSite=Strict` alcanza porque el panel es una SPA que llama a la API con fetch desde el
 * mismo sitio; ninguna navegación entrante necesita la sesión. Ver docs/SECURITY.md.
 */
export const SESSION_COOKIE_SECURE_NAME = '__Host-zd_session';
export const SESSION_COOKIE_DEV_NAME = 'zd_session';

export interface SessionCookieOptions {
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
}

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_SECURE_NAME : SESSION_COOKIE_DEV_NAME;
}

function serialize(name: string, value: string, secure: boolean, maxAge: number): string {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function appendSetCookie(res: ServerResponse, cookie: string): void {
  const current = res.getHeader('set-cookie');
  const list = Array.isArray(current) ? current : current ? [String(current)] : [];
  res.setHeader('set-cookie', [...list, cookie]);
}

export function setSessionCookie(
  res: ServerResponse,
  token: string,
  options: SessionCookieOptions,
): void {
  const name = sessionCookieName(options.secure);
  appendSetCookie(res, serialize(name, token, options.secure, options.maxAgeSeconds));
}

export function clearSessionCookie(res: ServerResponse, secure: boolean): void {
  appendSetCookie(res, serialize(sessionCookieName(secure), '', secure, 0));
}

/**
 * Lee el token de sesión de la cabecera Cookie. Solo acepta el nombre que corresponde a la
 * configuración (con Secure, nunca el nombre sin prefijo) y un valor con el formato de token.
 * Si la cookie aparece repetida, no se elige ninguna (posible inyección de cookies).
 */
export function readSessionToken(req: IncomingMessage, secure: boolean): string | null {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || header.length === 0 || header.length > 8_192) return null;
  const name = sessionCookieName(secure);
  const values = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  if (values.length !== 1) return null;
  const [value] = values;
  return value !== undefined && TOKEN_RE.test(value) ? value : null;
}
