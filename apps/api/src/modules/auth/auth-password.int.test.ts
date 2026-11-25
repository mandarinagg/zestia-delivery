import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '@zestia/contracts';
import { login, parseSetCookies, sessionFrom } from '../../testing/auth-session';
import { TEST_WEB_ORIGIN, type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { hashToken } from './tokens';

const PASSWORD = 'una contraseña bien larga';
const NEW_PASSWORD = 'otra contraseña distinta';

/** Extrae el token del enlace `…/restablecer-contrasena#token=<token>` del email. */
function tokenFromMail(text: string): string {
  const match = /\/restablecer-contrasena#token=([A-Za-z0-9_-]{43})/.exec(text);
  if (!match?.[1]) throw new Error('el email no trae el enlace de reset');
  return match[1];
}

describe('olvido y reset de contraseña', () => {
  let app: TestApp;
  let seeder: TestSeeder;
  const http = () => request(app.getHttpServer());
  const forgot = (email: string) =>
    http().post('/api/v1/auth/forgot-password').set('Origin', TEST_WEB_ORIGIN).send({ email });
  const reset = (token: string, password: string) =>
    http()
      .post('/api/v1/auth/reset-password')
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ token, password });
  const tryLogin = (email: string, password: string) =>
    http().post('/api/v1/auth/login').set('Origin', TEST_WEB_ORIGIN).send({ email, password });

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp({ auth: 'session' });
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  it('misma respuesta exista o no la cuenta (o esté deshabilitada); email solo a la activa', async () => {
    const active = await seeder.userWithPassword(PASSWORD);
    const disabled = await seeder.userWithPassword(PASSWORD);
    await seeder.setUserStatus(disabled.userId, 'DISABLED');
    const unknown = `nadie-${randomInt(1e9)}@test.invalid`;

    const responses = await Promise.all([
      forgot(active.email),
      forgot(unknown),
      forgot(disabled.email),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual({
        message:
          'Si el email corresponde a una cuenta activa, te enviamos un enlace para restablecer la contraseña.',
      });
    }
    const mail = await app.mail.waitFor(active.email);
    expect(mail.subject).toMatch(/restablecer/i);
    expect(mail.text).toContain(`${TEST_WEB_ORIGIN}/restablecer-contrasena#token=`);
    expect(mail.html).toContain(tokenFromMail(mail.text));
    await new Promise((r) => setTimeout(r, 100));
    expect(app.mail.to(unknown)).toEqual([]);
    expect(app.mail.to(disabled.email)).toEqual([]);

    // En la DB solo el hash del token, con vencimiento corto (30 min por defecto).
    const rows = await seeder.query<{ token_hash: Buffer; ttl: number }>(
      `SELECT token_hash, extract(epoch FROM expires_at - created_at)::int AS ttl
       FROM password_reset_tokens WHERE user_id = $1`,
      [active.userId],
    );
    expect(rows).toHaveLength(1);
    expect(Buffer.compare(rows[0]!.token_hash, hashToken(tokenFromMail(mail.text)))).toBe(0);
    expect(rows[0]!.ttl).toBe(30 * 60);
  });

  it('flujo completo: el reset cambia la contraseña, revoca TODAS las sesiones y el token es de un solo uso', async () => {
    const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
    await seeder.setPassword(userId, PASSWORD);
    const email = TestSeeder.emailOf(userId);
    const merchantId = await seeder.merchant(tenantId);
    const s1 = await login(app, email, PASSWORD);
    const s2 = await login(app, email, PASSWORD);

    await forgot(email).expect(202);
    const token = tokenFromMail((await app.mail.waitFor(email)).text);

    // Reset desde el navegador con la sesión s1: se borra su cookie.
    const res = await reset(token, NEW_PASSWORD)
      .set('Cookie', `${s1.cookieName}=${s1.token}`)
      .expect(204);
    expect(parseSetCookies(res)[0]).toMatchObject({ value: '', attributes: { 'max-age': '0' } });

    for (const s of [s1, s2]) {
      await s.attach(http().get('/api/v1/auth/me')).expect(401);
      await s.attach(http().get(`/api/v1/merchants/${merchantId}`)).expect(401);
    }
    const revoked = await seeder.query<{ revoked_reason: string }>(
      'SELECT revoked_reason FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(revoked.map((r) => r.revoked_reason)).toEqual(['PASSWORD_RESET', 'PASSWORD_RESET']);

    await tryLogin(email, PASSWORD).expect(401);
    await tryLogin(email, NEW_PASSWORD).expect(200);

    const again = await reset(token, 'una tercera contraseña').expect(400);
    expect(again.body).toEqual({ statusCode: 400, code: 'INVALID_OR_EXPIRED_TOKEN' });
    await tryLogin(email, NEW_PASSWORD).expect(200);
  });

  it('token vencido → 400 y la contraseña no cambia', async () => {
    const { userId, email } = await seeder.userWithPassword(PASSWORD);
    await forgot(email).expect(202);
    const token = tokenFromMail((await app.mail.waitFor(email)).text);
    await seeder.query(
      `UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1`,
      [userId],
    );
    await reset(token, NEW_PASSWORD).expect(400);
    await tryLogin(email, PASSWORD).expect(200);
  });

  it('un pedido nuevo invalida el token anterior', async () => {
    const { email } = await seeder.userWithPassword(PASSWORD);
    await forgot(email).expect(202);
    const first = tokenFromMail((await app.mail.waitFor(email)).text);
    await forgot(email).expect(202);
    await expect.poll(() => app.mail.to(email).length).toBe(2);
    const second = tokenFromMail(app.mail.to(email)[1]!.text);
    await reset(first, NEW_PASSWORD).expect(400);
    await reset(second, NEW_PASSWORD).expect(204);
  });

  it('token inventado o mal formado; contraseña nueva fuera de política → 400', async () => {
    await reset('A'.repeat(43), NEW_PASSWORD).expect(400);
    const bad = await reset('corto', NEW_PASSWORD).expect(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    const { email } = await seeder.userWithPassword(PASSWORD);
    await forgot(email).expect(202);
    const token = tokenFromMail((await app.mail.waitFor(email)).text);
    const weak = await reset(token, 'corta').expect(400);
    expect(weak.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    // El token sigue sirviendo: la validación no lo consumió.
    await reset(token, NEW_PASSWORD).expect(204);
  });

  it('rate limit del pedido por cuenta (3 por hora por defecto) → 429', async () => {
    const email = `limite-${randomInt(1e9)}@test.invalid`;
    for (let i = 0; i < 3; i++) await forgot(email).expect(202);
    const res = await forgot(email).expect(429);
    expect(res.body).toEqual({ statusCode: 429, code: 'TOO_MANY_ATTEMPTS' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('cambio de contraseña (autenticado)', () => {
  let app: TestApp;
  let seeder: TestSeeder;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp({ auth: 'session' });
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  it('con la contraseña actual: rota la sesión, revoca las demás y la nueva contraseña funciona', async () => {
    const { userId, email } = await seeder.userWithPassword(PASSWORD);
    const current = await login(app, email, PASSWORD);
    const otherDevice = await login(app, email, PASSWORD);

    const res = await current
      .attach(http().post('/api/v1/auth/change-password'))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    const [cookie] = parseSetCookies(res);
    expect(cookie?.name).toBe(current.cookieName);
    expect(cookie?.value).not.toBe(current.token);
    expect(res.body.csrfToken).not.toBe(current.csrfToken);
    // La sesión rotada trae el tiempo restante (inactividad renovada, absoluto igual).
    expect(Number(res.headers['x-session-idle-remaining'])).toBeGreaterThan(29 * 60);
    expect(Number(res.headers['x-session-absolute-remaining'])).toBeGreaterThan(12 * 3600 - 60);

    const rotated = sessionFrom(cookie!.name, cookie!.value, res.body.csrfToken as string);
    await rotated.attach(http().get('/api/v1/auth/me')).expect(200);
    await current.attach(http().get('/api/v1/auth/me')).expect(401);
    await otherDevice.attach(http().get('/api/v1/auth/me')).expect(401);
    // El token CSRF viejo ya no sirve con la cookie nueva.
    await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', `${cookie!.name}=${cookie!.value}`)
      .set('Origin', TEST_WEB_ORIGIN)
      .set(CSRF_HEADER, current.csrfToken)
      .expect(403);

    const reasons = await seeder.query<{ revoked_reason: string | null }>(
      'SELECT revoked_reason FROM sessions WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    expect(reasons.map((r) => r.revoked_reason)).toEqual([null, 'PASSWORD_CHANGED']);

    await http()
      .post('/api/v1/auth/login')
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(401);
    await login(app, email, NEW_PASSWORD);
  });

  it('contraseña actual incorrecta → 400 y nada cambia; sin sesión → 401', async () => {
    const { email } = await seeder.userWithPassword(PASSWORD);
    const s = await login(app, email, PASSWORD);
    const res = await s
      .attach(http().post('/api/v1/auth/change-password'))
      .send({ currentPassword: 'no es la actual', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, code: 'INVALID_CURRENT_PASSWORD' });
    await s.attach(http().get('/api/v1/auth/me')).expect(200);
    await login(app, email, PASSWORD);

    await http()
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it('adivinar la contraseña actual con una sesión robada está limitado (429)', async () => {
    const { email } = await seeder.userWithPassword(PASSWORD);
    const s = await login(app, email, PASSWORD);
    for (let i = 0; i < 5; i++) {
      await s
        .attach(http().post('/api/v1/auth/change-password'))
        .send({ currentPassword: `intento-${i}`, newPassword: NEW_PASSWORD })
        .expect(400);
    }
    await s
      .attach(http().post('/api/v1/auth/change-password'))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(429);
  });
});
