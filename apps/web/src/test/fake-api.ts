import type { AuthMembership, AuthSessionResponse } from '@zestia/contracts';
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
  /** Comercios y sucursales (`/merchants`), por empresa. */
  readonly merchants = new FakeMerchants();

  reset(options: { as?: FakeUser | null } = {}): void {
    this.users = [OWNER, MULTI, COURIER, MERCHANT, OPERATOR];
    this.merchants.reset();
    this.requests = [];
    this.offline = false;
    this.loginRetryAfter = null;
    const as = options.as === undefined ? OWNER : options.as;
    this.session = as ? { userId: as.id, activeTenantId: this.defaultTenant(as) } : null;
  }

  /** Simula que el servidor venció la sesión (inactividad, logout en otra pestaña). */
  expireSession(): void {
    this.session = null;
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const url = new URL(String(input), 'http://web.test');
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, path: url.pathname, csrf: headers.get('x-csrf-token'), body });

    const path = url.pathname.replace(/^\/api\/v1/, '');
    const csrfExempt = ['/auth/login', '/auth/forgot-password', '/auth/reset-password'];
    if (method !== 'GET' && this.session && !csrfExempt.includes(path)) {
      if (headers.get('x-csrf-token') !== CSRF) return error(403, 'CSRF_TOKEN_INVALID');
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
      case 'POST /auth/forgot-password':
        return json(202, { message: 'Si la cuenta existe, te enviamos un enlace.' });
      case 'POST /auth/reset-password': {
        const { token } = body as { token: string };
        if (token !== VALID_RESET_TOKEN) return error(400, 'INVALID_OR_EXPIRED_TOKEN');
        this.session = null;
        return new Response(null, { status: 204 });
      }
      default: {
        if (!this.session) return error(401, 'UNAUTHENTICATED');
        const tenantId = this.session.activeTenantId;
        const membership = this.user()?.memberships.find((m) => m.tenantId === tenantId);
        if (!tenantId || !membership) return error(403, 'NO_ACTIVE_TENANT');
        const reply = this.merchants.handle(method, path, url.searchParams, body, {
          tenantId,
          role: membership.role,
        });
        if (!reply) return error(404, 'NOT_FOUND');
        return reply.body === undefined
          ? new Response(null, { status: reply.status })
          : json(reply.status, reply.body);
      }
    }
  };

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
      csrfToken: CSRF,
    };
  }
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
