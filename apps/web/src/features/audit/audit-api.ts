import { infiniteQueryOptions } from '@tanstack/react-query';
import { auditLogPageSchema } from '@zestia/contracts';
import { api } from '@/lib/api';

/** Llamadas a `/api/v1/audit-logs` (#17). Solo lectura; permiso `audit:read`. */

export interface AuditListFilters {
  /** Prefijo de acción: `merchants` incluye `merchants.updated`. */
  action?: string;
  actorId?: string;
  /** Desde (inclusive), ISO UTC. */
  from?: string;
  /** Hasta (exclusive), ISO UTC. */
  to?: string;
}

export const auditKeys = {
  all: ['audit'] as const,
  list: (filters: AuditListFilters) => ['audit', 'list', filters] as const,
};

export function auditListQuery(filters: AuditListFilters) {
  return infiniteQueryOptions({
    queryKey: auditKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      for (const key of ['action', 'actorId', 'from', 'to'] as const) {
        const value = filters[key];
        if (value) params.set(key, value);
      }
      if (pageParam) params.set('cursor', pageParam);
      const query = params.toString();
      return api(`/audit-logs${query ? `?${query}` : ''}`, { schema: auditLogPageSchema, signal });
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}
