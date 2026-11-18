import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestSeeder, testDatabaseUrls } from '../../testing/test-database';

/**
 * Aislamiento a nivel de base de datos, conectando como `zestia_app` (el rol de la API) con
 * `pg` directo: prueba las políticas RLS independientemente de Prisma y de NestJS.
 */

const INSUFFICIENT_PRIVILEGE = '42501'; // RLS (new row violates...), permiso denegado, no es dueño

type Client = pg.PoolClient;

async function inScope<T>(
  pool: pg.Pool,
  scope: { tenantId?: string; userId?: string },
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
      [scope.tenantId ?? '', scope.userId ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
  return undefined;
}

describe('RLS en Postgres (rol zestia_app)', () => {
  let seeder: TestSeeder;
  let app: pg.Pool;
  let admin: pg.Pool;
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;
  let membershipB: string;
  let merchantA: string;
  let merchantB: string;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = new pg.Pool({ connectionString: testDatabaseUrls().app, max: 5 });
    admin = new pg.Pool({ connectionString: testDatabaseUrls().admin, max: 1 });
    tenantA = await seeder.tenant('A');
    tenantB = await seeder.tenant('B');
    userA = await seeder.user('Ana');
    userB = await seeder.user('Beto');
    await seeder.membership(tenantA, userA, 'OWNER');
    membershipB = await seeder.membership(tenantB, userB, 'OWNER');
    merchantA = await seeder.merchant(tenantA, 'Comercio A');
    merchantB = await seeder.merchant(tenantB, 'Comercio B');
  });

  afterAll(async () => {
    await app.end();
    await admin.end();
    await seeder.close();
  });

  describe('rol de la aplicación', () => {
    it('no es superusuario ni tiene BYPASSRLS, CREATEROLE o CREATEDB', async () => {
      const { rows } = await app.query(
        `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
         FROM pg_roles WHERE rolname = current_user`,
      );
      expect(rows).toEqual([
        { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false },
      ]);
    });

    it('no es dueño de tablas, funciones, tipos ni del esquema', async () => {
      const { rows } = await app.query(
        `SELECT
           (SELECT count(*) FROM pg_class WHERE relowner = r.oid)::int AS tables,
           (SELECT count(*) FROM pg_proc WHERE proowner = r.oid)::int AS functions,
           (SELECT count(*) FROM pg_type WHERE typowner = r.oid)::int AS types,
           (SELECT count(*) FROM pg_namespace WHERE nspowner = r.oid)::int AS schemas,
           (SELECT count(*) FROM pg_auth_members WHERE member = r.oid)::int AS role_memberships
         FROM pg_roles r WHERE rolname = current_user`,
      );
      expect(rows[0]).toEqual({
        tables: 0,
        functions: 0,
        types: 0,
        schemas: 0,
        role_memberships: 0,
      });
    });

    it('no puede desactivar RLS ni saltearla con row_security = off', async () => {
      expect(await pgErrorCode(app.query('ALTER TABLE merchants DISABLE ROW LEVEL SECURITY'))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(
        await pgErrorCode(app.query('ALTER TABLE merchants NO FORCE ROW LEVEL SECURITY')),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      const code = await pgErrorCode(
        inScope(app, {}, async (c) => {
          await c.query('SET LOCAL row_security = off');
          return c.query('SELECT * FROM merchants');
        }),
      );
      expect(code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('no puede asumir otros roles ni leer la tabla de migraciones', async () => {
      expect(await pgErrorCode(app.query('SET ROLE zestia_migrator'))).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await pgErrorCode(app.query('SELECT * FROM _prisma_migrations'))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    });
  });

  describe('catálogo', () => {
    it('toda tabla con tenant_id tiene RLS habilitada, forzada y al menos una política', async () => {
      const { rows } = await admin.query(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                (SELECT count(*) FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS policies
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
         ORDER BY c.relname`,
      );
      expect(rows.map((r) => r.relname)).toEqual(['memberships', 'merchants']);
      for (const row of rows) {
        expect(row, row.relname).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
        expect(row.policies, row.relname).toBeGreaterThan(0);
      }
    });

    it('toda tabla accesible por zestia_app tiene RLS forzada', async () => {
      const { rows } = await admin.query(
        `SELECT c.relname, c.relrowsecurity AND c.relforcerowsecurity AS forced
         FROM pg_class c
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
           AND has_table_privilege('zestia_app', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         ORDER BY c.relname`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.forced, row.relname).toBe(true);
    });

    it('las políticas de tablas de negocio usan app_current_tenant_id() en USING y WITH CHECK', async () => {
      const { rows } = await admin.query(
        `SELECT tablename, cmd, qual, with_check FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'merchants'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ cmd: 'ALL' });
      expect(rows[0].qual).toContain('app_current_tenant_id()');
      expect(rows[0].with_check).toContain('app_current_tenant_id()');
    });
  });

  describe('sin contexto de tenant (fail-closed)', () => {
    it('cero filas en todas las tablas, sin error', async () => {
      for (const table of ['merchants', 'memberships', 'tenants', 'users']) {
        const { rows } = await app.query(`SELECT count(*)::int AS n FROM ${table}`);
        expect(rows[0].n, table).toBe(0);
      }
    });

    it('cero filas cuando el valor quedó vacío tras un SET LOCAL terminado en la misma conexión', async () => {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        await client.query('COMMIT');
        const { rows } = await client.query(
          `SELECT current_setting('app.tenant_id', true) AS raw, count(*)::int AS n FROM merchants`,
        );
        expect(rows[0]).toEqual({ raw: '', n: 0 });
      } finally {
        client.release();
      }
    });

    it('un valor que no es UUID produce error, nunca filas', async () => {
      const code = await pgErrorCode(
        inScope(app, { tenantId: 'not-a-uuid' }, (c) => c.query('SELECT * FROM merchants')),
      );
      expect(code).toBe('22P02'); // invalid_text_representation
    });

    it('rechaza INSERT sin tenant activo', async () => {
      const code = await pgErrorCode(
        inScope(app, {}, (c) =>
          c.query(
            'INSERT INTO merchants (id, tenant_id, name) VALUES (gen_random_uuid(), $1, $2)',
            [tenantA, 'x'],
          ),
        ),
      );
      expect(code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe('tenant A frente a filas del tenant B', () => {
    it('A solo ve sus comercios', async () => {
      const rows = await inScope(app, { tenantId: tenantA, userId: userA }, async (c) => {
        const res = await c.query('SELECT id, tenant_id FROM merchants');
        return res.rows;
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);
      expect(rows.map((r) => r.id)).toContain(merchantA);
      expect(rows.map((r) => r.id)).not.toContain(merchantB);
    });

    it('A no puede leer la fila de B aunque conozca el id', async () => {
      const { rowCount } = await inScope(app, { tenantId: tenantA }, (c) =>
        c.query('SELECT * FROM merchants WHERE id = $1', [merchantB]),
      );
      expect(rowCount).toBe(0);
    });

    it('A no puede modificar ni borrar la fila de B por id', async () => {
      const updated = await inScope(app, { tenantId: tenantA }, (c) =>
        c.query(`UPDATE merchants SET name = 'hackeado' WHERE id = $1`, [merchantB]),
      );
      const deleted = await inScope(app, { tenantId: tenantA }, (c) =>
        c.query('DELETE FROM merchants WHERE id = $1', [merchantB]),
      );
      expect(updated.rowCount).toBe(0);
      expect(deleted.rowCount).toBe(0);
      const { rows } = await admin.query('SELECT name FROM merchants WHERE id = $1', [merchantB]);
      expect(rows).toEqual([{ name: 'Comercio B' }]);
    });

    it('WITH CHECK rechaza insertar con tenant_id ajeno', async () => {
      const code = await pgErrorCode(
        inScope(app, { tenantId: tenantA }, (c) =>
          c.query(
            'INSERT INTO merchants (id, tenant_id, name) VALUES (gen_random_uuid(), $1, $2)',
            [tenantB, 'intruso'],
          ),
        ),
      );
      expect(code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('WITH CHECK rechaza mover una fila propia a otro tenant', async () => {
      const code = await pgErrorCode(
        inScope(app, { tenantId: tenantA }, (c) =>
          c.query('UPDATE merchants SET tenant_id = $1 WHERE id = $2', [tenantB, merchantA]),
        ),
      );
      expect(code).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('A puede insertar en su propio tenant (control)', async () => {
      const { rowCount } = await inScope(app, { tenantId: tenantA }, (c) =>
        c.query('INSERT INTO merchants (id, tenant_id, name) VALUES (gen_random_uuid(), $1, $2)', [
          tenantA,
          'nuevo',
        ]),
      );
      expect(rowCount).toBe(1);
    });

    it('memberships: A no ve ni borra membresías de B', async () => {
      const { seen, deleted } = await inScope(
        app,
        { tenantId: tenantA, userId: userA },
        async (c) => {
          const seenRes = await c.query('SELECT tenant_id FROM memberships');
          const deletedRes = await c.query('DELETE FROM memberships WHERE id = $1', [membershipB]);
          return { seen: seenRes.rows, deleted: deletedRes.rowCount };
        },
      );
      expect(seen.every((r) => r.tenant_id === tenantA)).toBe(true);
      expect(deleted).toBe(0);
    });

    it('tenants y users: con tenant A solo se ve el tenant A y sus miembros', async () => {
      const { tenants, users } = await inScope(
        app,
        { tenantId: tenantA, userId: userA },
        async (c) => ({
          tenants: (await c.query('SELECT id FROM tenants')).rows.map((r) => r.id),
          users: (await c.query('SELECT id FROM users')).rows.map((r) => r.id),
        }),
      );
      expect(tenants).toEqual([tenantA]);
      expect(users).toContain(userA);
      expect(users).not.toContain(userB);
    });

    it('resolución de membresía (solo app.user_id): ve únicamente las membresías propias', async () => {
      const rows = await inScope(app, { userId: userB }, async (c) => {
        return (await c.query('SELECT user_id, tenant_id FROM memberships')).rows;
      });
      expect(rows).toEqual([{ user_id: userB, tenant_id: tenantB }]);
    });
  });

  describe('pool de conexiones', () => {
    it('el tenant de una transacción no se filtra a la siguiente operación en la misma conexión', async () => {
      const single = new pg.Pool({ connectionString: testDatabaseUrls().app, max: 1 });
      try {
        const pidInTx = await inScope(single, { tenantId: tenantA }, async (c) => {
          const res = await c.query(
            'SELECT pg_backend_pid() AS pid, count(*)::int AS n FROM merchants',
          );
          expect(res.rows[0].n).toBeGreaterThan(0);
          return res.rows[0].pid;
        });
        const after = await single.query(
          'SELECT pg_backend_pid() AS pid, app_current_tenant_id() AS tenant, count(*)::int AS n FROM merchants',
        );
        expect(after.rows[0]).toEqual({ pid: pidInTx, tenant: null, n: 0 });
      } finally {
        await single.end();
      }
    });

    it('tampoco se filtra tras un ROLLBACK', async () => {
      const single = new pg.Pool({ connectionString: testDatabaseUrls().app, max: 1 });
      try {
        await expect(
          inScope(single, { tenantId: tenantA }, async () => {
            throw new Error('falla a propósito');
          }),
        ).rejects.toThrow('falla a propósito');
        const after = await single.query('SELECT count(*)::int AS n FROM merchants');
        expect(after.rows[0].n).toBe(0);
      } finally {
        await single.end();
      }
    });
  });

  describe('concurrencia', () => {
    it('transacciones concurrentes de tenants distintos quedan aisladas', async () => {
      const runs = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? tenantA : tenantB));
      const results = await Promise.all(
        runs.map((tenantId) =>
          inScope(app, { tenantId }, async (c) => {
            await c.query('SELECT pg_sleep(random() * 0.02)');
            const res = await c.query(
              'SELECT app_current_tenant_id() AS ctx, array_agg(DISTINCT tenant_id) AS tenants FROM merchants',
            );
            return { expected: tenantId, ...res.rows[0] };
          }),
        ),
      );
      for (const r of results) {
        expect(r.ctx).toBe(r.expected);
        expect(r.tenants).toEqual([r.expected]);
      }
    });
  });
});
