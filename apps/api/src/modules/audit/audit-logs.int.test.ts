import type { INestApplication } from '@nestjs/common';
import { ROLES, can } from '@zestia/auth';
import { auditLogPageSchema, type AuditLogPage } from '@zestia/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectTenantIsolation } from '../../testing/expect-tenant-isolation';
import { createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { TEST_PRINCIPAL_HEADER } from '../../testing/test-principal.resolver';
import { TenantDb } from '../tenancy';
import { auditDiff } from './audit-diff';
import { AuditService } from './audit.service';

const desc = (ids: string[]): string[] => [...ids].sort().reverse();

describe('auditoría (#17)', () => {
  let app: INestApplication;
  let seeder: TestSeeder;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  const get = (userId: string, path: string) =>
    request(app.getHttpServer()).get(path).set(TEST_PRINCIPAL_HEADER, userId);

  describe('GET /api/v1/audit-logs/:id', () => {
    it('aislamiento de tenant (expectTenantIsolation)', async () => {
      const report = await expectTenantIsolation({
        app,
        seeder,
        seed: (tenantId) => seeder.auditLog(tenantId, { action: 'merchants.updated' }),
        request: (http, id) => http.get(`/api/v1/audit-logs/${id}`),
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

    it('devuelve el evento con actor, entidad y cambios', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      const id = await seeder.auditLog(tenantId, {
        action: 'merchants.updated',
        actorId: userId,
        entityType: 'merchant',
        entityId: 'm-1',
        changes: { name: { from: 'A', to: 'B' }, phone: { redacted: true } },
      });
      const res = await get(userId, `/api/v1/audit-logs/${id}`).expect(200);
      expect(res.body).toMatchObject({
        id,
        action: 'merchants.updated',
        actor: { type: 'USER', id: userId, name: 'User' },
        entity: { type: 'merchant', id: 'm-1' },
        changes: { name: { from: 'A', to: 'B' }, phone: { redacted: true } },
        metadata: {},
      });
      expect(res.body).not.toHaveProperty('tenantId');
    });

    it('400 si el id no es UUID', async () => {
      const { userId } = await seeder.tenantWithMember('OWNER');
      await get(userId, '/api/v1/audit-logs/1').expect(400);
    });
  });

  describe('GET /api/v1/audit-logs', () => {
    it('solo el tenant activo: ni otros tenants ni eventos sin tenant (login)', async () => {
      const a = await seeder.tenantWithMember('OWNER');
      const b = await seeder.tenantWithMember('OWNER');
      const mine = await seeder.auditLog(a.tenantId);
      const foreign = await seeder.auditLog(b.tenantId);
      const noTenant = await seeder.auditLog(null, { actorId: a.userId });
      const res = await get(a.userId, '/api/v1/audit-logs?tenantId=' + b.tenantId)
        .set('x-tenant-id', b.tenantId)
        .expect(200);
      const page = auditLogPageSchema.parse(res.body);
      expect(page.data.map((e) => e.id)).toEqual([mine]);
      expect(res.text).not.toContain(foreign);
      expect(res.text).not.toContain(noTenant);
    });

    it('más recientes primero y paginación por cursor sin repetir ni saltear', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push(await seeder.auditLog(tenantId));

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2';
        const res = await get(userId, `/api/v1/audit-logs${query}`).expect(200);
        const page: AuditLogPage = auditLogPageSchema.parse(res.body);
        expect(page.data.length).toBeLessThanOrEqual(2);
        seen.push(...page.data.map((e) => e.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toEqual(desc(ids));
    });

    it('filtros: acción por prefijo de segmentos, entidad, actor y fechas', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const other = await seeder.user('Otra');
      await seeder.membership(tenantId, other, 'OPERATOR');
      const updated = await seeder.auditLog(tenantId, {
        action: 'merchants.updated',
        actorId: userId,
        entityType: 'merchant',
        entityId: 'm-1',
        occurredAt: new Date('2026-11-10T12:00:00Z'),
      });
      const created = await seeder.auditLog(tenantId, {
        action: 'merchants.created',
        actorId: other,
        entityType: 'merchant',
        entityId: 'm-2',
        occurredAt: new Date('2026-11-12T12:00:00Z'),
      });
      const lookalike = await seeder.auditLog(tenantId, { action: 'merchantsx.created' });

      const ids = async (query: string): Promise<string[]> => {
        const res = await get(userId, `/api/v1/audit-logs?${query}`).expect(200);
        return auditLogPageSchema.parse(res.body).data.map((e) => e.id);
      };
      expect(await ids('action=merchants')).toEqual(desc([updated, created]));
      expect(await ids('action=merchants.created')).toEqual([created]);
      expect(await ids('action=merchantsx')).toEqual([lookalike]);
      expect(await ids('entityType=merchant&entityId=m-1')).toEqual([updated]);
      expect(await ids(`actorId=${other}`)).toEqual([created]);
      expect(
        await ids('from=2026-11-11T00:00:00Z&to=2026-11-13T00:00:00-03:00&action=merchants'),
      ).toEqual([created]);
    });

    it('nombre del actor solo si es (o fue) miembro del tenant', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const outsider = await seeder.user('Ajeno');
      await seeder.auditLog(tenantId, { actorId: outsider });
      const res = await get(userId, '/api/v1/audit-logs').expect(200);
      const [entry] = auditLogPageSchema.parse(res.body).data;
      expect(entry?.actor).toEqual({ type: 'USER', id: outsider, name: null });
    });

    it('400 con filtros inválidos, sin devolver el valor recibido', async () => {
      const { userId } = await seeder.tenantWithMember('OWNER');
      const res = await get(userId, '/api/v1/audit-logs?limit=500&action=DROP%20TABLE').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(res.text).not.toContain('DROP');
    });
  });

  // Matriz rol × endpoint, generada desde @zestia/auth.
  describe('permisos (audit:read)', () => {
    for (const role of ROLES) {
      const allowed = can(role, 'audit:read');
      it(`${role}: ${allowed ? '200' : '403 PERMISSION_DENIED'}`, async () => {
        const { tenantId, userId } = await seeder.tenantWithMember(role);
        const id = await seeder.auditLog(tenantId);
        for (const path of ['/api/v1/audit-logs', `/api/v1/audit-logs/${id}`]) {
          const res = await get(userId, path).expect(allowed ? 200 : 403);
          if (!allowed) {
            expect(res.body).toEqual({ statusCode: 403, code: 'PERMISSION_DENIED' });
            expect(res.text).not.toContain(id);
          }
        }
      });
    }
  });

  describe('AuditService.recordChange', () => {
    const context = (tenantId: string, userId: string) => ({
      tenantId,
      userId,
      membershipId: '00000000-0000-4000-8000-000000000000',
      role: 'ADMIN' as const,
      correlationId: 'req-123',
    });

    it('guarda actor, cambios y correlationId del contexto, en la transacción del tenant', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      const changes = auditDiff(
        { name: 'A', phone: '0981' },
        { name: 'B', phone: '0982' },
        { fields: ['name'], redacted: ['phone'] },
      );
      await app.get(TenantDb).run(context(tenantId, userId), () =>
        app.get(AuditService).recordChange({
          action: 'merchants.updated',
          entity: { type: 'merchant', id: 'm-9' },
          changes,
        }),
      );
      const rows = await seeder.query(
        `SELECT tenant_id, actor_type, actor_id, changes, correlation_id
           FROM audit_logs WHERE entity_id = 'm-9' AND tenant_id = $1`,
        [tenantId],
      );
      expect(rows).toEqual([
        {
          tenant_id: tenantId,
          actor_type: 'USER',
          actor_id: userId,
          changes: { name: { from: 'A', to: 'B' }, phone: { redacted: true } },
          correlation_id: 'req-123',
        },
      ]);
      expect(JSON.stringify(rows)).not.toContain('0982');
    });

    it('si el cambio hace ROLLBACK, el evento también', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      await expect(
        app.get(TenantDb).run(context(tenantId, userId), async () => {
          await app.get(AuditService).recordChange({
            action: 'merchants.updated',
            entity: { type: 'merchant', id: 'm-rollback' },
            changes: null,
          });
          throw new Error('falla el cambio');
        }),
      ).rejects.toThrow('falla el cambio');
      const rows = await seeder.query(
        `SELECT 1 FROM audit_logs WHERE entity_id = 'm-rollback' AND tenant_id = $1`,
        [tenantId],
      );
      expect(rows).toEqual([]);
    });

    it('fuera de un contexto de tenant falla (no hay actor ni tenant)', async () => {
      await expect(
        app.get(AuditService).recordChange({
          action: 'merchants.updated',
          entity: { type: 'merchant', id: 'm-x' },
          changes: null,
        }),
      ).rejects.toThrow(/contexto de tenant/);
    });

    it('rechaza un dato sensible con valor en claro', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      await expect(
        app.get(TenantDb).run(context(tenantId, userId), () =>
          app.get(AuditService).recordChange({
            action: 'merchants.updated',
            entity: { type: 'merchant', id: 'm-pii' },
            changes: { phone: { from: '0981', to: '0982' } },
          }),
        ),
      ).rejects.toThrow(/redacted/);
    });
  });
});
