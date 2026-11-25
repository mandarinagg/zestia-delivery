import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { storeSession } from '@/lib/session';
import { authApi } from './auth-api';

/** Cierra la sesión (`POST /auth/logout`), olvida lo que había en memoria y vuelve al ingreso. */
export function useLogout(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try {
      await authApi.logout();
    } catch {
      /* La cookie se borra igual al vencer; localmente se olvida la sesión. */
    }
    queryClient.clear();
    storeSession(queryClient, null);
    await navigate({ to: '/ingreso' });
  };
}
