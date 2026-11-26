import { ROLES, can } from '@zestia/auth';
import {
  invitationListSchema,
  invitationPreviewSchema,
  invitationSchema,
  memberPageSchema,
  memberSchema,
} from '@zestia/contracts';
import request, { type Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectTenantIsolation } from '../../testing/expect-tenant-isolation';
import { TEST_WEB_ORIGIN, type TestApp, createTestApp } from '../../testing/test-app';
import { TestSeeder } from '../../testing/test-database';
import { TEST_PRINCIPAL_HEADER } from '../../testing/test-principal.resolver';

const PASSWORD = 'una-contraseña-larga';

describe('usuarios e invitaciones (#18)', () => {
  let app: TestApp;
  let seeder: TestSeeder;

  beforeAll(async () => {
    seeder = TestSeeder.connect();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await seeder.close();
  });

  const http = () => request(app.getHttpServer());

  /** Requests como un usuario (cabecera de test), con Origin válido. */
  const as = (userId: string) => {
    const sign = (t: Test) => t.set(TEST_PRINCIPAL_HEADER, userId).set('Origin', TEST_WEB_ORIGIN);
    return {
      get: (path: string) => sign(http().get(`/api/v1${path}`)),
      post: (path: string, body?: object) => sign(http().post(`/api/v1${path}`)).send(body),
      patch: (path: string, body: object) => sign(http().patch(`/api/v1${path}`)).send(body),
    };
  };

  /** Sin sesión (la persona invitada). */
  const anonymous = (path: string, body: object) =>
    http().post(`/api/v1/auth/invitations/${path}`).set('Origin', TEST_WEB_ORIGIN).send(body);

  /** Otro miembro del tenant con su propia cuenta. */
  const member = async (
    tenantId: string,
    role: Parameters<TestSeeder['membership']>[2],
    name = 'Miembro',
  ) => {
    const userId = await seeder.user(name);
    const id = await seeder.membership(tenantId, userId, role);
    return { id, userId };
  };

  const auditRows = (tenantId: string, entityId: string) =>
    seeder.query<{ action: string; changes: unknown; metadata: unknown; actor_id: string }>(
      `SELECT action, changes, metadata, actor_id FROM audit_logs
        WHERE tenant_id = $1 AND entity_id = $2 ORDER BY id`,
      [tenantId, entityId],
    );

  const tokenFrom = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1];

  describe('aislamiento de tenant en cada endpoint con id', () => {
    const withOrigin = (t: Test) => t.set('Origin', TEST_WEB_ORIGIN);
    const seedMember = async (tenantId: string) => (await member(tenantId, 'OPERATOR')).id;
    const seedDisabled = async (tenantId: string) => {
      const { id } = await member(tenantId, 'OPERATOR');
      await seeder.setMembershipStatus(id, 'DISABLED');
      return id;
    };
    const seedInvitation = async (tenantId: string) => (await seeder.invitation(tenantId)).id;

    it.each([
      ['GET /members/:id', seedMember, (h, id) => h.get(`/api/v1/members/${id}`), 200],
      [
        'PATCH /members/:id',
        seedMember,
        (h, id) => withOrigin(h.patch(`/api/v1/members/${id}`)).send({ role: 'SUPERVISOR' }),
        200,
      ],
      [
        'POST /members/:id/disable',
        seedMember,
        (h, id) => withOrigin(h.post(`/api/v1/members/${id}/disable`)),
        200,
      ],
      [
        'POST /members/:id/enable',
        seedDisabled,
        (h, id) => withOrigin(h.post(`/api/v1/members/${id}/enable`)),
        200,
      ],
      [
        'POST /invitations/:id/resend',
        seedInvitation,
        (h, id) => withOrigin(h.post(`/api/v1/invitations/${id}/resend`)),
        200,
      ],
      [
        'POST /invitations/:id/revoke',
        seedInvitation,
        (h, id) => withOrigin(h.post(`/api/v1/invitations/${id}/revoke`)),
        204,
      ],
    ] as const satisfies readonly [
      string,
      (tenantId: string) => Promise<string>,
      (h: ReturnType<typeof request>, id: string) => Test,
      number,
    ][])('%s', async (_label, seed, req, ownerStatus) => {
      const report = await expectTenantIsolation({ app, seeder, seed, request: req, ownerStatus });
      expect(report.statuses['intruder -> foreign id']).toBe(404);
    });

    it('el listado de miembros e invitaciones solo trae lo del tenant activo', async () => {
      const a = await seeder.tenantWithMember('OWNER');
      const b = await seeder.tenantWithMember('OWNER');
      await member(b.tenantId, 'OPERATOR', 'De B');
      await seeder.invitation(b.tenantId, { email: 'de-b@invitado.invalid' });
      const members = memberPageSchema.parse((await as(a.userId).get('/members').expect(200)).body);
      expect(members.data.map((m) => m.userId)).toEqual([a.userId]);
      const invitations = invitationListSchema.parse(
        (await as(a.userId).get('/invitations').expect(200)).body,
      );
      expect(invitations.data).toEqual([]);
    });
  });

  describe('permisos', () => {
    for (const role of ROLES) {
      const read = can(role, 'users:read');
      const manage = can(role, 'users:manage');
      it(`${role}: ver ${read ? 'sí' : 'no'}, gestionar ${manage ? 'sí' : 'no'}`, async () => {
        const { tenantId, userId } = await seeder.tenantWithMember(role);
        const target = await member(tenantId, 'OPERATOR');
        const invitation = await seeder.invitation(tenantId);
        const api = as(userId);
        const reads = [
          api.get('/members'),
          api.get(`/members/${target.id}`),
          api.get('/invitations'),
        ];
        for (const res of await Promise.all(reads)) {
          expect(res.status, res.text).toBe(read ? 200 : 403);
        }
        const writes = [
          () => api.patch(`/members/${target.id}`, { role: 'SUPERVISOR' }),
          () => api.post(`/members/${target.id}/disable`),
          () => api.post(`/members/${target.id}/enable`),
          () =>
            api.post('/invitations', { email: `nuevo-${tenantId}@x.invalid`, role: 'OPERATOR' }),
          () => api.post(`/invitations/${invitation.id}/resend`),
          () => api.post(`/invitations/${invitation.id}/revoke`),
        ];
        for (const write of writes) {
          const res = await write();
          if (manage) expect(res.status, res.text).not.toBe(403);
          else expect(res.body).toEqual({ statusCode: 403, code: 'PERMISSION_DENIED' });
        }
      });
    }

    it('un Admin no puede dar, quitar ni tocar el rol Propietario; un Propietario sí', async () => {
      const { tenantId, userId: ownerId } = await seeder.tenantWithMember('OWNER');
      const admin = await member(tenantId, 'ADMIN');
      const operator = await member(tenantId, 'OPERATOR');
      const otherOwner = await member(tenantId, 'OWNER');
      const ownerInvite = await seeder.invitation(tenantId, { role: 'OWNER' });
      const denied = { statusCode: 403, code: 'PERMISSION_DENIED' };
      const asAdmin = as(admin.userId);

      expect((await asAdmin.patch(`/members/${operator.id}`, { role: 'OWNER' })).body).toEqual(
        denied,
      );
      expect((await asAdmin.patch(`/members/${otherOwner.id}`, { role: 'ADMIN' })).body).toEqual(
        denied,
      );
      expect((await asAdmin.post(`/members/${otherOwner.id}/disable`)).body).toEqual(denied);
      expect(
        (await asAdmin.post('/invitations', { email: 'jefe@x.invalid', role: 'OWNER' })).body,
      ).toEqual(denied);
      expect((await asAdmin.post(`/invitations/${ownerInvite.id}/revoke`)).body).toEqual(denied);
      // Lo que sí puede: roles que no son Propietario.
      await asAdmin.patch(`/members/${operator.id}`, { role: 'SUPERVISOR' }).expect(200);

      const asOwner = as(ownerId);
      await asOwner.patch(`/members/${operator.id}`, { role: 'OWNER' }).expect(200);
      await asOwner.patch(`/members/${otherOwner.id}`, { role: 'ADMIN' }).expect(200);
      await asOwner.post(`/invitations/${ownerInvite.id}/revoke`).expect(204);
    });

    it('Repartidor y Comercio no se asignan en R1', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const target = await member(tenantId, 'OPERATOR');
      const api = as(userId);
      await api.patch(`/members/${target.id}`, { role: 'COURIER' }).expect(400);
      await api.post('/invitations', { email: 'r@x.invalid', role: 'MERCHANT' }).expect(400);
    });
  });

  describe('miembros', () => {
    it('lista por nombre con búsqueda, filtro por estado y cursor', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      await seeder.query('UPDATE users SET name = $2 WHERE id = $1', [userId, 'Zoe Admin']);
      const ids: Record<string, string> = {};
      for (const name of ['Carla', 'Ana', 'Bruno', 'Dario']) {
        ids[name] = (await member(tenantId, 'OPERATOR', name)).id;
      }
      await seeder.setMembershipStatus(ids.Dario!, 'DISABLED');
      const api = as(userId);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2';
        const page = memberPageSchema.parse((await api.get(`/members${query}`).expect(200)).body);
        seen.push(...page.data.map((m) => m.name));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual(['Ana', 'Bruno', 'Carla', 'Dario', 'Zoe Admin']);

      const disabled = memberPageSchema.parse(
        (await api.get('/members?status=DISABLED').expect(200)).body,
      );
      expect(disabled.data.map((m) => m.name)).toEqual(['Dario']);
      const byName = memberPageSchema.parse((await api.get('/members?q=RUN').expect(200)).body);
      expect(byName.data.map((m) => m.name)).toEqual(['Bruno']);
      const [anaMember] = byName.data;
      expect(anaMember).not.toHaveProperty('tenantId');

      const byEmail = memberPageSchema.parse(
        (await api.get(`/members?q=${TestSeeder.emailOf(userId).slice(0, 12)}`).expect(200)).body,
      );
      expect(byEmail.data.map((m) => m.userId)).toEqual([userId]);
      await api.get('/members?cursor=nope').expect(400);
    });

    it('cambia el rol y lo audita', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const target = await member(tenantId, 'OPERATOR');
      const res = await as(userId).patch(`/members/${target.id}`, { role: 'ADMIN' }).expect(200);
      expect(memberSchema.parse(res.body)).toMatchObject({
        role: 'ADMIN',
        status: 'ACTIVE',
        accountStatus: 'ACTIVE',
      });
      await seeder.setUserStatus(target.userId, 'DISABLED');
      const disabledAccount = await as(userId).get(`/members/${target.id}`).expect(200);
      expect(disabledAccount.body).toMatchObject({ status: 'ACTIVE', accountStatus: 'DISABLED' });
      expect(await auditRows(tenantId, target.id)).toEqual([
        {
          action: 'users.role_changed',
          actor_id: userId,
          changes: { role: { from: 'OPERATOR', to: 'ADMIN' } },
          metadata: { userId: target.userId },
        },
      ]);
      // Mismo rol: sin cambio ni auditoría.
      await as(userId).patch(`/members/${target.id}`, { role: 'ADMIN' }).expect(200);
      expect(await auditRows(tenantId, target.id)).toHaveLength(1);
    });

    it('nadie cambia su propio rol ni se deshabilita', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const [own] = await seeder.query<{ id: string }>(
        'SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, userId],
      );
      const api = as(userId);
      for (const res of [
        await api.patch(`/members/${own!.id}`, { role: 'ADMIN' }),
        await api.post(`/members/${own!.id}/disable`),
      ]) {
        expect(res.body).toEqual({ statusCode: 409, code: 'SELF_MODIFICATION' });
      }
    });

    it('deshabilitar corta el acceso a la empresa en la próxima request; habilitar lo devuelve', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const admin = await member(tenantId, 'ADMIN');
      await as(admin.userId).get('/members').expect(200);

      const res = await as(userId).post(`/members/${admin.id}/disable`).expect(200);
      expect(res.body.status).toBe('DISABLED');
      expect((await as(admin.userId).get('/members').expect(403)).body.code).toBe(
        'NO_ACTIVE_MEMBERSHIP',
      );
      await as(userId).post(`/members/${admin.id}/disable`).expect(409);

      await as(userId).post(`/members/${admin.id}/enable`).expect(200);
      await as(admin.userId).get('/members').expect(200);
      expect((await auditRows(tenantId, admin.id)).map((r) => r.action)).toEqual([
        'users.disabled',
        'users.enabled',
      ]);
    });

    it('dos propietarios quitándose el rol a la vez: siempre queda al menos uno', async () => {
      for (let round = 0; round < 3; round++) {
        const tenantId = await seeder.tenant();
        const a = await member(tenantId, 'OWNER', 'A');
        const b = await member(tenantId, 'OWNER', 'B');
        const results = await Promise.all([
          as(a.userId).patch(`/members/${b.id}`, { role: 'ADMIN' }),
          as(b.userId).patch(`/members/${a.id}`, { role: 'ADMIN' }),
        ]);
        const statuses = results.map((r) => r.status).sort();
        expect(statuses[0]).toBe(200);
        expect([403, 409]).toContain(statuses[1]);
        const [{ n }] = (await seeder.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM memberships
            WHERE tenant_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'`,
          [tenantId],
        )) as [{ n: number }];
        expect(n).toBe(1);
      }
    });
  });

  describe('invitaciones', () => {
    it('invita: manda el email con el enlace, sin guardar el token, y lo audita sin el email', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('ADMIN');
      await seeder.query('UPDATE users SET name = $2 WHERE id = $1', [userId, 'Ana <Admin>']);
      const res = await as(userId)
        .post('/invitations', { email: '  Nueva@Ejemplo.Test ', role: 'OPERATOR' })
        .expect(201);
      const invitation = invitationSchema.parse(res.body);
      expect(invitation).toMatchObject({
        email: 'nueva@ejemplo.test',
        role: 'OPERATOR',
        status: 'PENDING',
        invitedBy: { id: userId, name: 'Ana <Admin>' },
      });
      expect(res.text).not.toMatch(/token/i);

      const [mail] = app.mail.to('nueva@ejemplo.test');
      const token = tokenFrom(mail!.text);
      expect(token).toBeDefined();
      expect(mail!.text).toContain(`${TEST_WEB_ORIGIN}/invitacion#token=`);
      expect(mail!.text).toContain('Operador');
      expect(mail!.html).toContain('Ana &lt;Admin&gt;');
      expect(mail!.html).not.toContain('<Admin>');

      const [row] = await seeder.query<{ token_hash: Buffer }>(
        'SELECT token_hash FROM invitations WHERE id = $1',
        [invitation.id],
      );
      expect(row!.token_hash.toString('base64url')).not.toBe(token);

      const [audit] = await auditRows(tenantId, invitation.id);
      expect(audit).toMatchObject({
        action: 'users.invited',
        actor_id: userId,
        changes: { email: { redacted: true }, role: { from: null, to: 'OPERATOR' } },
      });
      expect(JSON.stringify(audit)).not.toContain('nueva@');
    });

    it('409 si el email ya es miembro o ya tiene una invitación vigente', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const existing = await member(tenantId, 'OPERATOR');
      await seeder.setMembershipStatus(existing.id, 'DISABLED');
      const api = as(userId);
      const already = await api.post('/invitations', {
        email: TestSeeder.emailOf(existing.userId).toUpperCase(),
        role: 'OPERATOR',
      });
      expect(already.body).toEqual({ statusCode: 409, code: 'ALREADY_MEMBER' });

      await api.post('/invitations', { email: 'doble@x.invalid', role: 'OPERATOR' }).expect(201);
      const dup = await api.post('/invitations', { email: 'doble@x.invalid', role: 'ADMIN' });
      expect(dup.body).toEqual({ statusCode: 409, code: 'INVITATION_PENDING' });
    });

    it('una invitación vencida se reemplaza al volver a invitar', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const old = await seeder.invitation(tenantId, {
        email: 'tarde@x.invalid',
        expiresInHours: -1,
      });
      const list = invitationListSchema.parse(
        (await as(userId).get('/invitations').expect(200)).body,
      );
      expect(list.data).toEqual([expect.objectContaining({ id: old.id, status: 'EXPIRED' })]);

      await as(userId)
        .post('/invitations', { email: 'tarde@x.invalid', role: 'ADMIN' })
        .expect(201);
      const [oldRow] = await seeder.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM invitations WHERE id = $1',
        [old.id],
      );
      expect(oldRow!.revoked_at).toBeInstanceOf(Date);
      expect((await auditRows(tenantId, old.id))[0]).toMatchObject({
        action: 'users.invitation_revoked',
        metadata: { reason: 'SUPERSEDED' },
      });
    });

    it('si el email no sale, no queda la invitación (502)', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      app.mail.failNext = true;
      const res = await as(userId).post('/invitations', {
        email: 'caido@x.invalid',
        role: 'OPERATOR',
      });
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ statusCode: 502, code: 'MAIL_DELIVERY_FAILED' });
      const rows = await seeder.query('SELECT id FROM invitations WHERE tenant_id = $1', [
        tenantId,
      ]);
      expect(rows).toEqual([]);
    });

    it('reenviar cambia el token; revocar lo anula', async () => {
      const { tenantId, userId } = await seeder.tenantWithMember('OWNER');
      const invitation = await seeder.invitation(tenantId);
      const api = as(userId);

      const resent = await api.post(`/invitations/${invitation.id}/resend`).expect(200);
      expect(resent.body.status).toBe('PENDING');
      const newToken = tokenFrom(app.mail.to(invitation.email).at(-1)!.text)!;
      await anonymous('preview', { token: invitation.token }).expect(400);
      await anonymous('preview', { token: newToken }).expect(200);

      await api.post(`/invitations/${invitation.id}/revoke`).expect(204);
      await anonymous('preview', { token: newToken }).expect(400);
      const again = await api.post(`/invitations/${invitation.id}/revoke`);
      expect(again.body).toEqual({ statusCode: 409, code: 'INVITATION_CLOSED' });
      expect((await auditRows(tenantId, invitation.id)).map((r) => r.action)).toEqual([
        'users.invitation_resent',
        'users.invitation_revoked',
      ]);
    });
  });

  describe('aceptar una invitación (sin sesión)', () => {
    const tenantNamed = async (name: string) => {
      const tenantId = await seeder.tenant(name);
      const owner = await member(tenantId, 'OWNER', 'Dueña');
      return { tenantId, ownerId: owner.userId };
    };

    it('sin cuenta: elige nombre y contraseña, queda como miembro y puede ingresar', async () => {
      const { tenantId } = await tenantNamed('Mensajería Norte');
      const invitation = await seeder.invitation(tenantId, {
        email: 'persona-nueva@x.invalid',
        role: 'SUPERVISOR',
      });

      const preview = invitationPreviewSchema.parse(
        (await anonymous('preview', { token: invitation.token }).expect(200)).body,
      );
      expect(preview).toMatchObject({
        tenantName: 'Mensajería Norte',
        email: 'persona-nueva@x.invalid',
        role: 'SUPERVISOR',
        accountExists: false,
      });

      const missing = await anonymous('accept', { token: invitation.token });
      expect(missing.body).toEqual({ statusCode: 400, code: 'ACCOUNT_DETAILS_REQUIRED' });

      const res = await anonymous('accept', {
        token: invitation.token,
        name: '  Persona Nueva ',
        password: PASSWORD,
      }).expect(200);
      expect(res.body).toEqual({ accountCreated: true, email: 'persona-nueva@x.invalid' });
      expect(res.headers['set-cookie']).toBeUndefined();

      const [user] = await seeder.query<{ id: string; name: string; role: string }>(
        `SELECT u.id, u.name, m.role FROM users u JOIN memberships m ON m.user_id = u.id
          WHERE u.email = $1`,
        ['persona-nueva@x.invalid'],
      );
      expect(user).toMatchObject({ name: 'Persona Nueva', role: 'SUPERVISOR' });

      const login = await http()
        .post('/api/v1/auth/login')
        .set('Origin', TEST_WEB_ORIGIN)
        .send({ email: 'persona-nueva@x.invalid', password: PASSWORD })
        .expect(200);
      expect(login.body.activeTenantId).toBe(tenantId);

      // Un solo uso.
      const reuse = await anonymous('accept', {
        token: invitation.token,
        name: 'X',
        password: PASSWORD,
      });
      expect(reuse.body).toEqual({ statusCode: 400, code: 'INVITATION_INVALID' });

      const [membership] = await seeder.query<{ id: string }>(
        'SELECT id FROM memberships WHERE user_id = $1',
        [user!.id],
      );
      const [audit] = await auditRows(tenantId, membership!.id);
      expect(audit).toMatchObject({
        action: 'users.invitation_accepted',
        actor_id: user!.id,
        changes: { role: { from: null, to: 'SUPERVISOR' } },
        metadata: { invitationId: invitation.id, accountCreated: true },
      });
    });

    it('con cuenta (de otra empresa): solo suma la membresía y no toca su contraseña ni su nombre', async () => {
      const other = await seeder.tenant();
      const { userId, email } = await seeder.userWithPassword(PASSWORD, 'Ya Existe');
      await seeder.membership(other, userId, 'OPERATOR');
      const { tenantId } = await tenantNamed('Segunda');
      const invitation = await seeder.invitation(tenantId, { email, role: 'ADMIN' });

      const preview = await anonymous('preview', { token: invitation.token }).expect(200);
      expect(preview.body.accountExists).toBe(true);

      const res = await anonymous('accept', {
        token: invitation.token,
        name: 'Otro Nombre',
        password: 'otra-contraseña-cualquiera',
      }).expect(200);
      expect(res.body).toEqual({ accountCreated: false, email });

      const roles = await seeder.query<{ tenant_id: string; role: string }>(
        'SELECT tenant_id, role FROM memberships WHERE user_id = $1 ORDER BY role',
        [userId],
      );
      expect(roles).toEqual(
        expect.arrayContaining([
          { tenant_id: tenantId, role: 'ADMIN' },
          { tenant_id: other, role: 'OPERATOR' },
        ]),
      );
      const [user] = await seeder.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [
        userId,
      ]);
      expect(user!.name).toBe('Ya Existe');
      await http()
        .post('/api/v1/auth/login')
        .set('Origin', TEST_WEB_ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(200);
    });

    it('ya es miembro al aceptar → 409; la invitación sigue abierta para revocarla', async () => {
      const { tenantId } = await tenantNamed('Tercera');
      const { userId, email } = await seeder.userWithPassword(PASSWORD);
      const invitation = await seeder.invitation(tenantId, { email });
      await seeder.membership(tenantId, userId, 'OPERATOR');
      const res = await anonymous('accept', { token: invitation.token });
      expect(res.body).toEqual({ statusCode: 409, code: 'ALREADY_MEMBER' });
    });

    it('vencida, revocada, de empresa suspendida o de cuenta deshabilitada → inválida', async () => {
      const { tenantId } = await tenantNamed('Cuarta');
      const expired = await seeder.invitation(tenantId, { expiresInHours: -1 });
      const revoked = await seeder.invitation(tenantId);
      await seeder.query('UPDATE invitations SET revoked_at = now() WHERE id = $1', [revoked.id]);
      const disabledUser = await seeder.userWithPassword(PASSWORD);
      await seeder.setUserStatus(disabledUser.userId, 'DISABLED');
      const ofDisabled = await seeder.invitation(tenantId, { email: disabledUser.email });

      const suspendedTenant = await seeder.tenant();
      const ofSuspended = await seeder.invitation(suspendedTenant);
      await seeder.suspendTenant(suspendedTenant);

      for (const { token } of [expired, revoked, ofDisabled, ofSuspended]) {
        const preview = await anonymous('preview', { token });
        expect(preview.body).toEqual({ statusCode: 400, code: 'INVITATION_INVALID' });
        const accept = await anonymous('accept', { token, name: 'X', password: PASSWORD });
        expect(accept.body).toEqual({ statusCode: 400, code: 'INVITATION_INVALID' });
      }
      await anonymous('preview', { token: 'b'.repeat(43) }).expect(400);
      const malformed = await anonymous('preview', { token: 'corto' }).expect(400);
      expect(malformed.body.code).toBe('VALIDATION_FAILED');
    });

    it('con la sesión de otra cuenta abierta no hace falta token CSRF (lo autoriza el token del email)', async () => {
      const { tenantId } = await tenantNamed('Quinta');
      const invitation = await seeder.invitation(tenantId);
      const res = await anonymous('preview', { token: invitation.token }).set(
        'Cookie',
        'zd_session=cualquier-cosa',
      );
      expect(res.status).toBe(200);
    });
  });
});
