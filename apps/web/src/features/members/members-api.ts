import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import {
  type AcceptInvitation,
  type AcceptInvitationResponse,
  type AssignableRole,
  type CreateInvitation,
  type Invitation,
  type InvitationPreview,
  type Member,
  type MembershipStatus,
  acceptInvitationResponseSchema,
  invitationListSchema,
  invitationPreviewSchema,
  invitationSchema,
  memberPageSchema,
  memberSchema,
} from '@zestia/contracts';
import { api } from '@/lib/api';

/** Llamadas a `/api/v1/members`, `/api/v1/invitations` y la aceptación (#18). */

export interface MemberListFilters {
  status?: MembershipStatus;
  q?: string;
}

export const memberKeys = {
  all: ['members'] as const,
  list: (filters: MemberListFilters) => ['members', 'list', filters] as const,
  invitations: ['members', 'invitations'] as const,
};

export function memberListQuery(filters: MemberListFilters) {
  return infiniteQueryOptions({
    queryKey: memberKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.q) params.set('q', filters.q);
      if (pageParam) params.set('cursor', pageParam);
      const query = params.toString();
      return api(`/members${query ? `?${query}` : ''}`, { schema: memberPageSchema, signal });
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}

export const invitationListQuery = queryOptions({
  queryKey: memberKeys.invitations,
  queryFn: ({ signal }) => api('/invitations', { schema: invitationListSchema, signal }),
});

export const membersApi = {
  changeRole: (id: string, role: AssignableRole): Promise<Member> =>
    api(`/members/${id}`, { method: 'PATCH', body: { role }, schema: memberSchema }),
  disable: (id: string): Promise<Member> =>
    api(`/members/${id}/disable`, { method: 'POST', schema: memberSchema }),
  enable: (id: string): Promise<Member> =>
    api(`/members/${id}/enable`, { method: 'POST', schema: memberSchema }),
  invite: (body: CreateInvitation): Promise<Invitation> =>
    api('/invitations', { method: 'POST', body, schema: invitationSchema }),
  resend: (id: string): Promise<Invitation> =>
    api(`/invitations/${id}/resend`, { method: 'POST', schema: invitationSchema }),
  revoke: (id: string): Promise<void> => api(`/invitations/${id}/revoke`, { method: 'POST' }),
};

/** Sin sesión en la empresa: autoriza el token del enlace. */
export const invitationAcceptanceApi = {
  preview: (token: string): Promise<InvitationPreview> =>
    api('/auth/invitations/preview', {
      method: 'POST',
      body: { token },
      schema: invitationPreviewSchema,
    }),
  accept: (body: AcceptInvitation): Promise<AcceptInvitationResponse> =>
    api('/auth/invitations/accept', {
      method: 'POST',
      body,
      schema: acceptInvitationResponseSchema,
    }),
};

export function invalidateMembers(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: memberKeys.all });
}
