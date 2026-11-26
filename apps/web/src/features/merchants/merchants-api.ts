import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import {
  type Branch,
  type CreateBranch,
  type CreateMerchant,
  type MerchantStatus,
  type MerchantSummary,
  type UpdateBranch,
  type UpdateMerchant,
  branchSchema,
  merchantDetailSchema,
  merchantPageSchema,
  merchantSummarySchema,
} from '@zestia/contracts';
import { api } from '@/lib/api';

/** Llamadas a `/api/v1/merchants` (#19) y claves de React Query. */

export interface MerchantListFilters {
  status?: MerchantStatus;
  q?: string;
}

export const merchantKeys = {
  all: ['merchants'] as const,
  list: (filters: MerchantListFilters) => ['merchants', 'list', filters] as const,
  detail: (id: string) => ['merchants', 'detail', id] as const,
};

export function merchantListQuery(filters: MerchantListFilters) {
  return infiniteQueryOptions({
    queryKey: merchantKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.q) params.set('q', filters.q);
      if (pageParam) params.set('cursor', pageParam);
      const query = params.toString();
      return api(`/merchants${query ? `?${query}` : ''}`, { schema: merchantPageSchema, signal });
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function merchantDetailQuery(id: string) {
  return queryOptions({
    queryKey: merchantKeys.detail(id),
    queryFn: ({ signal }) => api(`/merchants/${id}`, { schema: merchantDetailSchema, signal }),
  });
}

export type MerchantTransition = 'suspend' | 'reactivate' | 'archive';

export const merchantsApi = {
  create: (body: CreateMerchant): Promise<MerchantSummary> =>
    api('/merchants', { method: 'POST', body, schema: merchantSummarySchema }),
  update: (id: string, body: UpdateMerchant): Promise<MerchantSummary> =>
    api(`/merchants/${id}`, { method: 'PATCH', body, schema: merchantSummarySchema }),
  transition: (id: string, transition: MerchantTransition): Promise<MerchantSummary> =>
    api(`/merchants/${id}/${transition}`, { method: 'POST', schema: merchantSummarySchema }),
  createBranch: (merchantId: string, body: CreateBranch): Promise<Branch> =>
    api(`/merchants/${merchantId}/branches`, { method: 'POST', body, schema: branchSchema }),
  updateBranch: (merchantId: string, branchId: string, body: UpdateBranch): Promise<Branch> =>
    api(`/merchants/${merchantId}/branches/${branchId}`, {
      method: 'PATCH',
      body,
      schema: branchSchema,
    }),
  archiveBranch: (merchantId: string, branchId: string): Promise<void> =>
    api(`/merchants/${merchantId}/branches/${branchId}/archive`, { method: 'POST' }),
};

/** Después de un cambio: listados y detalle del comercio se vuelven a pedir. */
export function invalidateMerchants(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: merchantKeys.all });
}
