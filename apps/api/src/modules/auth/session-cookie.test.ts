import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_DEV_NAME,
  SESSION_COOKIE_SECURE_NAME,
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from './session-cookie';
import { deriveCsrfToken, generateToken, hashToken, safeEqual } from './tokens';

function fakeResponse(): ServerResponse & { cookies(): string[] } {
  const headers = new Map<string, unknown>();
  return {
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    setHeader: (name: string, value: unknown) => headers.set(name.toLowerCase(), value),
    cookies: () => (headers.get('set-cookie') as string[] | undefined) ?? [],
  } as unknown as ServerResponse & { cookies(): string[] };
}

const req = (cookie?: string): IncomingMessage =>
  ({ headers: cookie === undefined ? {} : { cookie } }) as IncomingMessage;

describe('tokens', () => {
  it('token opaco de 256 bits en base64url, hash SHA-256 de 32 bytes', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
    expect(hashToken(token)).toHaveLength(32);
  });

  it('el token CSRF es determinístico por sesión y distinto entre sesiones', () => {
    const a = generateToken();
    const b = generateToken();
    expect(deriveCsrfToken(a)).toBe(deriveCsrfToken(a));
    expect(deriveCsrfToken(a)).not.toBe(deriveCsrfToken(b));
    expect(deriveCsrfToken(a)).not.toContain(a);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('cookie de sesión', () => {
  it('con Secure: prefijo __Host-, HttpOnly, SameSite=Strict, Path=/, sin Domain', () => {
    const res = fakeResponse();
    setSessionCookie(res, 'tok', { secure: true, maxAgeSeconds: 600 });
    expect(res.cookies()).toEqual([
      `${SESSION_COOKIE_SECURE_NAME}=tok; Path=/; Max-Age=600; HttpOnly; SameSite=Strict; Secure`,
    ]);
  });

  it('sin Secure (desarrollo): nombre sin prefijo', () => {
    const res = fakeResponse();
    setSessionCookie(res, 'tok', { secure: false, maxAgeSeconds: 600 });
    clearSessionCookie(res, false);
    expect(res.cookies()).toEqual([
      `${SESSION_COOKIE_DEV_NAME}=tok; Path=/; Max-Age=600; HttpOnly; SameSite=Strict`,
      `${SESSION_COOKIE_DEV_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
    ]);
  });

  it('lee solo el nombre configurado y un token bien formado', () => {
    const token = generateToken();
    expect(readSessionToken(req(`a=1; ${SESSION_COOKIE_SECURE_NAME}=${token}`), true)).toBe(token);
    // Con Secure nunca acepta la cookie sin prefijo (la podría plantar un subdominio).
    expect(readSessionToken(req(`${SESSION_COOKIE_DEV_NAME}=${token}`), true)).toBeNull();
    expect(readSessionToken(req(`${SESSION_COOKIE_DEV_NAME}=${token}`), false)).toBe(token);
    expect(readSessionToken(req(`${SESSION_COOKIE_SECURE_NAME}=no-es-token`), true)).toBeNull();
    expect(readSessionToken(req(), true)).toBeNull();
  });

  it('cookie repetida (posible inyección) → ninguna', () => {
    const cookie = `${SESSION_COOKIE_SECURE_NAME}=${generateToken()}; ${SESSION_COOKIE_SECURE_NAME}=${generateToken()}`;
    expect(readSessionToken(req(cookie), true)).toBeNull();
  });
});
