import { type QueryClient, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Permission, type Role, can } from '@zestia/auth';
import {
  type AuthMembership,
  type AuthSessionResponse,
  authSessionResponseSchema,
} from '@zestia/contracts';
import { ApiError, api, setCsrfToken } from './api';
import { clearSessionDeadlines } from './session-clock';

/**
 * Sesión del usuario: `GET /auth/me` cacheado con React Query. `null` = sin sesión.
 * El servidor es la fuente de verdad (cookie httpOnly): acá solo se refleja lo que respondió.
 */
export type Session = AuthSessionResponse;

export const SESSION_KEY = ['session'] as const;

export const sessionQuery = queryOptions({
  queryKey: SESSION_KEY,
  queryFn: async (): Promise<Session | null> => {
    try {
      return remember(await api('/auth/me', { schema: authSessionResponseSchema }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCsrfToken(null);
        clearSessionDeadlines();
        return null;
      }
      throw error;
    }
  },
  staleTime: 60_000,
});

function remember(session: Session): Session {
  setCsrfToken(session.csrfToken);
  return session;
}

/** Guarda una sesión recibida (login, cambio de empresa) sin volver a pedir `me`. */
export function storeSession(client: QueryClient, session: Session | null): void {
  if (session) remember(session);
  else {
    setCsrfToken(null);
    clearSessionDeadlines();
  }
  client.setQueryData(SESSION_KEY, session);
}

export function activeMembership(session: Session | null | undefined): AuthMembership | null {
  if (!session?.activeTenantId) return null;
  return session.memberships.find((m) => m.tenantId === session.activeTenantId) ?? null;
}

/** Membresías en las que se puede entrar (tenant activo). */
export function selectableMemberships(session: Session): AuthMembership[] {
  return session.memberships.filter((m) => m.tenantStatus === 'ACTIVE');
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Propietario/a',
  ADMIN: 'Administrador/a',
  OPERATOR: 'Operador/a',
  SUPERVISOR: 'Supervisor/a',
  COURIER: 'Repartidor/a',
  MERCHANT: 'Comercio',
};

/**
 * Pantalla de entrada según el rol. Repartidor y Comercio tienen su propia app (R2); el resto
 * usa el panel.
 */
export function homeFor(role: Role): '/panel/' | '/repartidor' | '/comercio' {
  if (role === 'COURIER') return '/repartidor';
  if (role === 'MERCHANT') return '/comercio';
  return '/panel/';
}

export function usesPanel(role: Role): boolean {
  return homeFor(role) === '/panel/';
}

/** Sesión actual (dentro de rutas protegidas ya está cargada). */
export function useSession(): Session | null {
  return useQuery(sessionQuery).data ?? null;
}

/**
 * ¿El usuario puede hacer esto en la empresa activa? Solo para mostrar u ocultar: la API
 * decide de verdad.
 */
export function useCan(permission: Permission): boolean {
  const membership = activeMembership(useSession());
  return membership ? can(membership.role, permission) : false;
}

export function useSessionClient(): QueryClient {
  return useQueryClient();
}
