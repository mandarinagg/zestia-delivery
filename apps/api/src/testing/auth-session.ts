import type { INestApplication } from '@nestjs/common';
import request, { type Response, type Test } from 'supertest';
import { CSRF_HEADER } from '@zestia/contracts';
import { TEST_WEB_ORIGIN } from './test-app';

/** Cookie `Set-Cookie` parseada (nombre, valor y atributos en minúsculas). */
export interface ParsedSetCookie {
  readonly name: string;
  readonly value: string;
  readonly attributes: Readonly<Record<string, string | true>>;
}

export function parseSetCookies(res: Response): ParsedSetCookie[] {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return list.map((line) => {
    const [pair = '', ...attrs] = line.split(';').map((p) => p.trim());
    const eq = pair.indexOf('=');
    const attributes: Record<string, string | true> = {};
    for (const attr of attrs) {
      const i = attr.indexOf('=');
      if (i === -1) attributes[attr.toLowerCase()] = true;
      else attributes[attr.slice(0, i).toLowerCase()] = attr.slice(i + 1);
    }
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes };
  });
}

/** Sesión real obtenida con `POST /api/v1/auth/login`. */
export interface LoggedInSession {
  readonly cookieName: string;
  readonly token: string;
  readonly csrfToken: string;
  readonly body: Record<string, unknown>;
  /** Agrega la cookie (y, en métodos que cambian estado, Origin + X-CSRF-Token). */
  attach(test: Test, options?: { csrf?: boolean }): Test;
}

export function sessionFrom(
  cookieName: string,
  token: string,
  csrfToken: string,
  body: Record<string, unknown> = {},
): LoggedInSession {
  return {
    cookieName,
    token,
    csrfToken,
    body,
    attach(test, options = {}) {
      const withCookie = test.set('Cookie', `${cookieName}=${token}`);
      return options.csrf === false
        ? withCookie
        : withCookie.set('Origin', TEST_WEB_ORIGIN).set(CSRF_HEADER, csrfToken);
    },
  };
}

/** Login real; falla el test si no responde 200 con cookie de sesión. */
export async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<LoggedInSession> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', TEST_WEB_ORIGIN)
    .send({ email, password });
  if (res.status !== 200) throw new Error(`login falló: ${res.status} ${res.text}`);
  const cookie = parseSetCookies(res).find((c) => c.value.length > 0);
  if (!cookie) throw new Error('login sin cookie de sesión');
  const body = res.body as Record<string, unknown>;
  return sessionFrom(cookie.name, cookie.value, String(body.csrfToken), body);
}
