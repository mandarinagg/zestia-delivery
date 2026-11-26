/**
 * Roles fijos y matriz rol → permiso (SPEC §3, issue #16).
 *
 * Es la ÚNICA fuente de verdad de qué puede hacer cada rol: la API la usa en `TenantGuard`
 * (`@RequirePermission()`) y el frontend puede usarla para mostrar u ocultar acciones (eso es
 * solo comodidad: la autorización real siempre se decide en el servidor).
 *
 * Roles personalizados: R6. Finanzas (R5) y Soporte de plataforma no son roles de membresía
 * todavía.
 */

import { type AuthMembership, membershipRoleSchema } from '@zestia/contracts';

/**
 * Roles de membresía. Vienen del contrato (`membershipRoleSchema`), que tiene que coincidir con
 * el enum `membership_role` de la DB (test en `apps/api/src/modules/tenancy/roles.test.ts`).
 */
export const ROLES = membershipRoleSchema.options;
export type Role = AuthMembership['role'];

/**
 * Permisos, como `recurso:acción`. Solo los que usa el release actual (R1); cada módulo nuevo
 * agrega los suyos acá, con su fila en la matriz y en el test.
 */
export const PERMISSIONS = [
  /** Ver comercios y sucursales. */
  'merchants:read',
  /** Crear, editar y dar de baja comercios y sucursales. */
  'merchants:manage',
  /** Ver usuarios del tenant y sus roles. */
  'users:read',
  /** Invitar usuarios, cambiar roles (salvo Propietario) y deshabilitar membresías. */
  'users:manage',
  /** Dar o quitar el rol Propietario. */
  'users:manage-owners',
  /** Consultar la auditoría del tenant. */
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR: readonly Permission[] = ['merchants:read'];

const ADMIN: readonly Permission[] = [
  'merchants:read',
  'merchants:manage',
  'users:read',
  'users:manage',
  'audit:read',
];

/**
 * Matriz. Criterios (SPEC §3):
 * - Propietario: control total de su empresa, incluido quién más es Propietario.
 * - Administrador: gestión operativa y de usuarios, sin tocar Propietarios.
 * - Operador: recepción, asignación y seguimiento (en R1 solo consulta comercios).
 * - Supervisor: lo mismo que Operador; resolver incidencias llega en R2.
 * - Repartidor y Comercio: sus permisos llegan con sus módulos (R2) y con el alcance por
 *   `courierId` / `merchantId` de la membresía.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: [...PERMISSIONS],
  ADMIN,
  OPERATOR,
  SUPERVISOR: [...OPERATOR],
  COURIER: [],
  MERCHANT: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/** ¿El rol tiene el permiso? Un rol desconocido no tiene ninguno. */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** ¿El rol tiene TODOS los permisos? Con lista vacía: `false` (falla cerrado). */
export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.length > 0 && permissions.every((p) => can(role, p));
}

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
