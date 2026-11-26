import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARGON2_PARAMS, needsRehash, verifyPassword } from '../modules/auth/password-hashing';
import { login } from '../testing/auth-session';
import { type TestApp, createTestApp } from '../testing/test-app';
import { TestSeeder, testDatabaseUrls } from '../testing/test-database';
import { SEED, SEED_ARGON2, hashDevPassword, seed } from './dev-seed.mjs';

const DEV_PASSWORD = 'solo-desarrollo-local';

describe('pnpm db:seed (datos de desarrollo)', () => {
  let app: TestApp;
  let seeder: TestSeeder;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp({ auth: 'session' });
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  it('hashea igual que la app (mismos parámetros, verificable, sin re-hash)', async () => {
    expect(SEED_ARGON2).toEqual(ARGON2_PARAMS);
    const hash = await hashDevPassword(DEV_PASSWORD);
    expect(await verifyPassword(hash, DEV_PASSWORD)).toBe(true);
    expect(needsRehash(hash)).toBe(false);
  });

  it('es idempotente y deja usuarios que pueden iniciar sesión (uno en ambos tenants)', async () => {
    await seed(testDatabaseUrls().admin, DEV_PASSWORD);
    await seed(testDatabaseUrls().admin, DEV_PASSWORD);

    const [counts] = await seeder.query<{ tenants: number; users: number; memberships: number }>(
      `SELECT (SELECT count(*)::int FROM tenants WHERE slug LIKE 'demo-%') AS tenants,
              (SELECT count(*)::int FROM users WHERE email LIKE '%@zestia.test') AS users,
              (SELECT count(*)::int FROM memberships m JOIN users u ON u.id = m.user_id
               WHERE u.email LIKE '%@zestia.test') AS memberships`,
    );
    expect(counts).toEqual({
      tenants: SEED.tenants.length,
      users: SEED.users.length,
      memberships: SEED.memberships.length,
    });

    const ana = await login(app, 'ana@zestia.test', DEV_PASSWORD);
    expect(ana.body.memberships).toHaveLength(2);
    expect(ana.body.activeTenantId).toBeNull();
    const beto = await login(app, 'beto@zestia.test', DEV_PASSWORD);
    expect(beto.body.activeTenantId).toBe(SEED.tenants[0].id);
    await beto
      .attach(request(app.getHttpServer()).get(`/api/v1/merchants/${SEED.merchants[0].id}`))
      .expect(200);
    await beto
      .attach(request(app.getHttpServer()).get(`/api/v1/merchants/${SEED.merchants[1].id}`))
      .expect(404);
    // La usuaria deshabilitada no entra.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'eva@zestia.test', password: DEV_PASSWORD })
      .expect(401);
  });
});
