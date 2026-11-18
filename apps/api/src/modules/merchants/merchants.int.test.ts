import type { INestApplication } from '@nestjs/common';
import { ROLES, can } from '@zestia/auth';
import { merchantDetailSchema, merchantPageSchema, merchantSummarySchema } from '@zestia/contracts';
import request, { type Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectTenantIsolation } from '../../testing/expect-tenant-isolation';
import { TEST_WEB_ORIGIN, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { TEST_PRINCIPAL_HEADER } from '../../testing/test-principal.resolver';

const BRANCH = {
  name: 'Centro',
  address: 'Palma 123',
  neighborhood: 'Catedral',
  city: 'Asunción',
  references: 'Frente a la plaza',
  phone: '021 600 000',
  openingHours: {
    mon: [
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '18:00' },
    ],
  },
};

let seq = 0;
const unique = (prefix: string) => `${prefix} ${++seq} ${Date.now()}`;

describe('comercios y sucursales (#19)', () => {
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

  /** Requests como un usuario (cabecera de test) y con Origin válido para las mutaciones. */
  const as = (userId: string) => {
    const http = request(app.getHttpServer());
    const sign = (t: Test) => t.set(TEST_PRINCIPAL_HEADER, userId).set('Origin', TEST_WEB_ORIGIN);
    return {
      get: (path: string) => sign(http.get(`/api/v1/merchants${path}`)),
      post: (path: string, body?: object) => sign(http.post(`/api/v1/merchants${path}`)).send(body),
      patch: (path: string, body: object) =>
        sign(http.patch(`/api/v1/merchants${path}`)).send(body),
    };
  };

  const auditRows = (tenantId: string, entityId: string) =>
    seeder.query<{ action: string; changes: unknown; metadata: unknown; actor_id: string }>(
      `SELECT action, changes, metadata, actor_id FROM audit_logs
        WHERE tenant_id = $1 AND entity_id = $2 ORDER BY id`,
      [tenantId, entityId],
    );

  describe('aislamiento de tenant en cada endpoint con id', () => {
    const withOrigin = (t: Test) => t.set('Origin', TEST_WEB_ORIGIN);
    const merchantSeed = (tenantId: string) => seeder.merchant(tenantId, unique('Aislado'));
    const branchSeed = async (tenantId: string) => {
      const merchantId = await seeder.merchant(tenantId, unique('Con sucursal'));
      return `${merchantId}/branches/${await seeder.branch(tenantId, merchantId)}`;
    };

    it.each([
      ['GET /:id', merchantSeed, (h, id) => h.get(`/api/v1/merchants/${id}`), 200],
      [
        'PATCH /:id',
        merchantSeed,
        (h, id) => withOrigin(h.patch(`/api/v1/merchants/${id}`)).send({ name: unique('N') }),
        200,
      ],
      [
        'POST /:id/suspend',
        merchantSeed,
        (h, id) => withOrigin(h.post(`/api/v1/merchants/${id}/suspend`)),
        200,
      ],
      [
        'POST /:id/archive',
        merchantSeed,
        (h, id) => withOrigin(h.post(`/api/v1/merchants/${id}/archive`)),
        200,
      ],
      [
        'POST /:id/branches',
        merchantSeed,
        (h, id) => withOrigin(h.post(`/api/v1/merchants/${id}/branches`)).send(BRANCH),
        201,
      ],
      [
        'PATCH /:id/branches/:branchId',
        branchSeed,
        (h, path) => withOrigin(h.patch(`/api/v1/merchants/${path}`)).send({ city: 'Luque' }),
        200,
      ],
      [
        'POST /:id/branches/:branchId/archive',
        branchSeed,
        (h, path) => withOrigin(h.post(`/api/v1/merchants/${path}/archive`)),
        204,
      ],
    ] as const satisfies readonly [
      string,
      (tenantId: string) => Promise<string>,
      (h: ReturnType<typeof request>, id: string) => Test,
      number,
    ][])('%s', async (_label, seed, req, ownerStatus) => {
      const report = await expectTenantIsolation({
        app,
        seeder,
        seed,
        request: req,
        ownerStatus,
      });
      expect(report.statuses['intruder -> foreign id']).toBe(404);
    });
  });

  // Matriz rol × endpoint, generada desde @zestia/auth.
  describe('permisos', () => {
    for (const role of ROLES) {
      const read = can(role, 'merchants:read');
      const manage = can(role, 'merchants:manage');
      it(`${role}: leer ${read ? 'sí' : 'no'}, gestionar ${manage ? 'sí' : 'no'}`, async () => {
        const { tenantId, userId } = await seeder.tenantWithMember(role);
        const id = await seeder.merchant(tenantId, unique('Permisos'));
        const branchId = await seeder.branch(tenantId, id);
        const api = as(userId);
        const reads = [api.get(''), api.get(`/${id}`)];
        const writes = [
          api.post('', { name: unique('Nuevo') }),
          api.patch(`/${id}`, { name: unique('Otro') }),
          api.post(`/${id}/branches`, { ...BRANCH, name: unique('Suc') }),
          api.patch(`/${id}/branches/${branchId}`, { city: 'Luque' }),
          api.post(`/${id}/branches/${branchId}/archive`),
          api.post(`/${id}/suspend`),
          api.post(`/${id}/reactivate`),
          api.post(`/${id}/archive`),
        ];
        for (const res of await Promise.all(reads)) {
          expect(res.status, res.text).toBe(read ? 200 : 403);
        }
        for (const res of await Promise.all(writes.map((w) => w.then((r) => r)))) {
          if (manage) expect(res.status, res.text).not.toBe(403);
          else expect(res.body).toEqual({ statusCode: 403, code: 'PERMISSION_DENIED' });
        }
      });
    }
  });

  describe('alta y edición', () => {
    it('crea con datos normalizados, sin exponer el tenant, y lo audita', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      const res = await as(userId)
        .post('', { name: '  La Esquina  ', ruc: '80012345-6', phone: '0981 123 456' })
        .expect(201);
      const merchant = merchantSummarySchema.parse(res.body);
      expect(merchant).toMatchObject({
        name: 'La Esquina',
        ruc: '80012345-6',
        phone: '+595981123456',
        status: 'ACTIVE',
        branchCount: 0,
      });
      expect(res.body).not.toHaveProperty('tenantId');

      const [audit] = await auditRows(tenantId, merchant.id);
      expect(audit).toMatchObject({
        action: 'merchants.created',
        actor_id: userId,
        changes: {
          name: { from: null, to: 'La Esquina' },
          status: { from: null, to: 'ACTIVE' },
          ruc: { redacted: true },
          phone: { redacted: true },
        },
      });
      expect(JSON.stringify(audit)).not.toContain('981123456');
      expect(JSON.stringify(audit)).not.toContain('80012345');
    });

    it('nombre duplicado (sin distinguir mayúsculas) → 409; tras archivar se puede reutilizar', async () => {
      const { userId } = await seeder.tenantWithMember('OWNER');
      const api = as(userId);
      const first = await api.post('', { name: 'Pizzería Sol' }).expect(201);
      const dup = await api.post('', { name: 'PIZZERÍA SOL' }).expect(409);
      expect(dup.body).toEqual({ statusCode: 409, code: 'DUPLICATE_NAME' });
      await api.post(`/${first.body.id}/archive`).expect(200);
      await api.post('', { name: 'Pizzería Sol' }).expect(201);
    });

    it('el mismo nombre en otro tenant no choca', async () => {
      const a = await seeder.tenantWithMember('OWNER');
      const b = await seeder.tenantWithMember('OWNER');
      await as(a.userId).post('', { name: 'Compartido' }).expect(201);
      await as(b.userId).post('', { name: 'Compartido' }).expect(201);
    });

    it('edición parcial: null borra un opcional y el diff solo trae lo que cambió', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const api = as(userId);
      const { body } = await api.post('', { name: 'Antes', phone: '0981111111' }).expect(201);
      const res = await api.patch(`/${body.id}`, { name: 'Después', phone: null }).expect(200);
      expect(res.body).toMatchObject({ name: 'Después', phone: null, ruc: null });
      const rows = await auditRows(tenantId, body.id);
      expect(rows.at(-1)).toMatchObject({
        action: 'merchants.updated',
        changes: { name: { from: 'Antes', to: 'Después' }, phone: { redacted: true } },
      });
    });

    it('400 con datos inválidos sin devolver los valores', async () => {
      const { userId } = await seeder.tenantWithMember('OWNER');
      const res = await as(userId)
        .post('', { name: 'X', phone: 'llamar-a-juan', tenantId: 'otro' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.text).not.toContain('llamar-a-juan');
    });

    it('un cambio que falla no deja auditoría (misma transacción)', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const api = as(userId);
      await api.post('', { name: 'Ocupado' }).expect(201);
      const { body } = await api.post('', { name: 'Libre' }).expect(201);
      await api.patch(`/${body.id}`, { name: 'ocupado' }).expect(409);
      const rows = await auditRows(tenantId, body.id);
      expect(rows.map((r) => r.action)).toEqual(['merchants.created']);
    });
  });

  describe('estados', () => {
    it('suspender, reactivar y archivar; archivado es final y de solo lectura', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const api = as(userId);
      const { body } = await api.post('', { name: unique('Estados') }).expect(201);
      const id: string = body.id;

      await api.post(`/${id}/reactivate`).expect(409);
      expect((await api.post(`/${id}/suspend`).expect(200)).body.status).toBe('SUSPENDED');
      await api.post(`/${id}/suspend`).expect(409);
      // Un comercio suspendido se puede editar y sumar sucursales.
      await api.patch(`/${id}`, { ruc: '1234567-8' }).expect(200);
      expect((await api.post(`/${id}/reactivate`).expect(200)).body.status).toBe('ACTIVE');
      expect((await api.post(`/${id}/archive`).expect(200)).body.status).toBe('ARCHIVED');

      const transition = await api.post(`/${id}/reactivate`).expect(409);
      expect(transition.body.code).toBe('INVALID_STATUS_TRANSITION');
      const edit = await api.patch(`/${id}`, { name: 'Nuevo' }).expect(409);
      expect(edit.body.code).toBe('MERCHANT_ARCHIVED');
      await api.post(`/${id}/branches`, BRANCH).expect(409);
      // El detalle sigue disponible.
      expect((await api.get(`/${id}`).expect(200)).body.status).toBe('ARCHIVED');

      const actions = (await auditRows(tenantId, id)).map((r) => r.action);
      expect(actions).toEqual([
        'merchants.created',
        'merchants.suspended',
        'merchants.updated',
        'merchants.reactivated',
        'merchants.archived',
      ]);
      const [row] = await seeder.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM merchants WHERE id = $1',
        [id],
      );
      expect(row?.deleted_at).toBeInstanceOf(Date);
    });

    it('404 para un id inexistente; 400 si no es UUID', async () => {
      const { userId } = await seeder.tenantWithMember('OWNER');
      const api = as(userId);
      await api.get('/00000000-0000-4000-8000-000000000000').expect(404);
      await api.post('/00000000-0000-4000-8000-000000000000/archive').expect(404);
      await api.get('/1').expect(400);
    });
  });

  describe('listado', () => {
    it('por nombre, sin archivados salvo que se pidan, con búsqueda y cursor', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OPERATOR');
      const names = ['Delta', 'alfa', 'Charlie', 'Bravo', 'Eco'];
      const ids: Record<string, string> = {};
      for (const name of names) ids[name] = await seeder.merchant(tenantId, name);
      await seeder.query(
        `UPDATE merchants SET status = 'ARCHIVED', deleted_at = now() WHERE id = $1`,
        [ids.Eco],
      );
      await seeder.query(
        `UPDATE merchants SET status = 'SUSPENDED', ruc = '5555555-1' WHERE id = $1`,
        [ids.Delta],
      );
      await seeder.branch(tenantId, ids.Bravo!);
      const archivedBranch = await seeder.branch(tenantId, ids.Bravo!, 'Vieja');
      await seeder.query('UPDATE merchant_branches SET deleted_at = now() WHERE id = $1', [
        archivedBranch,
      ]);
      const api = as(userId);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2';
        const page = merchantPageSchema.parse((await api.get(query).expect(200)).body);
        seen.push(...page.data.map((m) => m.name));
        cursor = page.nextCursor;
      } while (cursor);
      // Orden por nombre según la intercalación de la base; lo que importa: completo y sin repetir.
      expect([...seen].sort()).toEqual(['Bravo', 'Charlie', 'Delta', 'alfa'].sort());
      expect(new Set(seen).size).toBe(seen.length);

      const list = merchantPageSchema.parse((await api.get('').expect(200)).body);
      expect(list.data.find((m) => m.name === 'Bravo')?.branchCount).toBe(1);

      const archived = merchantPageSchema.parse(
        (await api.get('?status=ARCHIVED').expect(200)).body,
      );
      expect(archived.data.map((m) => m.name)).toEqual(['Eco']);
      const byName = merchantPageSchema.parse((await api.get('?q=RAV').expect(200)).body);
      expect(byName.data.map((m) => m.name)).toEqual(['Bravo']);
      const byRuc = merchantPageSchema.parse((await api.get('?q=5555').expect(200)).body);
      expect(byRuc.data.map((m) => m.name)).toEqual(['Delta']);

      await api.get('?cursor=no-es-un-cursor').expect(400);
    });
  });

  describe('sucursales', () => {
    it('alta con horario, edición, archivo y auditoría con datos sensibles ocultos', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      const api = as(userId);
      const { body: merchant } = await api.post('', { name: unique('Con sucursales') }).expect(201);

      const created = await api.post(`/${merchant.id}/branches`, BRANCH).expect(201);
      expect(created.body).toMatchObject({
        merchantId: merchant.id,
        phone: '+59521600000',
        openingHours: BRANCH.openingHours,
      });
      const branchId: string = created.body.id;

      await api.post(`/${merchant.id}/branches`, { ...BRANCH, name: 'centro' }).expect(409);
      await api
        .patch(`/${merchant.id}/branches/${branchId}`, {
          address: 'Otra 456',
          openingHours: { sat: [{ from: '09:00', to: '13:00' }] },
        })
        .expect(200);

      const detail = merchantDetailSchema.parse(
        (await api.get(`/${merchant.id}`).expect(200)).body,
      );
      expect(detail.branchCount).toBe(1);
      expect(detail.branches[0]).toMatchObject({
        address: 'Otra 456',
        openingHours: { sat: [{ from: '09:00', to: '13:00' }] },
      });

      await api.post(`/${merchant.id}/branches/${branchId}/archive`).expect(204);
      await api.post(`/${merchant.id}/branches/${branchId}/archive`).expect(404);
      const after = merchantDetailSchema.parse((await api.get(`/${merchant.id}`).expect(200)).body);
      expect(after.branches).toEqual([]);
      expect(after.branchCount).toBe(0);

      const rows = await auditRows(tenantId, branchId);
      expect(rows.map((r) => r.action)).toEqual([
        'merchants.branch_created',
        'merchants.branch_updated',
        'merchants.branch_archived',
      ]);
      expect(rows[0]).toMatchObject({
        metadata: { merchantId: merchant.id },
        changes: {
          name: { from: null, to: 'Centro' },
          city: { from: null, to: 'Asunción' },
          address: { redacted: true },
          references: { redacted: true },
          phone: { redacted: true },
        },
      });
      expect(rows[1]?.changes).toMatchObject({ address: { redacted: true } });
      expect(rows[1]?.changes).toHaveProperty('openingHours');
      expect(JSON.stringify(rows)).not.toContain('Palma 123');
      expect(JSON.stringify(rows)).not.toContain('Otra 456');
    });

    it('la sucursal de otro comercio del mismo tenant es 404', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const a = await seeder.merchant(tenantId, unique('A'));
      const b = await seeder.merchant(tenantId, unique('B'));
      const branchOfA = await seeder.branch(tenantId, a);
      await as(userId).patch(`/${b}/branches/${branchOfA}`, { city: 'Luque' }).expect(404);
      await as(userId).post(`/${b}/branches/${branchOfA}/archive`).expect(404);
    });

    it('400 con horario inválido', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const id = await seeder.merchant(tenantId, unique('Horario'));
      const res = await as(userId)
        .post(`/${id}/branches`, {
          ...BRANCH,
          openingHours: { mon: [{ from: '18:00', to: '08:00' }] },
        })
        .expect(400);
      expect(res.body.issues[0].path).toBe('openingHours.mon.0.to');
    });
  });
});
