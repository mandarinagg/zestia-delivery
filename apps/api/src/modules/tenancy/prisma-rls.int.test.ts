import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { TestSeeder, testDatabaseUrls } from '../../testing/test-database';
import { TenantContextMissingError, type TenantContext } from './tenant-context';
import { TenantDb } from './tenant-db';
import { runInDbScope } from './tenant-transaction';

/**
 * Spike R1 de ADR-004: Prisma 7 (driver adapter `pg`) + RLS.
 * Verifica que `set_config(..., true)` dentro de una transacción interactiva aplica a TODAS sus
 * queries (misma conexión), que el valor no se filtra por el pool y que requests concurrentes
 * de tenants distintos quedan aisladas.
 */

function prismaFor(poolMax: number): PrismaService {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrls().app,
    DATABASE_POOL_MAX: String(poolMax),
  });
  return new PrismaService(env);
}

describe('Prisma + RLS (spike ADR-004)', () => {
  let seeder: TestSeeder;
  let prisma: PrismaService;
  let single: PrismaService;
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;
  let membershipA: string;
  let membershipB: string;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    prisma = prismaFor(4);
    single = prismaFor(1);
    tenantA = await seeder.tenant('A');
    tenantB = await seeder.tenant('B');
    userA = await seeder.user();
    userB = await seeder.user();
    membershipA = await seeder.membership(tenantA, userA, 'OWNER');
    membershipB = await seeder.membership(tenantB, userB, 'ADMIN');
    for (const t of [tenantA, tenantB]) {
      await seeder.merchant(t, `m1-${t}`);
      await seeder.merchant(t, `m2-${t}`);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await single.$disconnect();
    await seeder.close();
  });

  it('el rol de conexión es seguro (checkConnectionRole)', async () => {
    expect(await prisma.checkConnectionRole()).toEqual({ status: 'ok' });
  });

  it('set_config local aplica a todas las queries de la transacción interactiva (misma conexión)', async () => {
    const result = await runInDbScope(prisma, { tenantId: tenantA, userId: userA }, async (tx) => {
      const pids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const [row] = await tx.$queryRaw<{ pid: number; tenant: string }[]>`
          SELECT pg_backend_pid() AS pid, app_current_tenant_id()::text AS tenant`;
        expect(row?.tenant).toBe(tenantA);
        pids.push(row!.pid);
      }
      const merchants = await tx.merchant.findMany();
      const count = await tx.merchant.count();
      const tenants = await tx.tenant.findMany({ select: { id: true } });
      return { pids, merchants, count, tenants };
    });
    expect(new Set(result.pids).size).toBe(1);
    expect(result.merchants).toHaveLength(2);
    expect(result.merchants.every((m) => m.tenantId === tenantA)).toBe(true);
    expect(result.count).toBe(2);
    expect(result.tenants).toEqual([{ id: tenantA }]);
  });

  it('fuera de la transacción el cliente no ve nada (fail-closed)', async () => {
    expect(await prisma.merchant.findMany()).toEqual([]);
    expect(await prisma.membership.count()).toBe(0);
  });

  it('el valor no se filtra a la siguiente operación sobre la misma conexión del pool', async () => {
    const pidInTx = await runInDbScope(single, { tenantId: tenantA, userId: null }, async (tx) => {
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      return row!.pid;
    });
    const [after] = await single.$queryRaw<{ pid: number; raw: string; n: number }[]>`
      SELECT pg_backend_pid() AS pid, current_setting('app.tenant_id', true) AS raw,
             (SELECT count(*)::int FROM merchants) AS n`;
    expect(after).toEqual({ pid: pidInTx, raw: '', n: 0 });
  });

  it('el valor no se filtra después de un rollback', async () => {
    await expect(
      runInDbScope(single, { tenantId: tenantA, userId: null }, async (tx) => {
        await tx.merchant.count();
        throw new Error('rollback a propósito');
      }),
    ).rejects.toThrow('rollback a propósito');
    expect(await single.merchant.count()).toBe(0);
  });

  it('una transacción posterior en la misma conexión ve solo su propio tenant', async () => {
    await runInDbScope(single, { tenantId: tenantA, userId: null }, (tx) => tx.merchant.count());
    const seen = await runInDbScope(single, { tenantId: tenantB, userId: null }, (tx) =>
      tx.merchant.findMany({ select: { tenantId: true } }),
    );
    expect(seen.length).toBe(2);
    expect(seen.every((m) => m.tenantId === tenantB)).toBe(true);
  });

  it('requests concurrentes de tenants distintos quedan aisladas (pool compartido)', async () => {
    const runs = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? tenantA : tenantB));
    const results = await Promise.all(
      runs.map((tenantId) =>
        runInDbScope(prisma, { tenantId, userId: null }, async (tx) => {
          await tx.$executeRaw`SELECT pg_sleep(random() * 0.02)`;
          const merchants = await tx.merchant.findMany({ select: { tenantId: true } });
          const [ctx] = await tx.$queryRaw<{ tenant: string }[]>`
            SELECT app_current_tenant_id()::text AS tenant`;
          return { expected: tenantId, merchants, ctx: ctx?.tenant };
        }),
      ),
    );
    for (const r of results) {
      expect(r.ctx).toBe(r.expected);
      expect(r.merchants).toHaveLength(2);
      expect(r.merchants.every((m) => m.tenantId === r.expected)).toBe(true);
    }
  });

  it('rechaza ids que no son UUID antes de tocar la DB (el valor siempre va parametrizado)', async () => {
    await expect(
      runInDbScope(prisma, { tenantId: `${tenantA}' OR '1'='1`, userId: null }, async () => 1),
    ).rejects.toThrow(/UUID/);
    await expect(
      runInDbScope(prisma, { tenantId: null, userId: 'x' }, async () => 1),
    ).rejects.toThrow(/UUID/);
  });

  describe('TenantDb', () => {
    const ctx = (tenantId: string, userId: string, membershipId: string): TenantContext => ({
      tenantId,
      userId,
      membershipId,
      role: 'OWNER',
    });

    it('db.tx fuera de un contexto de tenant lanza TenantContextMissingError', () => {
      const db = new TenantDb(prisma);
      expect(() => db.tx).toThrow(TenantContextMissingError);
      expect(() => db.context).toThrow(TenantContextMissingError);
    });

    it('no permite transacciones de tenant anidadas', async () => {
      const db = new TenantDb(prisma);
      await expect(
        db.run(ctx(tenantA, userA, membershipA), () =>
          db.run(ctx(tenantB, userB, membershipB), async () => 1),
        ),
      ).rejects.toThrow(/anidadas/);
    });

    it('el contexto asíncrono no se mezcla entre ejecuciones concurrentes', async () => {
      const db = new TenantDb(prisma);
      const runs = Array.from({ length: 30 }, (_, i) =>
        i % 2 === 0 ? ctx(tenantA, userA, membershipA) : ctx(tenantB, userB, membershipB),
      );
      const results = await Promise.all(
        runs.map((c) =>
          db.run(c, async () => {
            await db.tx.$executeRaw`SELECT pg_sleep(random() * 0.01)`;
            const merchants = await db.tx.merchant.findMany({ select: { tenantId: true } });
            return { expected: c.tenantId, seen: db.context.tenantId, merchants };
          }),
        ),
      );
      for (const r of results) {
        expect(r.seen).toBe(r.expected);
        expect(r.merchants.every((m) => m.tenantId === r.expected)).toBe(true);
      }
      expect(db.active).toBe(false);
    });
  });
});
