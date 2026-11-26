import { randomInt } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login } from '../../testing/auth-session';
import { TEST_WEB_ORIGIN, type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder, testDatabaseUrls } from '../../testing/test-database';

const PASSWORD = 'una contraseña bien larga';
const NEW_PASSWORD = 'otra contraseña distinta';

interface AuditRow {
  tenant_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
  json: string;
}

describe('auditoría de autenticación', () => {
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

  it('cada evento deja una fila, sin PII ni secretos', async () => {
    const userId = await seeder.user('Ana');
    const email = TestSeeder.emailOf(userId);
    await seeder.setPassword(userId, PASSWORD);
    const tenantA = await seeder.tenant();
    const tenantB = await seeder.tenant();
    await seeder.membership(tenantA, userId, 'OWNER');
    await seeder.membership(tenantB, userId, 'ADMIN');
    const foreign = await seeder.tenant();
    const ip = `10.99.${randomInt(256)}.${randomInt(1, 255)}`;
    const unknownEmail = `fantasma-${randomInt(1e9)}@test.invalid`;
    const correlationId = `corr-${randomInt(1e9)}`;
    const secrets: string[] = [email, unknownEmail, PASSWORD, NEW_PASSWORD, ip, 'clave-equivocada'];

    const post = (path: string) =>
      http().post(path).set('Origin', TEST_WEB_ORIGIN).set('X-Forwarded-For', ip);

    // login fallido (cuenta existente y desconocida), login ok, cambio de tenant ok y denegado
    await post('/api/v1/auth/login').send({ email, password: 'clave-equivocada' }).expect(401);
    await post('/api/v1/auth/login').send({ email: unknownEmail, password: 'x' }).expect(401);
    const session = await login(app, email, PASSWORD);
    secrets.push(session.token, session.csrfToken);
    await session
      .attach(http().post('/api/v1/auth/switch-tenant'))
      .set('x-request-id', correlationId)
      .send({ tenantId: tenantA })
      .expect(200);
    await session
      .attach(http().post('/api/v1/auth/switch-tenant'))
      .send({ tenantId: foreign })
      .expect(403);
    // cambio de contraseña fallido y exitoso
    await session
      .attach(http().post('/api/v1/auth/change-password'))
      .send({ currentPassword: 'clave-equivocada', newPassword: NEW_PASSWORD })
      .expect(400);
    const changed = await session
      .attach(http().post('/api/v1/auth/change-password'))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    const rotated = await login(app, email, NEW_PASSWORD);
    secrets.push(String(changed.body.csrfToken), rotated.token);
    // logout
    await rotated.attach(http().post('/api/v1/auth/logout')).expect(204);
    // reset: pedido (cuenta existente y desconocida), fallido y completado
    await post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    await post('/api/v1/auth/forgot-password').send({ email: unknownEmail }).expect(202);
    const mail = await app.mail.waitFor(email);
    const token = /#token=([A-Za-z0-9_-]{43})/.exec(mail.text)![1]!;
    secrets.push(token);
    await post('/api/v1/auth/reset-password')
      .send({ token: 'B'.repeat(43), password: PASSWORD })
      .expect(400);
    await post('/api/v1/auth/reset-password').send({ token, password: PASSWORD }).expect(204);

    const since = await seeder.query<{ t: Date }>(
      `SELECT min(occurred_at) AS t FROM audit_logs WHERE entity_id = $1 OR actor_id::text = $1`,
      [userId],
    );
    const rows = await seeder.query<AuditRow>(
      `SELECT tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata,
              correlation_id, row_to_json(a)::text AS json
       FROM audit_logs a WHERE occurred_at >= $1 ORDER BY occurred_at, id`,
      [since[0]!.t],
    );
    const mine = rows.filter(
      (r) =>
        r.actor_id === userId ||
        r.entity_id === userId ||
        (r.entity_type === 'tenant' && [tenantA, foreign].includes(r.entity_id ?? '')) ||
        // eventos anónimos sin entidad de esta corrida: login/reset de la cuenta desconocida
        (r.actor_type === 'ANONYMOUS' && r.entity_id === null),
    );

    const pick = (action: string) => mine.filter((r) => r.action === action);
    expect(pick('auth.login.failed').map((r) => r.metadata.reason)).toEqual(
      expect.arrayContaining(['BAD_PASSWORD', 'UNKNOWN_ACCOUNT']),
    );
    expect(pick('auth.login.succeeded')).toHaveLength(2);
    expect(pick('auth.login.succeeded')[0]).toMatchObject({
      tenant_id: null,
      actor_type: 'USER',
      actor_id: userId,
      entity_type: 'session',
    });
    expect(pick('auth.tenant.switched')).toEqual([
      expect.objectContaining({
        tenant_id: tenantA,
        actor_id: userId,
        correlation_id: correlationId,
      }),
    ]);
    expect(pick('auth.tenant.switch_denied')).toEqual([
      expect.objectContaining({
        tenant_id: null,
        entity_id: foreign,
        metadata: { reason: 'NO_ACTIVE_MEMBERSHIP' },
      }),
    ]);
    expect(pick('auth.password.change_failed')).toHaveLength(1);
    expect(pick('auth.password.changed')).toHaveLength(1);
    expect(pick('auth.logout')).toEqual([
      expect.objectContaining({ actor_id: userId, entity_type: 'session' }),
    ]);
    expect(pick('auth.password_reset.requested').map((r) => r.metadata.accountFound)).toEqual(
      expect.arrayContaining([true, false]),
    );
    expect(pick('auth.password_reset.failed').length).toBeGreaterThanOrEqual(1);
    expect(pick('auth.password_reset.completed')).toEqual([
      expect.objectContaining({ actor_type: 'USER', actor_id: userId, entity_id: userId }),
    ]);
    // Todas las filas llevan correlationId (el de pino-http) y ninguna contiene PII/secretos.
    for (const row of mine) {
      expect(row.correlation_id, row.action).toEqual(expect.any(String));
      for (const secret of secrets) expect(row.json, row.action).not.toContain(secret);
    }
  });

  it('la API no puede modificar ni borrar la auditoría; ni el dueño de la tabla ni el superusuario', async () => {
    const appPool = new pg.Pool({ connectionString: testDatabaseUrls().app, max: 1 });
    const migrator = new pg.Pool({ connectionString: testDatabaseUrls().migrator, max: 1 });
    const code = async (p: Promise<unknown>) =>
      p.then(() => 'ok').catch((e: { code?: string }) => e.code);
    const tenantId = await seeder.tenant();
    await seeder.query(
      `INSERT INTO audit_logs (tenant_id, actor_type, action) VALUES ($1, 'SYSTEM', 'test.row')`,
      [tenantId],
    );
    try {
      expect(await code(appPool.query(`UPDATE audit_logs SET action = 'x.y'`))).toBe('42501');
      expect(await code(appPool.query('DELETE FROM audit_logs'))).toBe('42501');
      expect(await code(appPool.query('TRUNCATE audit_logs'))).toBe('42501');
      // Sin contexto la API no puede insertar filas de un tenant ni leer las de nadie.
      expect(
        await code(
          appPool.query(
            `INSERT INTO audit_logs (tenant_id, actor_type, action) VALUES (gen_random_uuid(), 'SYSTEM', 'x.y')`,
          ),
        ),
      ).toBe('42501');
      const { rows } = await appPool.query('SELECT count(*)::int AS n FROM audit_logs');
      expect(rows[0].n).toBe(0);
      // El migrador (dueño), aun viendo la fila de su tenant: UPDATE/DELETE no tienen política
      // (RLS forzada → 0 filas) y TRUNCATE, que no pasa por RLS, lo frena el trigger.
      const asOwner = async (sql: string): Promise<number | null> => {
        const client = await migrator.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
          const seen = await client.query('SELECT count(*)::int AS n FROM audit_logs');
          expect(seen.rows[0].n).toBe(1);
          const result = await client.query(sql);
          await client.query('COMMIT');
          return result.rowCount;
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
          client.release();
        }
      };
      expect(await asOwner('DELETE FROM audit_logs')).toBe(0);
      expect(await asOwner(`UPDATE audit_logs SET action = 'x.y'`)).toBe(0);
      expect(await code(asOwner('TRUNCATE audit_logs'))).toBe('42501');
      // El superusuario se saltea RLS, pero no el trigger.
      expect(
        await code(seeder.query('DELETE FROM audit_logs WHERE tenant_id = $1', [tenantId])),
      ).toBe('42501');
      expect(
        await code(
          seeder.query(`UPDATE audit_logs SET action = 'x.y' WHERE tenant_id = $1`, [tenantId]),
        ),
      ).toBe('42501');
      const left = await seeder.query('SELECT action FROM audit_logs WHERE tenant_id = $1', [
        tenantId,
      ]);
      expect(left).toEqual([{ action: 'test.row' }]);
    } finally {
      await appPool.end();
      await migrator.end();
    }
  });
});
