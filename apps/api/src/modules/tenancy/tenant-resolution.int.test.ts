import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { TEST_PRINCIPAL_HEADER, principalHeader } from '../../testing/test-principal.resolver';

/**
 * Resolución del tenant en el servidor (TenantGuard + TenantResolver), a través de un endpoint
 * real con `@TenantScoped()`.
 */
describe('resolución del tenant activo', () => {
  let app: INestApplication;
  let seeder: TestSeeder;
  const get = (merchantId: string, principal?: string): request.Test => {
    const req = request(app.getHttpServer()).get(`/api/v1/merchants/${merchantId}`);
    return principal ? req.set(TEST_PRINCIPAL_HEADER, principal) : req;
  };

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  it('401 sin principal autenticado', async () => {
    const { tenantId } = await seeder.tenantWithMember();
    const id = await seeder.merchant(tenantId);
    await get(id).expect(401);
  });

  it('401 si el principal trae un userId inválido', async () => {
    const { tenantId } = await seeder.tenantWithMember();
    const id = await seeder.merchant(tenantId);
    await get(id, 'no-es-uuid').expect(401);
  });

  it('403 si el usuario no tiene ninguna membresía', async () => {
    const { tenantId } = await seeder.tenantWithMember();
    const id = await seeder.merchant(tenantId);
    const lonely = await seeder.user();
    const res = await get(id, lonely).expect(403);
    expect(res.body).toMatchObject({ code: 'NO_ACTIVE_MEMBERSHIP' });
  });

  it('403 si el tenant está suspendido', async () => {
    const { tenantId, userId } = await seeder.tenantWithMember();
    const id = await seeder.merchant(tenantId);
    await seeder.suspendTenant(tenantId);
    const res = await get(id, userId).expect(403);
    expect(res.body).toMatchObject({ code: 'NO_ACTIVE_MEMBERSHIP' });
  });

  it('usuario con varias membresías: exige tenant activo en la sesión y usa ese', async () => {
    const userId = await seeder.user();
    const tenantA = await seeder.tenant();
    const tenantB = await seeder.tenant();
    await seeder.membership(tenantA, userId, 'OWNER');
    await seeder.membership(tenantB, userId, 'OPERATOR');
    const merchantA = await seeder.merchant(tenantA);
    const merchantB = await seeder.merchant(tenantB);

    const res = await get(merchantA, userId).expect(403);
    expect(res.body).toMatchObject({ code: 'TENANT_SELECTION_REQUIRED' });

    await get(merchantA, principalHeader(userId, tenantA)).expect(200);
    await get(merchantB, principalHeader(userId, tenantB)).expect(200);
    // Con B activo, el comercio de A no existe para esta request, aunque el usuario sea
    // miembro de A: el aislamiento es por tenant activo, no por usuario.
    await get(merchantA, principalHeader(userId, tenantB)).expect(404);
  });

  it('ignora cabeceras, query y body con tenantId enviados por el cliente', async () => {
    const own = await seeder.tenantWithMember();
    const other = await seeder.tenantWithMember();
    const foreign = await seeder.merchant(other.tenantId);
    for (const header of ['x-tenant-id', 'x-tenant', 'tenant-id', 'x-zestia-tenant']) {
      await get(foreign, own.userId).set(header, other.tenantId).expect(404);
    }
    await get(foreign, own.userId)
      .query({ tenantId: other.tenantId, tenant_id: other.tenantId })
      .send({ tenantId: other.tenantId })
      .expect(404);
  });
});
