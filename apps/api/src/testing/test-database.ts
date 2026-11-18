import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

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

  async user(name = 'User'): Promise<string> {
    const id = randomUUID();
    await this.admin.query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [
      id,
      `${id}@test.invalid`,
      name,
    ]);
    return id;
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
