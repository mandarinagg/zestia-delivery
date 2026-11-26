import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '@zestia/contracts';
import { type LoggedInSession, login } from '../../testing/auth-session';
import { TEST_WEB_ORIGIN, type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';

const PASSWORD = 'una contraseña bien larga';

describe('protección CSRF (guard global)', () => {
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

  async function freshSession(): Promise<LoggedInSession> {
    const { email } = await seeder.userWithPassword(PASSWORD);
    return login(app, email, PASSWORD);
  }

  const withCookie = (s: LoggedInSession, test: request.Test) =>
    test.set('Cookie', `${s.cookieName}=${s.token}`).set('Origin', TEST_WEB_ORIGIN);

  describe('token (requests con cookie de sesión)', () => {
    it('sin X-CSRF-Token → 403 y la sesión sigue activa', async () => {
      const s = await freshSession();
      const res = await withCookie(s, http().post('/api/v1/auth/logout')).expect(403);
      expect(res.body).toEqual({ statusCode: 403, code: 'CSRF_TOKEN_INVALID' });
      await s.attach(http().get('/api/v1/auth/me')).expect(200);
    });

    it('con un token incorrecto o de OTRA sesión → 403', async () => {
      const s = await freshSession();
      const other = await freshSession();
      await withCookie(s, http().post('/api/v1/auth/logout'))
        .set(CSRF_HEADER, 'x'.repeat(43))
        .expect(403);
      await withCookie(s, http().post('/api/v1/auth/logout'))
        .set(CSRF_HEADER, other.csrfToken)
        .expect(403);
      await s.attach(http().get('/api/v1/auth/me')).expect(200);
    });

    it('con el token de la sesión → pasa', async () => {
      const s = await freshSession();
      await withCookie(s, http().post('/api/v1/auth/logout'))
        .set(CSRF_HEADER, s.csrfToken)
        .expect(204);
    });

    it('aplica también a switch-tenant y change-password', async () => {
      const s = await freshSession();
      await withCookie(s, http().post('/api/v1/auth/switch-tenant'))
        .send({ tenantId: '00000000-0000-4000-8000-000000000000' })
        .expect(403);
      await withCookie(s, http().post('/api/v1/auth/change-password'))
        .send({ currentPassword: PASSWORD, newPassword: 'otra contraseña larga' })
        .expect(403);
    });

    it('GET no exige token (no cambia estado)', async () => {
      const s = await freshSession();
      await http().get('/api/v1/auth/me').set('Cookie', `${s.cookieName}=${s.token}`).expect(200);
    });
  });

  describe('Origin / Referer / Sec-Fetch-Site', () => {
    const loginBody = { email: 'nadie@test.invalid', password: 'x' };

    it('Origin no permitido → 403 aunque el endpoint no exija token (login)', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .send(loginBody)
        .expect(403);
      expect(res.body).toEqual({ statusCode: 403, code: 'CSRF_ORIGIN_REJECTED' });
    });

    it('Origin: null → 403', async () => {
      await http().post('/api/v1/auth/login').set('Origin', 'null').send(loginBody).expect(403);
    });

    it('Origin con otro puerto o esquema → 403', async () => {
      await http()
        .post('/api/v1/auth/login')
        .set('Origin', `${TEST_WEB_ORIGIN}:8080`)
        .send(loginBody)
        .expect(403);
      await http()
        .post('/api/v1/auth/login')
        .set('Origin', TEST_WEB_ORIGIN.replace('http:', 'https:'))
        .send(loginBody)
        .expect(403);
    });

    it('sin Origin: Referer de otro sitio → 403; del propio → pasa al endpoint', async () => {
      await http()
        .post('/api/v1/auth/login')
        .set('Referer', 'https://evil.example/pagina')
        .send(loginBody)
        .expect(403);
      await http()
        .post('/api/v1/auth/login')
        .set('Referer', `${TEST_WEB_ORIGIN}/login`)
        .send(loginBody)
        .expect(401);
    });

    it('sin Origin ni Referer: Sec-Fetch-Site cross-site → 403', async () => {
      await http()
        .post('/api/v1/auth/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send(loginBody)
        .expect(403);
    });

    it('un Origin permitido no reemplaza el token cuando hay cookie de sesión', async () => {
      const s = await freshSession();
      await withCookie(s, http().post('/api/v1/auth/logout')).expect(403);
    });

    it('cliente sin cabeceras de navegador (curl) llega al endpoint', async () => {
      await http().post('/api/v1/auth/login').send(loginBody).expect(401);
    });
  });

  describe('solo JSON', () => {
    it('un formulario (x-www-form-urlencoded o text/plain) → 415', async () => {
      const s = await freshSession();
      const { email } = await seeder.userWithPassword(PASSWORD);
      const res = await http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(`email=${encodeURIComponent(email)}&password=${encodeURIComponent(PASSWORD)}`)
        .expect(415);
      expect(res.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
      await s
        .attach(http().post('/api/v1/auth/switch-tenant'))
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify({ tenantId: '00000000-0000-4000-8000-000000000000' }))
        .expect(415);
    });
  });
});
