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
    // Sesión nueva: tiempo restante completo (así el panel sabe cuándo avisar sin otro pedido).
    expect(res.headers['x-session-idle-remaining']).toBe(String(30 * 60));
    expect(res.headers['x-session-absolute-remaining']).toBe(String(12 * 3600));
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

  describe('tiempo restante de la sesión (headers X-Session-*-Remaining)', () => {
    const IDLE = 'x-session-idle-remaining';
    const ABSOLUTE = 'x-session-absolute-remaining';
    const MERCHANTS = '/api/v1/merchants/00000000-0000-4000-8000-000000000000';
    const seconds = (value: unknown): number => {
      expect(value).toMatch(/^\d+$/);
      return Number(value);
    };

    it('van en /auth/me y en una ruta de tenant, con la renovación ya aplicada', async () => {
      const { email } = await memberWithPassword();
      const session = await login(app, email, PASSWORD);
      // Última actividad vieja: este pedido renueva (idle vuelve a 30 min).
      await seeder.query(
        `UPDATE sessions SET last_seen_at = now() - interval '5 minutes',
                idle_expires_at = now() + interval '90 seconds' WHERE token_hash = $1`,
        [hashToken(session.token)],
      );

      const me = await session.attach(http().get('/api/v1/auth/me')).expect(200);
      expect(seconds(me.headers[IDLE])).toBeGreaterThan(29 * 60);
      // `idle_expires_at` guarda milisegundos y redondea hacia arriba: con `ceil` puede sobrar 1 s.
      expect(seconds(me.headers[IDLE])).toBeLessThanOrEqual(30 * 60 + 1);
      // Absoluto: 12 h desde el login (menos unos segundos).
      expect(seconds(me.headers[ABSOLUTE])).toBeGreaterThan(12 * 3600 - 60);
      expect(seconds(me.headers[ABSOLUTE])).toBeLessThanOrEqual(12 * 3600 + 1);

      // Ruta de tenant: el comercio no existe (404), pero la sesión es válida: lleva los headers.
      const tenant = await session.attach(http().get(MERCHANTS)).expect(404);
      expect(seconds(tenant.headers[IDLE])).toBeGreaterThan(29 * 60);
      expect(seconds(tenant.headers[ABSOLUTE])).toBeGreaterThan(12 * 3600 - 60);
    });

    it('sin actividad nueva (dentro del minuto) informa el vencimiento real, sin renovar', async () => {
      const { email } = await memberWithPassword();
      const session = await login(app, email, PASSWORD);
      await seeder.query(
        `UPDATE sessions SET idle_expires_at = now() + interval '100 seconds' WHERE token_hash = $1`,
        [hashToken(session.token)],
      );
      const res = await session.attach(http().get('/api/v1/auth/me')).expect(200);
      expect(seconds(res.headers[IDLE])).toBeGreaterThan(95);
      expect(seconds(res.headers[IDLE])).toBeLessThanOrEqual(100);
    });

    it('el de inactividad nunca supera el absoluto', async () => {
      const { email } = await memberWithPassword();
      const session = await login(app, email, PASSWORD);
      await seeder.query(
        `UPDATE sessions SET last_seen_at = now() - interval '5 minutes',
                absolute_expires_at = now() + interval '45 seconds' WHERE token_hash = $1`,
        [hashToken(session.token)],
      );
      const res = await session.attach(http().get('/api/v1/auth/me')).expect(200);
      const idle = seconds(res.headers[IDLE]);
      const absolute = seconds(res.headers[ABSOLUTE]);
      expect(absolute).toBeGreaterThan(40);
      expect(absolute).toBeLessThanOrEqual(45);
      expect(idle).toBeLessThanOrEqual(absolute);
    });

    describe('GET /auth/session-status (consulta sin renovar)', () => {
      const STATUS = '/api/v1/auth/session-status';
      const timesOf = async (token: string) => {
        const [row] = await seeder.query<{ idle: string; seen: string }>(
          `SELECT idle_expires_at::text AS idle, last_seen_at::text AS seen
           FROM sessions WHERE token_hash = $1`,
          [hashToken(token)],
        );
        return row!;
      };
      /** Última actividad vieja (fuera de la regla de 60 s) y 90 s de inactividad por delante. */
      const agedSession = async (token: string) => {
        await seeder.query(
          `UPDATE sessions SET last_seen_at = now() - interval '5 minutes',
                  idle_expires_at = now() + interval '90 seconds' WHERE token_hash = $1`,
          [hashToken(token)],
        );
        return timesOf(token);
      };

      it('204 con los headers y SIN tocar idle_expires_at ni last_seen_at', async () => {
        const { email } = await memberWithPassword();
        const session = await login(app, email, PASSWORD);
        const before = await agedSession(session.token);

        const res = await session.attach(http().get(STATUS)).expect(204);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.text).toBe('');
        expect(seconds(res.headers[IDLE])).toBeGreaterThan(85);
        expect(seconds(res.headers[IDLE])).toBeLessThanOrEqual(90);
        expect(await timesOf(session.token)).toEqual(before);
      });

      it('en cambio /auth/me y una ruta normal SÍ renuevan (misma sesión, mismo estado de partida)', async () => {
        const { email } = await memberWithPassword();
        const viaMe = await login(app, email, PASSWORD);
        const viaTenant = await login(app, email, PASSWORD);
        const beforeMe = await agedSession(viaMe.token);
        const beforeTenant = await agedSession(viaTenant.token);

        await viaMe.attach(http().get('/api/v1/auth/me')).expect(200);
        await viaTenant.attach(http().get(MERCHANTS)).expect(404);

        for (const [token, before] of [
          [viaMe.token, beforeMe],
          [viaTenant.token, beforeTenant],
        ] as const) {
          const after = await timesOf(token);
          expect(after.idle).not.toBe(before.idle);
          expect(after.seen).not.toBe(before.seen);
        }
        const res = await viaMe.attach(http().get(STATUS)).expect(204);
        expect(seconds(res.headers[IDLE])).toBeGreaterThan(29 * 60);
      });

      it('401 sin sesión, con sesión vencida y sin renovarla antes de vencer del todo', async () => {
        const { email } = await memberWithPassword();
        const expired = await login(app, email, PASSWORD);
        await seeder.query(
          `UPDATE sessions SET idle_expires_at = now() - interval '1 second' WHERE token_hash = $1`,
          [hashToken(expired.token)],
        );
        for (const res of [
          await http().get(STATUS).expect(401),
          await expired.attach(http().get(STATUS)).expect(401),
        ]) {
          expect(res.headers[IDLE]).toBeUndefined();
          expect(res.headers[ABSOLUTE]).toBeUndefined();
        }
      });

      it('solo habla de la sesión propia: sin cuerpo y con los tiempos de quien pregunta', async () => {
        const a = await memberWithPassword('Ana');
        const b = await memberWithPassword('Beto');
        const sessionA = await login(app, a.email, PASSWORD);
        const sessionB = await login(app, b.email, PASSWORD);
        await seeder.query(
          `UPDATE sessions SET absolute_expires_at = now() + interval '1000 seconds' WHERE token_hash = $1`,
          [hashToken(sessionA.token)],
        );
        await seeder.query(
          `UPDATE sessions SET absolute_expires_at = now() + interval '5000 seconds' WHERE token_hash = $1`,
          [hashToken(sessionB.token)],
        );

        const resA = await sessionA.attach(http().get(STATUS)).expect(204);
        const resB = await sessionB.attach(http().get(STATUS)).expect(204);
        expect(seconds(resA.headers[ABSOLUTE])).toBeLessThanOrEqual(1000);
        expect(seconds(resA.headers[ABSOLUTE])).toBeGreaterThan(990);
        expect(seconds(resB.headers[ABSOLUTE])).toBeGreaterThan(4990);
        for (const res of [resA, resB]) {
          expect(res.text).toBe('');
          expect(Object.keys(res.headers).filter((h) => /user|tenant|email/i.test(h))).toEqual([]);
        }
        // Una cookie de otra persona no sirve: no hay forma de preguntar por una sesión ajena.
        await http()
          .get(STATUS)
          .set('Cookie', `${sessionA.cookieName}=${'x'.repeat(43)}`)
          .expect(401);
      });
    });

    it('no aparecen sin sesión ni con una sesión vencida', async () => {
      const { email } = await memberWithPassword();
      const expired = await login(app, email, PASSWORD);
      await seeder.query(
        `UPDATE sessions SET idle_expires_at = now() - interval '1 second' WHERE token_hash = $1`,
        [hashToken(expired.token)],
      );
      const anonymous = [
        await http().get('/api/v1/auth/me').expect(401),
        await http().get(MERCHANTS).expect(401),
        await expired.attach(http().get('/api/v1/auth/me')).expect(401),
        await expired.attach(http().get(MERCHANTS)).expect(401),
      ];
      for (const res of anonymous) {
        expect(res.headers[IDLE]).toBeUndefined();
        expect(res.headers[ABSOLUTE]).toBeUndefined();
      }
    });
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
