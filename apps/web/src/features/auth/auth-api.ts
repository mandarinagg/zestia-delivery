import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  authSessionResponseSchema,
  forgotPasswordResponseSchema,
} from '@zestia/contracts';
import { z } from 'zod';
import { ApiError, NetworkError, api } from '@/lib/api';
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

export const resetSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Ingresá una contraseña nueva.')
      .min(MIN_PASSWORD, `Usá al menos ${MIN_PASSWORD} caracteres.`)
      .max(PASSWORD_MAX_LENGTH, `Usá como mucho ${PASSWORD_MAX_LENGTH} caracteres.`),
    confirm: z.string().min(1, 'Repetí la contraseña.'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden.',
  });
export type ResetValues = z.infer<typeof resetSchema>;

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

/** Texto para una persona a partir de un error de la API (sin detalles técnicos). */
export function describeAuthError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.';
  }
  if (error instanceof ApiError) {
    if (error.code === 'TOO_MANY_ATTEMPTS') {
      const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
      return minutes
        ? `Hubo demasiados intentos. Esperá ${minutes === 1 ? '1 minuto' : `${minutes} minutos`} y probá de nuevo.`
        : 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.';
    }
    if (error.code === 'CSRF_ORIGIN_REJECTED' || error.code === 'CSRF_TOKEN_INVALID') {
      return 'Tu sesión se desactualizó. Recargá la página y probá de nuevo.';
    }
  }
  return 'Algo salió mal de nuestro lado. Probá de nuevo en un momento.';
}
