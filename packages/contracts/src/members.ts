import { z } from 'zod';
import { membershipRoleSchema, newPasswordSchema, passwordResetTokenSchema } from './auth.js';

/*
 * Usuarios del tenant e invitaciones (#18). Ver docs/API_CONTRACTS.md.
 *
 * "Miembro" = la membresía de una cuenta en ESTA empresa: el rol y el estado son de la empresa;
 * nombre y email son de la cuenta (global) y acá son de solo lectura.
 */

/**
 * Roles que se pueden dar por invitación o cambio de rol en R1. Repartidor y Comercio quedan
 * afuera hasta R2: necesitan vincularse a un repartidor o comercio (`courierId`/`merchantId`).
 */
export const ASSIGNABLE_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'SUPERVISOR'] as const;
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES, 'Elegí un rol.');
export type AssignableRole = z.infer<typeof assignableRoleSchema>;

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/* --- Miembros ------------------------------------------------------------------------------ */

export const MEMBERS_PAGE_DEFAULT = 50;
export const MEMBERS_PAGE_MAX = 100;

export const memberListQuerySchema = z.object({
  /** Sin estado: todos. */
  status: membershipStatusSchema.optional(),
  /** Nombre o email contiene (sin distinguir mayúsculas). */
  q: z.string().trim().max(120).optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(MEMBERS_PAGE_MAX).default(MEMBERS_PAGE_DEFAULT),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

export const memberSchema = z.object({
  /** Id de la membresía (no de la cuenta). */
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: membershipRoleSchema,
  /** Estado en ESTA empresa (lo cambia un Admin). */
  status: membershipStatusSchema,
  /**
   * Estado de la cuenta (global, lo gestiona la plataforma). Una cuenta deshabilitada no puede
   * ingresar aunque su membresía esté activa.
   */
  accountStatus: z.enum(['ACTIVE', 'DISABLED']),
  createdAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberPageSchema = z.object({
  data: z.array(memberSchema),
  nextCursor: z.string().nullable(),
});
export type MemberPage = z.infer<typeof memberPageSchema>;

export const updateMemberSchema = z.strictObject({ role: assignableRoleSchema });
export type UpdateMember = z.infer<typeof updateMemberSchema>;

/* --- Invitaciones -------------------------------------------------------------------------- */

const inviteEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Usá como mucho 254 caracteres.')
  .pipe(z.email('Ingresá un correo válido.'));

export const createInvitationSchema = z.strictObject({
  email: inviteEmailSchema,
  role: assignableRoleSchema,
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;
export type CreateInvitation = z.output<typeof createInvitationSchema>;

/** `PENDING` y `EXPIRED` son "abiertas" (se pueden reenviar o revocar). */
export const INVITATION_STATUSES = ['PENDING', 'EXPIRED', 'ACCEPTED', 'REVOKED'] as const;
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: membershipRoleSchema,
  status: invitationStatusSchema,
  invitedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** Invitaciones abiertas (pendientes y vencidas), más nuevas primero. Sin paginar. */
export const invitationListSchema = z.object({ data: z.array(invitationSchema) });
export type InvitationList = z.infer<typeof invitationListSchema>;

/* --- Aceptar (sin sesión en el tenant; autoriza el token del email) ------------------------ */

/** El token llega en el fragmento del enlace: `/invitacion#token=…`. Mismo formato que el reset. */
export const invitationTokenSchema = passwordResetTokenSchema;

export const invitationPreviewRequestSchema = z.strictObject({ token: invitationTokenSchema });
export type InvitationPreviewRequest = z.infer<typeof invitationPreviewRequestSchema>;

export const invitationPreviewSchema = z.object({
  tenantName: z.string(),
  email: z.string(),
  role: membershipRoleSchema,
  /** Con cuenta: aceptar solo suma la empresa. Sin cuenta: hay que elegir nombre y contraseña. */
  accountExists: z.boolean(),
  expiresAt: z.iso.datetime(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationSchema = z.strictObject({
  token: invitationTokenSchema,
  /** Solo si no hay cuenta para el email. */
  name: z
    .string()
    .trim()
    .min(1, 'Ingresá tu nombre.')
    .max(120, 'Usá como mucho 120 caracteres.')
    .optional(),
  password: newPasswordSchema.optional(),
});
export type AcceptInvitation = z.infer<typeof acceptInvitationSchema>;

export const acceptInvitationResponseSchema = z.object({
  /** `true` si se creó la cuenta. En los dos casos, después hay que ingresar. */
  accountCreated: z.boolean(),
  email: z.string(),
});
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

/** Códigos de error (`code`) de usuarios e invitaciones. */
export const memberErrorCodeSchema = z.enum([
  /** El email ya es miembro de la empresa (activo o deshabilitado). */
  'ALREADY_MEMBER',
  /** Ya hay una invitación vigente para ese email: reenviarla. */
  'INVITATION_PENDING',
  /** Reenviar o revocar una invitación ya aceptada o revocada. */
  'INVITATION_CLOSED',
  /** La empresa se quedaría sin ningún propietario activo. */
  'LAST_OWNER',
  /** Nadie cambia su propio rol ni se deshabilita a sí mismo. */
  'SELF_MODIFICATION',
  'INVALID_STATUS_TRANSITION',
  /** No se pudo mandar el email: no se guardó nada. */
  'MAIL_DELIVERY_FAILED',
  /** Token inexistente, usado, revocado o vencido. */
  'INVITATION_INVALID',
  /** No hay cuenta para el email: faltan nombre y contraseña. */
  'ACCOUNT_DETAILS_REQUIRED',
]);
export type MemberErrorCode = z.infer<typeof memberErrorCodeSchema>;
