import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  authSessionResponseSchema,
  changePasswordResponseSchema,
  forgotPasswordResponseSchema,
} from '@zestia/contracts';
import { z } from 'zod';
import { api } from '@/lib/api';
import type { Session } from '@/lib/session';

/** Llamadas a `/api/v1/auth` (contratos en `@zestia/contracts`, docs/API_CONTRACTS.md). */
export const authApi = {
  login: (email: string, password: string): Promise<Session> =>
    api('/auth/login', {
      method: 'POST',
      body: { email, password },
      schema: authSessionResponseSchema,
    }),
  logout: (): Promise<void> => api('/auth/logout', { method: 'POST' }),
  /**
   * Estado de la sesión SIN renovarla (204; los tiempos vienen en los headers que lee
   * `lib/api.ts`). 401 si la sesión ya terminó.
   */
  sessionStatus: (): Promise<void> => api('/auth/session-status'),
  switchTenant: (tenantId: string): Promise<Session> =>
    api('/auth/switch-tenant', {
      method: 'POST',
      body: { tenantId },
      schema: authSessionResponseSchema,
    }),
  forgotPassword: async (email: string): Promise<void> => {
    await api('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      schema: forgotPasswordResponseSchema,
    });
  },
  resetPassword: (token: string, password: string): Promise<void> =>
    api('/auth/reset-password', { method: 'POST', body: { token, password } }),
  /** Rota la sesión: devuelve el `csrfToken` nuevo (el anterior deja de servir). */
  changePassword: async (currentPassword: string, newPassword: string): Promise<string> => {
    const { csrfToken } = await api('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
      schema: changePasswordResponseSchema,
    });
    return csrfToken;
  },
};

/* --- Formularios (mensajes para personas; el servidor valida de nuevo) ------------------- */

const emailField = z
  .string()
  .trim()
  .min(1, 'Ingresá tu correo.')
  .max(254, 'Revisá el correo: es demasiado largo.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Revisá el correo. Ejemplo: nombre@empresa.com.py');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Ingresá tu contraseña.').max(256, 'Revisá la contraseña.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: emailField });
export type ForgotValues = z.infer<typeof forgotSchema>;

/** Mismo rango que el backend (`PASSWORD_MIN_LENGTH`/`MAX` de los contratos). */
export const MIN_PASSWORD = PASSWORD_MIN_LENGTH;

const newPasswordField = z
  .string()
  .min(1, 'Ingresá una contraseña nueva.')
  .min(MIN_PASSWORD, `Usá al menos ${MIN_PASSWORD} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `Usá como mucho ${PASSWORD_MAX_LENGTH} caracteres.`);

const sameAsConfirm = {
  path: ['confirm'],
  message: 'Las contraseñas no coinciden.',
};

export const resetSchema = z
  .object({
    password: newPasswordField,
    confirm: z.string().min(1, 'Repetí la contraseña.'),
  })
  .refine((v) => v.password === v.confirm, sameAsConfirm);
export type ResetValues = z.infer<typeof resetSchema>;

/**
 * Cambio de contraseña con sesión. Que la nueva sea distinta de la actual lo pide solo la web
 * (la API no lo exige): repetirla no protege de nada si la actual se filtró.
 */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Ingresá tu contraseña actual.').max(256, 'Revisá la contraseña.'),
    password: newPasswordField,
    confirm: z.string().min(1, 'Repetí la contraseña.'),
  })
  .refine((v) => v.password === v.confirm, sameAsConfirm)
  .refine((v) => v.password === '' || v.password !== v.current, {
    path: ['password'],
    message: 'Tiene que ser distinta de la actual.',
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/** Token del enlace del email: viene en el fragmento (`#token=…`), que no viaja al servidor. */
export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('token')?.trim();
  return token ? token : null;
}

/**
 * Destino después de ingresar. Solo rutas internas: evita redirecciones abiertas
 * (`//otro-sitio`, `https://…`, `/\…`).
 */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\') || value.includes('://')) return null;
  if (value.startsWith('/ingreso')) return null;
  return value;
}
