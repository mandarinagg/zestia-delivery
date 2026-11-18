import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { hashPassword } from '../modules/auth/password-hashing';
import { hashToken } from '../modules/auth/tokens';

/** URLs del Postgres de tests (ver global-setup.ts). */
export interface TestDatabaseUrls {
  /** Superusuario de bootstrap: SOLO para sembrar datos (se saltea RLS). */
  readonly admin: string;
  /** Dueño del esquema; corre las migraciones. */
  readonly migrator: string;
  /** Rol de la aplicación: el que usa la API. Sin BYPASSRLS. */
  readonly app: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabase: TestDatabaseUrls;
  }
}

export function testDatabaseUrls(): TestDatabaseUrls {
  return inject('testDatabase');
}

export type MembershipRoleName =
  'OWNER' | 'ADMIN' | 'OPERATOR' | 'SUPERVISOR' | 'COURIER' | 'MERCHANT';

/** Siembra datos como superusuario (fuera de RLS). Ids aleatorios: los tests no se pisan. */
export class TestSeeder {
  constructor(private readonly admin: pg.Pool) {}

  static connect(): TestSeeder {
    return new TestSeeder(new pg.Pool({ connectionString: testDatabaseUrls().admin, max: 2 }));
  }

  async close(): Promise<void> {
    await this.admin.end();
  }

  async tenant(name = 'Tenant'): Promise<string> {
    const id = randomUUID();
    await this.admin.query('INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)', [
      id,
      name,
      `t-${id}`,
    ]);
    return id;
  }

  async suspendTenant(tenantId: string): Promise<void> {
    await this.admin.query(`UPDATE tenants SET status = 'SUSPENDED' WHERE id = $1`, [tenantId]);
  }

  /** Email de los usuarios sembrados por `user()`. */
  static emailOf(userId: string): string {
    return `${userId}@test.invalid`;
  }

  async user(name = 'User'): Promise<string> {
    const id = randomUUID();
    await this.admin.query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [
      id,
      TestSeeder.emailOf(id),
      name,
    ]);
    return id;
  }

  /** Usuario con contraseña (Argon2id real). Devuelve id y email. */
  async userWithPassword(
    password: string,
    name = 'User',
  ): Promise<{ userId: string; email: string }> {
    const userId = await this.user(name);
    await this.setPassword(userId, password);
    return { userId, email: TestSeeder.emailOf(userId) };
  }

  async setPassword(userId: string, password: string): Promise<void> {
    await this.admin.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [userId, await hashPassword(password)],
    );
  }

  async setUserStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): Promise<void> {
    await this.admin.query('UPDATE users SET status = $2 WHERE id = $1', [userId, status]);
  }

  /** Simula una sesión cuya preferencia de tenant fue manipulada (sin pasar por la API). */
  async forceSessionTenant(sessionToken: string, tenantId: string | null): Promise<void> {
    const { rowCount } = await this.admin.query(
      'UPDATE sessions SET active_tenant_id = $2 WHERE token_hash = $1',
      [hashToken(sessionToken), tenantId],
    );
    if (rowCount !== 1) throw new Error('sesión no encontrada');
  }

  /** Consulta libre como superusuario (para verificar efectos en la DB). */
  async query<R extends pg.QueryResultRow = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<R[]> {
    return (await this.admin.query<R>(sql, params)).rows;
  }

  async membership(tenantId: string, userId: string, role: MembershipRoleName): Promise<string> {
    const id = randomUUID();
    await this.admin.query(
      'INSERT INTO memberships (id, tenant_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [id, tenantId, userId, role],
    );
    return id;
  }

  async merchant(tenantId: string, name = 'Comercio'): Promise<string> {
    const id = randomUUID();
    await this.admin.query('INSERT INTO merchants (id, tenant_id, name) VALUES ($1, $2, $3)', [
      id,
      tenantId,
      name,
    ]);
    return id;
  }

  /** Tenant con un usuario miembro (rol dado). */
  async tenantWithMember(
    role: MembershipRoleName = 'OWNER',
  ): Promise<{ tenantId: string; userId: string }> {
    const tenantId = await this.tenant();
    const userId = await this.user();
    await this.membership(tenantId, userId, role);
    return { tenantId, userId };
  }
}
