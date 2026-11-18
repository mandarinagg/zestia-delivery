import { type Role, can } from '@zestia/auth';
import {
  type Invitation,
  type Member,
  type MembershipStatus,
  acceptInvitationSchema,
  createInvitationSchema,
  invitationPreviewRequestSchema,
  memberListQuerySchema,
  updateMemberSchema,
} from '@zestia/contracts';
import type { z } from 'zod';
import type { FakeUser } from './fake-api';

/**
 * SOLO TESTS. `/api/v1/members`, `/api/v1/invitations` y `/api/v1/auth/invitations/*` en memoria
 * (#18), con los esquemas de `@zestia/contracts` y las mismas reglas que la API real: permisos,
 * Propietario solo para Propietarios, nadie se modifica a sí mismo, siempre queda un Propietario.
 */

type Reply = { status: number; body?: unknown };

interface StoredMember {
  id: string;
  tenantId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
  createdAt: string;
}

interface StoredInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  token: string;
  invitedBy: { id: string; name: string } | null;
  expiresAt: string;
  createdAt: string;
  closed: boolean;
}

const NOW = '2026-11-18T12:00:00.000Z';
const IN_A_WEEK = '2026-11-25T12:00:00.000Z';
const YESTERDAY = '2026-11-17T12:00:00.000Z';
let seq = 0;
const nextId = () => `0192f0c4-2000-7000-8000-${String(++seq).padStart(12, '0')}`;
const nextToken = () => String(++seq).padStart(43, 't');

const err = (status: number, code: string, extra: object = {}): Reply => ({
  status,
  body: { statusCode: status, code, ...extra },
});

function validate<S extends z.ZodType>(
  schema: S,
  value: unknown,
): { ok: true; data: z.output<S> } | { ok: false; reply: Reply } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    reply: err(400, 'VALIDATION_FAILED', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }),
  };
}

export class FakeMembers {
  private members: StoredMember[] = [];
  private invitations: StoredInvitation[] = [];
  private users: FakeUser[] = [];
  /** Emails que recibieron una invitación (con su token), para leer "el correo". */
  readonly outbox: { to: string; token: string }[] = [];

  /** Las membresías salen de los usuarios falsos (que se comparten con la sesión). */
  reset(users: FakeUser[]): void {
    this.users = users;
    this.invitations = [];
    this.outbox.length = 0;
    this.members = users.flatMap((u) =>
      u.memberships.map((m) => ({
        id: nextId(),
        tenantId: m.tenantId,
        userId: u.id,
        role: m.role,
        status: 'ACTIVE' as const,
        createdAt: NOW,
      })),
    );
  }

  /** Agrega una persona a una empresa (cuenta + membresía). */
  seedMember(user: FakeUser, tenantId: string, role: Role, status: MembershipStatus = 'ACTIVE') {
    if (!this.users.some((u) => u.id === user.id)) this.users.push(user);
    const member: StoredMember = {
      id: nextId(),
      tenantId,
      userId: user.id,
      role,
      status,
      createdAt: NOW,
    };
    this.members.push(member);
    return member;
  }

  seedInvitation(
    tenantId: string,
    data: { email: string; role?: Role; expired?: boolean; closed?: boolean },
  ): { id: string; token: string } {
    const invitation: StoredInvitation = {
      id: nextId(),
      tenantId,
      email: data.email,
      role: data.role ?? 'OPERATOR',
      token: nextToken(),
      invitedBy: null,
      expiresAt: data.expired ? YESTERDAY : IN_A_WEEK,
      createdAt: NOW,
      closed: data.closed ?? false,
    };
    this.invitations.push(invitation);
    return { id: invitation.id, token: invitation.token };
  }

  /** `/members…` y `/invitations…` del tenant activo. `null` si no es de este módulo. */
  handle(
    method: string,
    path: string,
    search: URLSearchParams,
    body: unknown,
    who: { tenantId: string; role: Role; userId: string },
  ): Reply | null {
    const members = /^\/members(?:\/([^/]+))?(?:\/(disable|enable))?$/.exec(path);
    const invitations = /^\/invitations(?:\/([^/]+)\/(resend|revoke))?$/.exec(path);
    if (!members && !invitations) return null;
    const permission = method === 'GET' ? 'users:read' : 'users:manage';
    if (!can(who.role, permission)) return err(403, 'PERMISSION_DENIED');
    const ownersOk = can(who.role, 'users:manage-owners');

    if (members) {
      const [, id, action] = members;
      if (!id && method === 'GET') return this.list(who.tenantId, search);
      const member = this.members.find((m) => m.id === id && m.tenantId === who.tenantId);
      if (!member) return err(404, 'NOT_FOUND');
      if (!action && method === 'GET') return { status: 200, body: this.view(member) };
      if (member.userId === who.userId) return err(409, 'SELF_MODIFICATION');

      if (!action && method === 'PATCH') {
        const parsed = validate(updateMemberSchema, body);
        if (!parsed.ok) return parsed.reply;
        const { role } = parsed.data;
        if ((member.role === 'OWNER' || role === 'OWNER') && !ownersOk) {
          return err(403, 'PERMISSION_DENIED');
        }
        if (member.role === 'OWNER' && role !== 'OWNER' && this.lastOwner(member)) {
          return err(409, 'LAST_OWNER');
        }
        member.role = role;
        return { status: 200, body: this.view(member) };
      }
      if (action && method === 'POST') {
        if (member.role === 'OWNER' && !ownersOk) return err(403, 'PERMISSION_DENIED');
        const to: MembershipStatus = action === 'disable' ? 'DISABLED' : 'ACTIVE';
        if (member.status === to) return err(409, 'INVALID_STATUS_TRANSITION');
        if (to === 'DISABLED' && member.role === 'OWNER' && this.lastOwner(member)) {
          return err(409, 'LAST_OWNER');
        }
        member.status = to;
        return { status: 200, body: this.view(member) };
      }
      return err(404, 'NOT_FOUND');
    }

    const [, id, action] = invitations!;
    if (!id && method === 'GET') {
      const open = this.invitations
        .filter((i) => i.tenantId === who.tenantId && !i.closed)
        .reverse()
        .map((i) => this.invitationView(i));
      return { status: 200, body: { data: open } };
    }
    if (!id && method === 'POST') {
      const parsed = validate(createInvitationSchema, body);
      if (!parsed.ok) return parsed.reply;
      const { email, role } = parsed.data;
      if (role === 'OWNER' && !ownersOk) return err(403, 'PERMISSION_DENIED');
      const user = this.users.find((u) => u.email === email);
      if (user && this.members.some((m) => m.tenantId === who.tenantId && m.userId === user.id)) {
        return err(409, 'ALREADY_MEMBER');
      }
      const open = this.invitations.find(
        (i) => i.tenantId === who.tenantId && i.email === email && !i.closed,
      );
      if (open && open.expiresAt > NOW) return err(409, 'INVITATION_PENDING');
      if (open) open.closed = true;
      const inviter = this.users.find((u) => u.id === who.userId);
      const invitation: StoredInvitation = {
        id: nextId(),
        tenantId: who.tenantId,
        email,
        role,
        token: nextToken(),
        invitedBy: inviter ? { id: inviter.id, name: inviter.name } : null,
        expiresAt: IN_A_WEEK,
        createdAt: NOW,
        closed: false,
      };
      this.invitations.push(invitation);
      this.outbox.push({ to: email, token: invitation.token });
      return { status: 201, body: this.invitationView(invitation) };
    }
    const invitation = this.invitations.find((i) => i.id === id && i.tenantId === who.tenantId);
    if (!invitation || method !== 'POST') return err(404, 'NOT_FOUND');
    if (invitation.role === 'OWNER' && !ownersOk) return err(403, 'PERMISSION_DENIED');
    if (invitation.closed) return err(409, 'INVITATION_CLOSED');
    if (action === 'revoke') {
      invitation.closed = true;
      return { status: 204 };
    }
    invitation.token = nextToken();
    invitation.expiresAt = IN_A_WEEK;
    this.outbox.push({ to: invitation.email, token: invitation.token });
    return { status: 200, body: this.invitationView(invitation) };
  }

  /** `/auth/invitations/preview|accept` (sin sesión en la empresa). */
  handlePublic(
    path: string,
    body: unknown,
    tenantName: (tenantId: string) => string,
  ): Reply | null {
    if (path === '/auth/invitations/preview') {
      const parsed = validate(invitationPreviewRequestSchema, body);
      if (!parsed.ok) return parsed.reply;
      const invitation = this.valid(parsed.data.token);
      if (!invitation) return err(400, 'INVITATION_INVALID');
      return {
        status: 200,
        body: {
          tenantName: tenantName(invitation.tenantId),
          email: invitation.email,
          role: invitation.role,
          accountExists: this.users.some((u) => u.email === invitation.email),
          expiresAt: invitation.expiresAt,
        },
      };
    }
    if (path === '/auth/invitations/accept') {
      const parsed = validate(acceptInvitationSchema, body);
      if (!parsed.ok) return parsed.reply;
      const invitation = this.valid(parsed.data.token);
      if (!invitation) return err(400, 'INVITATION_INVALID');
      let user = this.users.find((u) => u.email === invitation.email);
      const accountCreated = !user;
      if (!user) {
        const { name, password } = parsed.data;
        if (!name || !password) return err(400, 'ACCOUNT_DETAILS_REQUIRED');
        user = { id: nextId(), name, email: invitation.email, password, memberships: [] };
        this.users.push(user);
      } else if (
        this.members.some((m) => m.tenantId === invitation.tenantId && m.userId === user!.id)
      ) {
        return err(409, 'ALREADY_MEMBER');
      }
      user.memberships.push({
        tenantId: invitation.tenantId,
        tenantName: tenantName(invitation.tenantId),
        tenantSlug: 'invitada',
        tenantStatus: 'ACTIVE',
        role: invitation.role,
      });
      this.seedMember(user, invitation.tenantId, invitation.role);
      invitation.closed = true;
      return { status: 200, body: { accountCreated, email: invitation.email } };
    }
    return null;
  }

  private valid(token: string): StoredInvitation | undefined {
    return this.invitations.find((i) => i.token === token && !i.closed && i.expiresAt > NOW);
  }

  private lastOwner(except: StoredMember): boolean {
    return !this.members.some(
      (m) =>
        m.tenantId === except.tenantId &&
        m.id !== except.id &&
        m.role === 'OWNER' &&
        m.status === 'ACTIVE',
    );
  }

  private list(tenantId: string, search: URLSearchParams): Reply {
    const parsed = validate(memberListQuerySchema, Object.fromEntries(search));
    if (!parsed.ok) return parsed.reply;
    const { status, q, cursor, limit } = parsed.data;
    const term = q?.toLowerCase();
    const rows = this.members
      .filter((m) => m.tenantId === tenantId)
      .map((m) => this.view(m))
      .filter((m) => !status || m.status === status)
      .filter((m) => !term || m.name.toLowerCase().includes(term) || m.email.includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    const offset = cursor ? Number(atob(cursor)) : 0;
    const page = rows.slice(offset, offset + limit);
    return {
      status: 200,
      body: {
        data: page,
        nextCursor: offset + limit < rows.length ? btoa(String(offset + limit)) : null,
      },
    };
  }

  private view(m: StoredMember): Member {
    const user = this.users.find((u) => u.id === m.userId)!;
    return {
      id: m.id,
      userId: m.userId,
      name: user.name,
      email: user.email,
      role: m.role,
      status: m.status,
      accountStatus: 'ACTIVE',
      createdAt: m.createdAt,
    };
  }

  private invitationView(i: StoredInvitation): Invitation {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      status: i.expiresAt > NOW ? 'PENDING' : 'EXPIRED',
      invitedBy: i.invitedBy,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    };
  }
}
