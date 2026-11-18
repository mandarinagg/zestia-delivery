import type { INestApplication } from '@nestjs/common';
import { ROLES, can } from '@zestia/auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectTenantIsolation } from '../../testing/expect-tenant-isolation';
import { createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { TEST_PRINCIPAL_HEADER } from '../../testing/test-principal.resolver';

describe('GET /api/v1/merchants/:id', () => {
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

  it('aislamiento de tenant (expectTenantIsolation)', async () => {
    const report = await expectTenantIsolation({
      app,
      seeder,
      seed: (tenantId) => seeder.merchant(tenantId, 'Comercio aislado'),
      request: (http, id) => http.get(`/api/v1/merchants/${id}`),
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

  it('devuelve el comercio del tenant activo', async () => {
    const { tenantId, userId } = await seeder.tenantWithMember('OPERATOR');
    const id = await seeder.merchant(tenantId, 'La Esquina');
    const res = await request(app.getHttpServer())
      .get(`/api/v1/merchants/${id}`)
      .set(TEST_PRINCIPAL_HEADER, userId)
      .expect(200);
    expect(res.body).toMatchObject({ id, name: 'La Esquina', status: 'ACTIVE', ruc: null });
    expect(res.body).not.toHaveProperty('tenantId');
  });

  it('404 si no existe y 400 si el id no es UUID', async () => {
    const { userId } = await seeder.tenantWithMember('OWNER');
    const http = request(app.getHttpServer());
    await http
      .get('/api/v1/merchants/00000000-0000-4000-8000-000000000000')
      .set(TEST_PRINCIPAL_HEADER, userId)
      .expect(404);
    await http.get('/api/v1/merchants/1').set(TEST_PRINCIPAL_HEADER, userId).expect(400);
  });

  // Matriz rol × endpoint, generada desde @zestia/auth (docs/TESTING.md, suite de permisos).
  for (const role of ROLES) {
    const allowed = can(role, 'merchants:read');
    it(`${role}: ${allowed ? '200' : '403 PERMISSION_DENIED'}`, async () => {
      const { tenantId, userId } = await seeder.tenantWithMember(role);
      const id = await seeder.merchant(tenantId);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/merchants/${id}`)
        .set(TEST_PRINCIPAL_HEADER, userId)
        .expect(allowed ? 200 : 403);
      if (!allowed) {
        expect(res.body).toEqual({ statusCode: 403, code: 'PERMISSION_DENIED' });
        expect(res.text).not.toContain(id);
      }
    });
  }
});
