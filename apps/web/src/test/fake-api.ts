import {
  type AuthMembership,
  type AuthSessionResponse,
  SESSION_ABSOLUTE_REMAINING_HEADER,
  SESSION_IDLE_REMAINING_HEADER,
  changePasswordRequestSchema,
} from '@zestia/contracts';
import { FakeAudit } from './fake-audit';
import { FakeMembers } from './fake-members';
import { FakeMerchants } from './fake-merchants';

/**
 * SOLO TESTS. Servidor de autenticación en memoria detrás de `fetch`, con el mismo contrato que
 * la API real (`/api/v1/auth`, docs/API_CONTRACTS.md): sesión, CSRF en mutaciones, error
 * genérico de credenciales, rate limit, cambio de empresa y reset por token.
 *
 * `test-setup.ts` lo instala antes de cada test con una sesión iniciada (Propietario de una
 * sola empresa), así las pantallas del panel se pueden probar sin repetir el ingreso.
 */

export interface FakeUser {
  id: string;
  name: string;
  email: string;
  password: string;
  memberships: AuthMembership[];
}

export interface RecordedRequest {
  method: string;
  path: string;
  /** Parámetros de la URL (sin `?`), para ver qué filtros mandó la pantalla. */
  query: URLSearchParams;
  csrf: string | null;
  body: unknown;
}

export const TENANT_A = '0192f0c4-0000-7000-8000-00000000000a';
export const TENANT_B = '0192f0c4-0000-7000-8000-00000000000b';
export const TENANT_SUSPENDED = '0192f0c4-0000-7000-8000-00000000000c';

export const OWNER: FakeUser = {
  id: '0192f0c4-0000-7000-8000-000000000001',
  name: 'Ana Propietaria',
  email: 'ana@zestia.test',
  password: 'contraseña-de-prueba',
  memberships: [
    {
      tenantId: TENANT_A,
      tenantName: 'Delivery Demo Asunción',
      tenantSlug: 'demo-asuncion',
      tenantStatus: 'ACTIVE',
      role: 'OWNER',
    },
  ],
};

/** Usuario con varias empresas (una suspendida): pasa por el selector. */
export const MULTI: FakeUser = {
  id: '0192f0c4-0000-7000-8000-000000000002',
  name: 'Beto Multiempresa',
  email: 'beto@zestia.test',
  password: 'otra-contraseña-larga',
  memberships: [
    {
      tenantId: TENANT_A,
      tenantName: 'Delivery Demo Asunción',
      tenantSlug: 'demo-asuncion',
      tenantStatus: 'ACTIVE',
      role: 'OPERATOR',
    },
    {
      tenantId: TENANT_B,
      tenantName: 'Mensajería Luque',
      tenantSlug: 'mensajeria-luque',
      tenantStatus: 'ACTIVE',
      role: 'ADMIN',
    },
    {
      tenantId: TENANT_SUSPENDED,
      tenantName: 'Envíos Pausados',
      tenantSlug: 'envios-pausados',
      tenantStatus: 'SUSPENDED',
      role: 'OWNER',
    },
  ],
};

export const COURIER: FakeUser = {
  id: '0192f0c4-0000-7000-8000-000000000003',
  name: 'Carla Repartidora',
  email: 'carla@zestia.test',
  password: 'contraseña-de-carla',
  memberships: [{ ...OWNER.memberships[0]!, role: 'COURIER' }],
};

/** Operador: puede ver comercios, no gestionarlos. */
export const OPERATOR: FakeUser = {
  id: '0192f0c4-0000-7000-8000-000000000005',
  name: 'Olga Operadora',
  email: 'olga@zestia.test',
  password: 'contraseña-de-olga',
  memberships: [{ ...OWNER.memberships[0]!, role: 'OPERATOR' }],
};

export const MERCHANT: FakeUser = {
  id: '0192f0c4-0000-7000-8000-000000000004',
  name: 'Mario Comercio',
  email: 'mario@zestia.test',
  password: 'contraseña-de-mario',
  memberships: [{ ...OWNER.memberships[0]!, role: 'MERCHANT' }],
};

/** Token de reset válido (formato real: 43 caracteres base64url). */
export const VALID_RESET_TOKEN = 'a'.repeat(43);
export const EXPIRED_RESET_TOKEN = 'b'.repeat(43);

const CSRF = 'csrf-de-prueba';

class FakeApi {
  users: FakeUser[] = [];
  session: { userId: string; activeTenantId: string | null } | null = null;
  requests: RecordedRequest[] = [];
  /** Sin red: `fetch` rechaza (como con el servidor apagado). */
  offline = false;
  /** El próximo login responde 429 con `Retry-After` en segundos. */
  loginRetryAfter: number | null = null;
  /** El próximo cambio de contraseña responde 429 con `Retry-After` en segundos. */
  changePasswordRetryAfter: number | null = null;
  /**
   * Segundos restantes que la API informa en `X-Session-Idle-Remaining` y
   * `X-Session-Absolute-Remaining` (como el servidor, solo en respuestas de una sesión válida).
   * `null` = no manda el header.
   */
  idleRemaining: number | null = 30 * 60;
  absoluteRemaining: number | null = 12 * 3600;
  /** Token CSRF de la sesión: cambia cuando la sesión rota (cambio de contraseña). */
  csrf = CSRF;
  /** Comercios y sucursales (`/merchants`), por empresa. */
  readonly merchants = new FakeMerchants();
  /** Usuarios de la empresa e invitaciones (`/members`, `/invitations`, `/auth/invitations`). */
  readonly members = new FakeMembers();
  /** Auditoría (`/audit-logs`), por empresa. */
  readonly audit = new FakeAudit();

  reset(options: { as?: FakeUser | null } = {}): void {
    // Copias: aceptar una invitación suma membresías y no debe filtrarse a otros tests.
    this.users = [OWNER, MULTI, COURIER, MERCHANT, OPERATOR].map((u) => ({
      ...u,
      memberships: [...u.memberships],
    }));
    this.merchants.reset();
    this.members.reset(this.users);
    this.audit.reset();
    this.requests = [];
    this.offline = false;
    this.loginRetryAfter = null;
    this.changePasswordRetryAfter = null;
    this.csrf = CSRF;
    this.idleRemaining = 30 * 60;
    this.absoluteRemaining = 12 * 3600;
    const as = options.as === undefined ? OWNER : options.as;
    this.session = as ? { userId: as.id, activeTenantId: this.defaultTenant(as) } : null;
  }

  /** Simula que el servidor venció la sesión (inactividad, logout en otra pestaña). */
  expireSession(): void {
    this.session = null;
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const response = await this.handle(input, init);
    // Como la API: tiempo restante en toda respuesta de una sesión válida, nunca en un 401.
    if (this.session && response.status !== 401) {
      if (this.idleRemaining !== null) {
        response.headers.set(SESSION_IDLE_REMAINING_HEADER, String(this.idleRemaining));
      }
      if (this.absoluteRemaining !== null) {
        response.headers.set(SESSION_ABSOLUTE_REMAINING_HEADER, String(this.absoluteRemaining));
      }
    }
    return response;
  };

  private async handle(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    const url = new URL(String(input), 'http://web.test');
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    this.requests.push({
      method,
      path: url.pathname,
      query: url.searchParams,
      csrf: headers.get('x-csrf-token'),
      body,
    });

    const path = url.pathname.replace(/^\/api\/v1/, '');
    const csrfExempt = [
      '/auth/login',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/invitations/preview',
      '/auth/invitations/accept',
    ];
    if (method !== 'GET' && this.session && !csrfExempt.includes(path)) {
      if (headers.get('x-csrf-token') !== this.csrf) return error(403, 'CSRF_TOKEN_INVALID');
    }

    switch (`${method} ${path}`) {
      case 'GET /auth/me':
        return this.session ? json(200, this.sessionBody()) : error(401, 'UNAUTHENTICATED');
      case 'POST /auth/login': {
        if (this.loginRetryAfter !== null) {
          return error(429, 'TOO_MANY_ATTEMPTS', { 'Retry-After': String(this.loginRetryAfter) });
        }
        const { email, password } = body as { email: string; password: string };
        const user = this.users.find((u) => u.email === email.trim().toLowerCase());
        if (!user || user.password !== password) return error(401, 'INVALID_CREDENTIALS');
        this.session = { userId: user.id, activeTenantId: this.defaultTenant(user) };
        return json(200, this.sessionBody());
      }
      case 'POST /auth/logout':
        this.session = null;
        return new Response(null, { status: 204 });
      case 'POST /auth/switch-tenant': {
        if (!this.session) return error(401, 'UNAUTHENTICATED');
        const { tenantId } = body as { tenantId: string };
        const membership = this.user()?.memberships.find((m) => m.tenantId === tenantId);
        if (membership?.tenantStatus !== 'ACTIVE') return error(403, 'NO_ACTIVE_MEMBERSHIP');
        this.session.activeTenantId = tenantId;
        return json(200, this.sessionBody());
      }
      case 'POST /auth/change-password': {
        if (!this.session) return error(401, 'UNAUTHENTICATED');
        if (this.changePasswordRetryAfter !== null) {
          return error(429, 'TOO_MANY_ATTEMPTS', {
            'Retry-After': String(this.changePasswordRetryAfter),
          });
        }
        const parsed = changePasswordRequestSchema.safeParse(body);
        if (!parsed.success) return error(400, 'VALIDATION_FAILED');
        const user = this.user()!;
        if (user.password !== parsed.data.currentPassword) {
          return error(400, 'INVALID_CURRENT_PASSWORD');
        }
        // Como la API: guarda la nueva y rota esta sesión (CSRF nuevo).
        user.password = parsed.data.newPassword;
        this.csrf = `${CSRF}-rotado-${Date.now()}`;
        return json(200, { csrfToken: this.csrf });
      }
      case 'POST /auth/forgot-password':
        return json(202, { message: 'Si la cuenta existe, te enviamos un enlace.' });
      case 'POST /auth/reset-password': {
        const { token } = body as { token: string };
        if (token !== VALID_RESET_TOKEN) return error(400, 'INVALID_OR_EXPIRED_TOKEN');
        this.session = null;
        return new Response(null, { status: 204 });
      }
      default: {
        if (method === 'POST') {
          const open = this.members.handlePublic(path, body, (id) => this.tenantName(id));
          if (open) return reply(open);
        }
        if (!this.session) return error(401, 'UNAUTHENTICATED');
        const tenantId = this.session.activeTenantId;
        const membership = this.user()?.memberships.find((m) => m.tenantId === tenantId);
        if (!tenantId || !membership) return error(403, 'NO_ACTIVE_TENANT');
        const who = { tenantId, role: membership.role, userId: this.session.userId };
        const result =
          this.merchants.handle(method, path, url.searchParams, body, who) ??
          this.members.handle(method, path, url.searchParams, body, who) ??
          this.audit.handle(method, path, url.searchParams, who);
        return result ? reply(result) : error(404, 'NOT_FOUND');
      }
    }
  }

  private tenantName(tenantId: string): string {
    for (const u of this.users) {
      const m = u.memberships.find((x) => x.tenantId === tenantId);
      if (m) return m.tenantName;
    }
    return 'Empresa';
  }

  private user(): FakeUser | undefined {
    return this.users.find((u) => u.id === this.session?.userId);
  }

  private defaultTenant(user: FakeUser): string | null {
    const active = user.memberships.filter((m) => m.tenantStatus === 'ACTIVE');
    return active.length === 1 ? active[0]!.tenantId : null;
  }

  private sessionBody(): AuthSessionResponse {
    const user = this.user()!;
    return {
      user: { id: user.id, name: user.name, email: user.email },
      memberships: user.memberships,
      activeTenantId: this.session!.activeTenantId,
      csrfToken: this.csrf,
    };
  }
}

function reply(r: { status: number; body?: unknown }): Response {
  return r.body === undefined ? new Response(null, { status: r.status }) : json(r.status, r.body);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ statusCode: status, code }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const fakeApi = new FakeApi();
export const FAKE_CSRF_TOKEN = CSRF;
