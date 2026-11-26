import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Tokens opacos (sesión y reset de contraseña): 32 bytes del CSPRNG (256 bits) en base64url.
 * En la DB solo se guarda su SHA-256: alcanza para secretos de alta entropía (no hace falta
 * un hash lento) y una fuga de la tabla no permite usar las sesiones.
 */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Token CSRF ligado a la sesión: HMAC-SHA256 con el token de sesión como clave. Sin el token
 * de sesión (cookie HttpOnly, que un sitio atacante no puede leer) no se puede calcular, y
 * conocerlo no revela el token de sesión. No se guarda: se recalcula en cada request.
 */
export function deriveCsrfToken(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update('zestia-csrf-v1').digest('base64url');
}

/** Comparación de strings en tiempo constante (longitudes distintas → false). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
