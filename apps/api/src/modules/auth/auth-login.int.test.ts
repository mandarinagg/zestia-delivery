import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, parseSetCookies, sessionFrom } from '../../testing/auth-session';
import { TEST_WEB_ORIGIN, type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { hashToken } from './tokens';

const PASSWORD = 'una contraseña bien larga';

describe('login, sesión y logout (/api/v1/auth)', () => {
  let app: TestApp;
  let seeder: TestSeeder;
  const http = () => request(app.getHttpServer());
  const postLogin = (body: object) =>
    http().post('/api/v1/auth/login').set('Origin', TEST_WEB_ORIGIN).send(body);

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp({ auth: 'session' });
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  async function memberWithPassword(name = 'Ana') {
    const { tenantId, userId } = await seeder.tenantWithMember('OPERATOR');
    await seeder.setPassword(userId, PASSWORD);
    await seeder.query('UPDATE users SET name = $2 WHERE id = $1', [userId, name]);
    return { tenantId, userId, email: TestSeeder.emailOf(userId) };
  }

  it('login correcto: 200, cookie de sesión segura y vista de la sesión', async () => {
    const { tenantId, userId, email } = await memberWithPassword();
    const res = await postLogin({ email, password: PASSWORD }).expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      user: { id: userId, name: 'Ana', email },
      memberships: [
        {
          tenantId,
          tenantName: 'Tenant',
          tenantSlug: `t-${tenantId}`,
          tenantStatus: 'ACTIVE',
          role: 'OPERATOR',
        },
      ],
      // Una sola membresía activa: queda como tenant activo.
      activeTenantId: tenantId,
      csrfToken: expect.any(String),
    });

    const cookies = parseSetCookies(res);
    expect(cookies).toHaveLength(1);
    const [cookie] = cookies;
    expect(cookie?.name).toBe('__Host-zd_session');
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie?.attributes).toEqual({
      path: '/',
      'max-age': String(12 * 3600),
      httponly: true,
      samesite: 'Strict',
      secure: true,
    });
    // El token de la cookie no viaja en el cuerpo y el CSRF no es el token.
    expect(res.text).not.toContain(cookie?.value);

    // En la DB solo está el SHA-256 del token.
    const rows = await seeder.query<{ token_hash: Buffer; text: string }>(
      'SELECT token_hash, row_to_json(s)::text AS text FROM sessions s WHERE user_id = $1',
      [userId],
    );
    expect(rows).toHaveLength(1);
    expect(Buffer.compare(rows[0]!.token_hash, hashToken(cookie!.value))).toBe(0);
    expect(rows[0]!.text).not.toContain(cookie!.value);
  });

  it('el email no distingue mayúsculas ni espacios alrededor', async () => {
    const { email } = await memberWithPassword();
    await postLogin({ email: `  ${email.toUpperCase()} `, password: PASSWORD }).expect(200);
  });

  it('contraseña incorrecta, email desconocido, usuario deshabilitado o sin contraseña: misma respuesta', async () => {
    const wrong = await memberWithPassword();
    const disabled = await memberWithPassword();
    await seeder.setUserStatus(disabled.userId, 'DISABLED');
    const { userId: noPasswordUser } = await seeder.tenantWithMember('OWNER');

    const responses = await Promise.all([
      postLogin({ email: wrong.email, password: 'otra contraseña cualquiera' }),
      postLogin({ email: 'nadie-1f2e3d@test.invalid', password: PASSWORD }),
      postLogin({ email: disabled.email, password: PASSWORD }),
      postLogin({ email: TestSeeder.emailOf(noPasswordUser), password: PASSWORD }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('tiempo parejo: un email desconocido también paga la verificación Argon2', async () => {
    const { email } = await memberWithPassword();
    const time = async (body: object): Promise<number> => {
      const start = performance.now();
      await postLogin(body).expect(401);
      return performance.now() - start;
    };
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 3; i++) {
      known.push(await time({ email, password: `incorrecta-${i}` }));
      unknown.push(await time({ email: `nadie-${i}-${Date.now()}@test.invalid`, password: 'x' }));
    }
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[1]!;
    // Holgado a propósito (CI ruidoso): sin el hash señuelo la diferencia es de ~10x.
    expect(median(unknown)).toBeGreaterThan(median(known) * 0.4);
  });

  it('body inválido: 400 VALIDATION_FAILED sin repetir los valores recibidos', async () => {
    const secret = 'x'.repeat(300);
    const res = await postLogin({ email: 'no-es-email', password: secret }).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    expect(res.text).not.toContain(secret);
    expect(res.text).not.toContain('no-es-email');
    await postLogin({ email: 'a@b.co', password: 'x', extra: true }).expect(400);
  });

  it('GET /me: con sesión 200; sin cookie, con cookie inventada o mal formada 401', async () => {
    const { userId, email } = await memberWithPassword();
    const session = await login(app, email, PASSWORD);
    const me = await session.attach(http().get('/api/v1/auth/me')).expect(200);
    expect(me.body).toMatchObject({ user: { id: userId }, csrfToken: session.csrfToken });

    await http().get('/api/v1/auth/me').expect(401);
    const forged = sessionFrom(session.cookieName, 'A'.repeat(43), 'x');
    const res = await forged.attach(http().get('/api/v1/auth/me')).expect(401);
    expect(res.body).toEqual({ statusCode: 401, code: 'UNAUTHENTICATED' });
    await http()
      .get('/api/v1/auth/me')
      .set('Cookie', `${session.cookieName}=no-es-token`)
      .expect(401);
  });

  it('logout: 204, borra la cookie y la sesión deja de servir (también para endpoints de tenant)', async () => {
    const { tenantId, email } = await memberWithPassword();
    const merchantId = await seeder.merchant(tenantId);
    const session = await login(app, email, PASSWORD);
    await session.attach(http().get(`/api/v1/merchants/${merchantId}`)).expect(200);

    const res = await session.attach(http().post('/api/v1/auth/logout')).expect(204);
    expect(parseSetCookies(res)).toEqual([
      expect.objectContaining({
        name: '__Host-zd_session',
        value: '',
        attributes: expect.objectContaining({ 'max-age': '0' }),
      }),
    ]);
    await session.attach(http().get('/api/v1/auth/me')).expect(401);
    await session.attach(http().get(`/api/v1/merchants/${merchantId}`)).expect(401);
    // Idempotente.
    await session.attach(http().post('/api/v1/auth/logout')).expect(204);
    const [row] = await seeder.query<{ revoked_reason: string }>(
      'SELECT revoked_reason FROM sessions WHERE token_hash = $1',
      [hashToken(session.token)],
    );
    expect(row?.revoked_reason).toBe('LOGOUT');
  });

  it('rotación: un login con una cookie previa revoca esa sesión (anti session fixation)', async () => {
    const { email } = await memberWithPassword();
    const first = await login(app, email, PASSWORD);
    const res = await http()
      .post('/api/v1/auth/login')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', `${first.cookieName}=${first.token}`)
      .send({ email, password: PASSWORD })
      .expect(200);
    const second = parseSetCookies(res)[0]!;
    expect(second.value).not.toBe(first.token);
    await first.attach(http().get('/api/v1/auth/me')).expect(401);
    await http().get('/api/v1/auth/me').set('Cookie', `${second.name}=${second.value}`).expect(200);
  });

  it('vencimiento por inactividad y absoluto; la actividad renueva el de inactividad', async () => {
    const { email } = await memberWithPassword();
    const idle = await login(app, email, PASSWORD);
    const absolute = await login(app, email, PASSWORD);
    const active = await login(app, email, PASSWORD);

    await seeder.query(
      `UPDATE sessions SET idle_expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [hashToken(idle.token)],
    );
    await seeder.query(
      `UPDATE sessions SET absolute_expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [hashToken(absolute.token)],
    );
    await idle.attach(http().get('/api/v1/auth/me')).expect(401);
    await absolute.attach(http().get('/api/v1/auth/me')).expect(401);

    // Actividad: renueva idle_expires_at (como mucho una vez por minuto) hasta el absoluto.
    await seeder.query(
      `UPDATE sessions SET last_seen_at = now() - interval '5 minutes',
              idle_expires_at = now() + interval '1 minute' WHERE token_hash = $1`,
      [hashToken(active.token)],
    );
    await active.attach(http().get('/api/v1/auth/me')).expect(200);
    const [row] = await seeder.query<{ remaining: number }>(
      `SELECT extract(epoch FROM idle_expires_at - now())::int AS remaining
       FROM sessions WHERE token_hash = $1`,
      [hashToken(active.token)],
    );
    expect(row!.remaining).toBeGreaterThan(29 * 60);
    expect(row!.remaining).toBeLessThanOrEqual(30 * 60);
  });

  it('un usuario deshabilitado pierde sus sesiones en la siguiente request', async () => {
    const { userId, email } = await memberWithPassword();
    const session = await login(app, email, PASSWORD);
    await seeder.setUserStatus(userId, 'DISABLED');
    await session.attach(http().get('/api/v1/auth/me')).expect(401);
  });

  it('el usuario sin membresías puede iniciar sesión (sin tenant activo) pero no accede a tenants', async () => {
    const { userId, email } = await seeder.userWithPassword(PASSWORD);
    const session = await login(app, email, PASSWORD);
    expect(session.body).toMatchObject({
      user: { id: userId },
      memberships: [],
      activeTenantId: null,
    });
    const res = await session
      .attach(http().get('/api/v1/merchants/00000000-0000-4000-8000-000000000000'))
      .expect(403);
    expect(res.body).toMatchObject({ code: 'NO_ACTIVE_MEMBERSHIP' });
  });
});

describe('cookie en desarrollo local (SESSION_COOKIE_SECURE=false)', () => {
  let app: TestApp;
  let seeder: TestSeeder;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp({ auth: 'session', env: { SESSION_COOKIE_SECURE: 'false' } });
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  it('sin Secure no puede usar __Host-: cookie zd_session HttpOnly + SameSite=Strict', async () => {
    const { email } = await seeder.userWithPassword(PASSWORD);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const [cookie] = parseSetCookies(res);
    expect(cookie?.name).toBe('zd_session');
    expect(cookie?.attributes).toMatchObject({ httponly: true, samesite: 'Strict', path: '/' });
    expect(cookie?.attributes).not.toHaveProperty('secure');
    // Y una cookie __Host- no se acepta en este modo (ni viceversa).
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `__Host-zd_session=${cookie?.value}`)
      .expect(401);
  });
});
