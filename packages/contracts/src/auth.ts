import { z } from 'zod';

/**
 * Contratos de autenticación (`/api/v1/auth`, issue #14). Ver docs/API_CONTRACTS.md.
 *
 * La sesión viaja en una cookie HttpOnly que el frontend no lee. Las requests que cambian
 * estado con esa cookie llevan además la cabecera `X-CSRF-Token` con el `csrfToken` recibido
 * en el login o en `GET /me`.
 */

export const CSRF_HEADER = 'x-csrf-token';

/**
 * Tiempo que le queda a la sesión, en segundos enteros (no timestamps: el reloj del cliente no
 * importa). La API los manda en toda respuesta de una sesión válida, ya renovada; el panel los
 * usa para avisar antes de que venza. Idle = por inactividad (nunca pasa el absoluto).
 */
export const SESSION_IDLE_REMAINING_HEADER = 'x-session-idle-remaining';
export const SESSION_ABSOLUTE_REMAINING_HEADER = 'x-session-absolute-remaining';

/** Email normalizado: sin espacios alrededor y en minúsculas (así se guarda y se compara). */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/**
 * Política de contraseñas nuevas (OWASP ASVS 2.1): 12 a 128 caracteres, cualquier carácter
 * (espacios y Unicode incluidos), sin reglas de composición.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** Contraseña ya existente (login / contraseña actual): solo un tope contra abusos. */
const existingPasswordSchema = z.string().min(1).max(256);

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: existingPasswordSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const membershipRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'OPERATOR',
  'SUPERVISOR',
  'COURIER',
  'MERCHANT',
]);

export const authMembershipSchema = z.object({
  tenantId: z.uuid(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  tenantStatus: z.enum(['ACTIVE', 'SUSPENDED']),
  role: membershipRoleSchema,
});
export type AuthMembership = z.infer<typeof authMembershipSchema>;

/** Respuesta de `POST /login`, `GET /me` y `POST /switch-tenant`. */
export const authSessionResponseSchema = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  /** Todas las membresías del usuario (también las de tenants suspendidos, para mostrarlas). */
  memberships: z.array(authMembershipSchema),
  /**
   * Tenant activo YA validado (membresía en un tenant ACTIVE), o `null` si hay que elegir uno
   * (`POST /switch-tenant`).
   */
  activeTenantId: z.uuid().nullable(),
  /** Valor para la cabecera `X-CSRF-Token`. Cambia cuando cambia la sesión (login, password). */
  csrfToken: z.string(),
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const switchTenantRequestSchema = z.strictObject({ tenantId: z.uuid() });
export type SwitchTenantRequest = z.infer<typeof switchTenantRequestSchema>;

export const forgotPasswordRequestSchema = z.strictObject({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/** Siempre la misma respuesta (202), exista o no el email. */
export const forgotPasswordResponseSchema = z.object({ message: z.string() });
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

/** Token del enlace del email: 32 bytes aleatorios en base64url (43 caracteres). */
export const passwordResetTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const resetPasswordRequestSchema = z.strictObject({
  token: passwordResetTokenSchema,
  password: newPasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: existingPasswordSchema,
  newPassword: newPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** El cambio de contraseña rota la sesión: hay un `csrfToken` nuevo. */
export const changePasswordResponseSchema = z.object({ csrfToken: z.string() });
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

/** Códigos de error (`code`) de los endpoints de autenticación. */
export const authErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'TOO_MANY_ATTEMPTS',
  'UNAUTHENTICATED',
  'CSRF_ORIGIN_REJECTED',
  'CSRF_TOKEN_INVALID',
  'NO_ACTIVE_MEMBERSHIP',
  'INVALID_OR_EXPIRED_TOKEN',
  'INVALID_CURRENT_PASSWORD',
]);
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;

export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
