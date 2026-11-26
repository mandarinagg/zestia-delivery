import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestSeeder, testDatabaseUrls } from '../../testing/test-database';
import { hashPassword } from './password-hashing';
import { generateToken, hashToken } from './tokens';

/**
 * Las funciones SECURITY DEFINER de autenticación, atacadas DIRECTAMENTE como `zestia_app`
 * (lo que podría hacer una inyección SQL o un bug en la API): no deben permitir leer datos de
 * otros usuarios, enumerar sesiones/hashes ni saltearse el rate limit.
 */

const AUTH_TABLES = ['user_credentials', 'sessions', 'auth_attempts', 'password_reset_tokens'];
const DEFINER_FUNCTIONS = [
  'auth_attempt_register',
  'auth_change_password',
  'auth_invitation_accept',
  'auth_invitation_peek',
  'auth_login_complete',
  'auth_login_lookup',
  'auth_password_reset_complete',
  'auth_password_reset_issue',
  'auth_session_credentials',
  'auth_session_lookup',
  'auth_session_revoke',
  'auth_session_set_active_tenant',
];

describe('funciones SECURITY DEFINER de autenticación (rol zestia_app)', () => {
  let app: pg.Pool;
  let seeder: TestSeeder;
  const policy = [900, 5, 10_000] as const;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = new pg.Pool({ connectionString: testDatabaseUrls().app, max: 3 });
  });

  afterAll(async () => {
    await app.end();
    await seeder.close();
  });

  const errorCode = (p: Promise<unknown>) =>
    p.then(() => 'ok').catch((e: { code?: string }) => e.code ?? 'unknown');
  const ip = () => `192.0.2.${randomInt(1, 255)}`;

  async function register(kind: string, account: string): Promise<string> {
    const { rows } = await app.query(
      'SELECT attempt_id, allowed FROM auth_attempt_register($1, $2, $3, $4, $5, $6)',
      [kind, account, ip(), ...policy],
    );
    expect(rows[0].allowed).toBe(true);
    return rows[0].attempt_id as string;
  }

  async function userWithHash() {
    const { userId, email } = await seeder.userWithPassword('una contraseña bien larga');
    const [row] = await seeder.query<{ password_hash: string }>(
      'SELECT password_hash FROM user_credentials WHERE user_id = $1',
      [userId],
    );
    return { userId, email, hash: row!.password_hash };
  }

  async function sessionFor(userId: string): Promise<string> {
    const token = generateToken();
    await seeder.query(
      `INSERT INTO sessions (user_id, token_hash, idle_timeout_seconds, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, 1800, now() + interval '30 minutes', now() + interval '12 hours')`,
      [userId, hashToken(token)],
    );
    return token;
  }

  describe('catálogo y privilegios', () => {
    it('zestia_app no tiene ningún privilegio sobre las tablas de autenticación', async () => {
      for (const table of AUTH_TABLES) {
        expect(await errorCode(app.query(`SELECT * FROM ${table} LIMIT 1`)), table).toBe('42501');
        const [privileges] = await seeder.query<{ any: boolean }>(
          `SELECT has_table_privilege('zestia_app', $1,
             'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any`,
          [table],
        );
        expect(privileges?.any, table).toBe(false);
      }
      // users sigue siendo de solo lectura por RLS (sin columnas de credenciales).
      expect(await errorCode(app.query(`UPDATE users SET name = 'x'`))).toBe('42501');
      const { rows } = await app.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
      );
      expect(rows.map((r) => r.column_name)).not.toContain('password_hash');
    });

    it('cada función: SECURITY DEFINER, del migrador, search_path fijo, sin EXECUTE para PUBLIC', async () => {
      const rows = await seeder.query<{
        proname: string;
        prosecdef: boolean;
        owner: string;
        proconfig: string[] | null;
        public_exec: boolean;
        app_exec: boolean;
        migrator_bypass: boolean;
      }>(
        `SELECT p.proname, p.prosecdef, r.rolname AS owner, p.proconfig,
                EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec,
                has_function_privilege('zestia_app', p.oid, 'EXECUTE') AS app_exec,
                r.rolbypassrls OR r.rolsuper AS migrator_bypass
         FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
         WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
         ORDER BY p.proname`,
      );
      // No hay más funciones SECURITY DEFINER que estas.
      expect(rows.map((r) => r.proname)).toEqual(DEFINER_FUNCTIONS);
      for (const fn of rows) {
        expect(fn, fn.proname).toMatchObject({
          owner: 'zestia_migrator',
          public_exec: false,
          app_exec: true,
          migrator_bypass: false,
        });
        expect(fn.proconfig, fn.proname).toEqual(['search_path=pg_catalog, public, pg_temp']);
      }
    });

    it('zestia_app no puede crear objetos que secuestren el search_path', async () => {
      expect(await errorCode(app.query('CREATE TABLE public.users2 (id int)'))).toBe('42501');
      expect(await errorCode(app.query('CREATE TEMP TABLE sessions (id int)'))).toBe('42501');
      expect(
        await errorCode(
          app.query(
            'CREATE FUNCTION public.sha256(bytea) RETURNS bytea AS $$ SELECT $1 $$ LANGUAGE sql',
          ),
        ),
      ).toBe('42501');
    });
  });

  describe('lectura de hashes por email (login)', () => {
    it('sin un intento registrado no devuelve nada', async () => {
      const { email } = await userWithHash();
      const { rows } = await app.query('SELECT * FROM auth_login_lookup(gen_random_uuid(), $1)', [
        email,
      ]);
      expect(rows).toEqual([]);
    });

    it('un intento para el email X no sirve para leer el hash de Y', async () => {
      const x = await userWithHash();
      const y = await userWithHash();
      const attempt = await register('LOGIN', x.email);
      const { rows } = await app.query('SELECT * FROM auth_login_lookup($1, $2)', [
        attempt,
        y.email,
      ]);
      expect(rows).toEqual([]);
    });

    it('una lectura por intento; un intento viejo (> 2 min) no sirve', async () => {
      const { email, hash, userId } = await userWithHash();
      const attempt = await register('LOGIN', email);
      const first = await app.query('SELECT * FROM auth_login_lookup($1, $2)', [attempt, email]);
      expect(first.rows).toEqual([{ user_id: userId, password_hash: hash, user_status: 'ACTIVE' }]);
      const second = await app.query('SELECT * FROM auth_login_lookup($1, $2)', [attempt, email]);
      expect(second.rows).toEqual([]);

      const old = await register('LOGIN', email);
      await seeder.query(
        `UPDATE auth_attempts SET attempted_at = now() - interval '3 minutes' WHERE id = $1`,
        [old],
      );
      const stale = await app.query('SELECT * FROM auth_login_lookup($1, $2)', [old, email]);
      expect(stale.rows).toEqual([]);
    });

    it('un intento de otro tipo (reset / cambio) no sirve para leer hashes', async () => {
      const { email } = await userWithHash();
      const attempt = await register('PASSWORD_RESET', email);
      const { rows } = await app.query('SELECT * FROM auth_login_lookup($1, $2)', [attempt, email]);
      expect(rows).toEqual([]);
    });

    it('la cantidad de lecturas está acotada por el rate limit de la cuenta', async () => {
      const { email } = await userWithHash();
      let reads = 0;
      for (let i = 0; i < 10; i++) {
        const { rows } = await app.query(
          'SELECT attempt_id, allowed FROM auth_attempt_register($1, $2, $3, $4, $5, $6)',
          ['LOGIN', email, ip(), ...policy],
        );
        if (!rows[0].allowed) continue;
        const r = await app.query('SELECT * FROM auth_login_lookup($1, $2)', [
          rows[0].attempt_id,
          email,
        ]);
        reads += r.rows.length;
      }
      expect(reads).toBe(policy[1]);
    });

    it('los parámetros del rate limit se acotan en la DB (no se puede pedir un límite enorme)', async () => {
      const { email } = await userWithHash();
      let allowed = 0;
      for (let i = 0; i < 105; i++) {
        const { rows } = await app.query(
          'SELECT allowed FROM auth_attempt_register($1, $2, $3, $4, $5, $6)',
          ['LOGIN', email, ip(), 86_400 * 365, 1_000_000, 1_000_000],
        );
        if (rows[0].allowed) allowed++;
      }
      expect(allowed).toBe(100);
    });
  });

  describe('sesiones', () => {
    it('no se pueden enumerar: un hash inventado o vacío no devuelve nada', async () => {
      for (const hash of [hashToken(generateToken()), Buffer.alloc(32), Buffer.alloc(0)]) {
        expect((await app.query('SELECT * FROM auth_session_lookup($1)', [hash])).rows).toEqual([]);
        expect(
          (await app.query('SELECT * FROM auth_session_credentials($1)', [hash])).rows,
        ).toEqual([]);
        expect((await app.query('SELECT * FROM auth_session_revoke($1)', [hash])).rows).toEqual([]);
      }
    });

    it('el hash de contraseña solo sale con el token de una sesión válida de ESE usuario', async () => {
      const a = await userWithHash();
      const b = await userWithHash();
      const tokenA = await sessionFor(a.userId);
      const { rows } = await app.query('SELECT * FROM auth_session_credentials($1)', [
        hashToken(tokenA),
      ]);
      expect(rows).toEqual([{ user_id: a.userId, password_hash: a.hash }]);
      expect(JSON.stringify(rows)).not.toContain(b.hash);
    });

    it('no se crean sesiones sin un intento de login verificado', async () => {
      const { userId, email } = await userWithHash();
      const create = (attempt: string) =>
        app.query('SELECT auth_login_complete($1, $2, 1800, 43200, NULL, NULL, NULL) AS id', [
          attempt,
          hashToken(generateToken()),
        ]);
      // intento inexistente
      expect((await create('00000000-0000-4000-8000-000000000000')).rows[0].id).toBeNull();
      // intento registrado pero sin pasar por auth_login_lookup
      const attempt = await register('LOGIN', email);
      expect((await create(attempt)).rows[0].id).toBeNull();
      // con lookup: una sola sesión por intento
      await app.query('SELECT * FROM auth_login_lookup($1, $2)', [attempt, email]);
      expect((await create(attempt)).rows[0].id).toEqual(expect.any(String));
      expect((await create(attempt)).rows[0].id).toBeNull();
      const sessions = await seeder.query('SELECT 1 FROM sessions WHERE user_id = $1', [userId]);
      expect(sessions).toHaveLength(1);
    });

    it('el cambio de contraseña exige la sesión y un intento CHANGE_PASSWORD de ese usuario', async () => {
      const a = await userWithHash();
      const b = await userWithHash();
      const tokenA = await sessionFor(a.userId);
      const newHash = await hashPassword('nueva contraseña larga');
      const change = (attempt: string) =>
        app.query('SELECT auth_change_password($1, $2, $3, $4) AS user_id', [
          hashToken(tokenA),
          attempt,
          newHash,
          hashToken(generateToken()),
        ]);
      // intento de otro usuario → nada
      expect(
        (await change(await register('CHANGE_PASSWORD', b.userId))).rows[0].user_id,
      ).toBeNull();
      // intento de login (otro tipo) → nada
      expect((await change(await register('LOGIN', a.email))).rows[0].user_id).toBeNull();
      const [unchanged] = await seeder.query<{ password_hash: string }>(
        'SELECT password_hash FROM user_credentials WHERE user_id = $1',
        [a.userId],
      );
      expect(unchanged?.password_hash).toBe(a.hash);
      // hash que no es Argon2id → error
      expect(
        await errorCode(
          app.query('SELECT auth_change_password($1, $2, $3, $4)', [
            hashToken(tokenA),
            await register('CHANGE_PASSWORD', a.userId),
            'texto-plano',
            hashToken(generateToken()),
          ]),
        ),
      ).toBe('22023');
    });
  });

  describe('reset de contraseña', () => {
    it('emitir un token exige un intento PASSWORD_RESET para ese email y no revela otros usuarios', async () => {
      const x = await userWithHash();
      const y = await userWithHash();
      const attempt = await register('PASSWORD_RESET', x.email);
      const { rows } = await app.query(
        'SELECT auth_password_reset_issue($1, $2, $3, 1800) AS user_id',
        [attempt, y.email, hashToken(generateToken())],
      );
      expect(rows[0].user_id).toBeNull();
      const tokens = await seeder.query('SELECT 1 FROM password_reset_tokens WHERE user_id = $1', [
        y.userId,
      ]);
      expect(tokens).toEqual([]);
    });

    it('completar exige el token exacto, vigente y sin usar', async () => {
      const { userId, email, hash } = await userWithHash();
      const token = generateToken();
      const attempt = await register('PASSWORD_RESET', email);
      await app.query('SELECT auth_password_reset_issue($1, $2, $3, 1800)', [
        attempt,
        email,
        hashToken(token),
      ]);
      const newHash = await hashPassword('nueva contraseña larga');
      const complete = (t: string) =>
        app.query('SELECT auth_password_reset_complete($1, $2) AS user_id', [
          hashToken(t),
          newHash,
        ]);
      expect((await complete(generateToken())).rows[0].user_id).toBeNull();
      expect((await complete(token)).rows[0].user_id).toBe(userId);
      expect((await complete(token)).rows[0].user_id).toBeNull();
      const [row] = await seeder.query<{ password_hash: string }>(
        'SELECT password_hash FROM user_credentials WHERE user_id = $1',
        [userId],
      );
      expect(row?.password_hash).not.toBe(hash);
    });
  });

  describe('invitaciones (#18)', () => {
    /** Corre `sql` como zestia_app con `app.tenant_id` fijado (o sin él) y hace ROLLBACK. */
    async function inTenant<T>(
      tenantId: string | null,
      sql: string,
      params: unknown[],
    ): Promise<T[]> {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId ?? '']);
        return (await client.query(sql, params)).rows as T[];
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }

    const ACCEPT = 'SELECT auth_invitation_accept($1, $2, $3, $4, $5, $6) AS outcome';

    it('peek: un hash inventado o mal formado no devuelve nada', async () => {
      for (const hash of [hashToken(generateToken()), Buffer.alloc(3), null]) {
        const { rows } = await app.query('SELECT * FROM auth_invitation_peek($1)', [hash]);
        expect(rows).toEqual([]);
      }
    });

    it('aceptar exige estar en la transacción del tenant de la invitación', async () => {
      const tenantId = await seeder.tenant();
      const other = await seeder.tenant();
      const { token } = await seeder.invitation(tenantId);
      const args = [hashToken(token), tenantId, randomUUID(), randomUUID(), 'X', null];
      expect(await errorCode(inTenant(null, ACCEPT, args))).toBe('42501');
      expect(await errorCode(inTenant(other, ACCEPT, args))).toBe('42501');
      const [row] = await inTenant<{ outcome: string }>(tenantId, ACCEPT, [
        hashToken(generateToken()),
        tenantId,
        randomUUID(),
        randomUUID(),
        'X',
        null,
      ]);
      expect(row?.outcome).toBe('INVALID');
    });

    it('con un token válido no se puede atar la membresía a OTRA cuenta', async () => {
      const tenantId = await seeder.tenant();
      const invited = await userWithHash();
      const victim = await userWithHash();
      const { token } = await seeder.invitation(tenantId, { email: invited.email });
      const [row] = await inTenant<{ outcome: string }>(tenantId, ACCEPT, [
        hashToken(token),
        tenantId,
        victim.userId,
        randomUUID(),
        null,
        null,
      ]);
      expect(row?.outcome).toBe('STALE');

      // Sin cuenta para el email: el id de una cuenta ajena choca con su clave primaria.
      const fresh = await seeder.invitation(tenantId);
      expect(
        await errorCode(
          inTenant(tenantId, ACCEPT, [
            hashToken(fresh.token),
            tenantId,
            victim.userId,
            randomUUID(),
            'X',
            victim.hash,
          ]),
        ),
      ).toBe('23505');
      const memberships = await seeder.query(
        'SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, victim.userId],
      );
      expect(memberships).toEqual([]);
    });

    it('zestia_app no crea cuentas ni credenciales por su cuenta, ni ve invitaciones sin tenant', async () => {
      const tenantId = await seeder.tenant();
      await seeder.invitation(tenantId);
      expect(
        await errorCode(
          app.query(`INSERT INTO users (email, name) VALUES ('intruso@x.invalid', 'X')`),
        ),
      ).toBe('42501');
      expect(
        (await inTenant(null, 'SELECT id FROM invitations WHERE tenant_id = $1', [tenantId]))
          .length,
      ).toBe(0);
    });
  });
});
