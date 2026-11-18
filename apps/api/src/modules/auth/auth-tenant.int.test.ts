import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LoggedInSession, login } from '../../testing/auth-session';
import { expectTenantIsolation } from '../../testing/expect-tenant-isolation';
import { type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { hashToken } from './tokens';

const PASSWORD = 'una contraseña bien larga';

describe('sesión real + tenant activo (PrincipalResolver ↔ TenantGuard de #15)', () => {
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

  /** Usuario con membresía en dos tenants (A: OWNER, B: OPERATOR), con un comercio en cada uno. */
  async function twoTenantUser() {
    const { userId, email } = await seeder.userWithPassword(PASSWORD);
    const tenantA = await seeder.tenant('Empresa A');
    const tenantB = await seeder.tenant('Empresa B');
    await seeder.membership(tenantA, userId, 'OWNER');
    await seeder.membership(tenantB, userId, 'OPERATOR');
    const merchantA = await seeder.merchant(tenantA, 'Comercio A');
    const merchantB = await seeder.merchant(tenantB, 'Comercio B');
    const session = await login(app, email, PASSWORD);
    return { userId, tenantA, tenantB, merchantA, merchantB, session };
  }

  const switchTo = (session: LoggedInSession, tenantId: string) =>
    session.attach(http().post('/api/v1/auth/switch-tenant')).send({ tenantId });
  const getMerchant = (session: LoggedInSession, id: string) =>
    session.attach(http().get(`/api/v1/merchants/${id}`));

  it('una membresía deshabilitada (#18) no aparece en `me` ni se puede elegir', async () => {
    const { userId, email } = await seeder.userWithPassword(PASSWORD);
    const tenantA = await seeder.tenant('Empresa activa');
    const tenantB = await seeder.tenant('Empresa donde lo deshabilitaron');
    await seeder.membership(tenantA, userId, 'OPERATOR');
    const disabled = await seeder.membership(tenantB, userId, 'ADMIN');
    await seeder.setMembershipStatus(disabled, 'DISABLED');

    // Con una sola membresía activa, el login la elige sola.
    const session = await login(app, email, PASSWORD);
    const me = await session.attach(http().get('/api/v1/auth/me')).expect(200);
    expect(me.body.memberships.map((m: { tenantId: string }) => m.tenantId)).toEqual([tenantA]);
    expect(me.body.activeTenantId).toBe(tenantA);

    const res = await switchTo(session, tenantB).expect(403);
    expect(res.body.code).toBe('NO_ACTIVE_MEMBERSHIP');
  });

  it('aislamiento de tenant con sesiones reales (expectTenantIsolation)', async () => {
    const report = await expectTenantIsolation({
      app,
      seeder,
      auth: 'session',
      seed: (tenantId) => seeder.merchant(tenantId, 'Comercio aislado'),
      request: (h, id) => h.get(`/api/v1/merchants/${id}`),
    });
    expect(report.statuses).toEqual({
      'owner -> own resource': 200,
      'intruder -> own resource': 200,
      'intruder -> foreign id': 404,
      'intruder -> foreign id + spoofed tenant hints': 404,
      'intruder session pointing to foreign tenant': 403,
      unauthenticated: 401,
    });
  });

  it('varias membresías: sin tenant elegido no hay acceso; switch-tenant lo fija y cambia el alcance', async () => {
    const { tenantA, tenantB, merchantA, merchantB, session } = await twoTenantUser();
    expect(session.body).toMatchObject({ activeTenantId: null });
    const pending = await getMerchant(session, merchantA).expect(403);
    expect(pending.body).toMatchObject({ code: 'TENANT_SELECTION_REQUIRED' });

    const toA = await switchTo(session, tenantA).expect(200);
    expect(toA.headers['cache-control']).toBe('no-store');
    expect(toA.body).toMatchObject({ activeTenantId: tenantA, csrfToken: session.csrfToken });
    await getMerchant(session, merchantA).expect(200);
    await getMerchant(session, merchantB).expect(404);

    await switchTo(session, tenantB).expect(200);
    await getMerchant(session, merchantB).expect(200);
    await getMerchant(session, merchantA).expect(404);

    const me = await session.attach(http().get('/api/v1/auth/me')).expect(200);
    expect(me.body.activeTenantId).toBe(tenantB);
    expect(me.body.memberships).toHaveLength(2);
  });

  it('switch a un tenant sin membresía → 403 y la sesión conserva su tenant', async () => {
    const { tenantA, merchantA, session } = await twoTenantUser();
    await switchTo(session, tenantA).expect(200);
    const foreign = await seeder.tenantWithMember('OWNER');

    const res = await switchTo(session, foreign.tenantId).expect(403);
    expect(res.body).toEqual({ statusCode: 403, code: 'NO_ACTIVE_MEMBERSHIP' });
    await switchTo(session, '00000000-0000-4000-8000-000000000000').expect(403);
    await getMerchant(session, merchantA).expect(200);
    const [row] = await seeder.query<{ active_tenant_id: string }>(
      'SELECT active_tenant_id FROM sessions WHERE token_hash = $1',
      [hashToken(session.token)],
    );
    expect(row?.active_tenant_id).toBe(tenantA);
  });

  it('switch a un tenant suspendido → 403; /me lo lista como SUSPENDED', async () => {
    const { tenantB, session } = await twoTenantUser();
    await seeder.suspendTenant(tenantB);
    const res = await switchTo(session, tenantB).expect(403);
    expect(res.body).toMatchObject({ code: 'NO_ACTIVE_MEMBERSHIP' });
    const me = await session.attach(http().get('/api/v1/auth/me')).expect(200);
    expect(me.body.memberships).toContainEqual(
      expect.objectContaining({ tenantId: tenantB, tenantStatus: 'SUSPENDED' }),
    );
  });

  it('si el tenant activo se suspende después, el guard lo rechaza y /me ya no lo informa', async () => {
    const { tenantA, merchantA, session } = await twoTenantUser();
    await switchTo(session, tenantA).expect(200);
    await seeder.suspendTenant(tenantA);
    await getMerchant(session, merchantA).expect(403);
    const me = await session.attach(http().get('/api/v1/auth/me')).expect(200);
    expect(me.body.activeTenantId).toBeNull();
  });

  it('body inválido → 400; sin sesión → 401', async () => {
    const { session } = await twoTenantUser();
    await switchTo(session, 'no-es-uuid').expect(400);
    await http()
      .post('/api/v1/auth/switch-tenant')
      .send({ tenantId: '00000000-0000-4000-8000-000000000000' })
      .expect(401);
  });

  it('el cambio de tenant se audita dentro del tenant de destino', async () => {
    const { userId, tenantA, session } = await twoTenantUser();
    await switchTo(session, tenantA).expect(200);
    const rows = await seeder.query<{ tenant_id: string; actor_id: string; metadata: object }>(
      `SELECT tenant_id, actor_id, metadata FROM audit_logs
       WHERE action = 'auth.tenant.switched' AND actor_id = $1`,
      [userId],
    );
    expect(rows).toEqual([{ tenant_id: tenantA, actor_id: userId, metadata: { role: 'OWNER' } }]);
  });
});
