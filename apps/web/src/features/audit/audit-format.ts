import { type Role, ROLES } from '@zestia/auth';
import {
  type AuditLogEntry,
  type MerchantStatus,
  MERCHANT_STATUSES,
  openingHoursSchema,
} from '@zestia/contracts';
import { MERCHANT_STATUS_LABEL, WEEKDAY_LABEL } from '@/features/merchants/merchant-format';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/session';

/**
 * Textos de la vista de auditoría (#17): qué pasó, quién lo hizo y qué cambió, en español.
 * Todo tiene salida por defecto: una acción, un campo o un valor que la API agregue después se
 * muestra tal cual, nunca rompe la pantalla.
 */

export type AuditArea = 'merchants' | 'users' | 'auth';

export const AUDIT_AREA_LABEL: Record<AuditArea, string> = {
  merchants: 'Comercios',
  users: 'Usuarios',
  auth: 'Accesos',
};

/** Acción → lo que hizo el actor (la frase se arma como "Ana suspendió un comercio"). */
const ACTION_PHRASE: Record<string, string> = {
  'merchants.created': 'creó un comercio',
  'merchants.updated': 'editó un comercio',
  'merchants.suspended': 'suspendió un comercio',
  'merchants.reactivated': 'reactivó un comercio',
  'merchants.archived': 'archivó un comercio',
  'merchants.branch_created': 'agregó una sucursal',
  'merchants.branch_updated': 'editó una sucursal',
  'merchants.branch_archived': 'archivó una sucursal',
  'users.invited': 'invitó a una persona',
  'users.invitation_resent': 'reenvió una invitación',
  'users.invitation_revoked': 'revocó una invitación',
  'users.invitation_accepted': 'aceptó una invitación',
  'users.role_changed': 'cambió el rol de un usuario',
  'users.disabled': 'deshabilitó a un usuario',
  'users.enabled': 'habilitó a un usuario',
  'auth.login.succeeded': 'inició sesión',
  'auth.login.failed': 'intentó iniciar sesión sin éxito',
  'auth.logout': 'cerró sesión',
  'auth.tenant.switched': 'entró a la empresa',
  'auth.tenant.switch_denied': 'intentó entrar a la empresa sin acceso',
  'auth.password.changed': 'cambió su contraseña',
  'auth.password.change_failed': 'intentó cambiar su contraseña sin éxito',
  'auth.password_reset.requested': 'pidió restablecer una contraseña',
  'auth.password_reset.completed': 'restableció su contraseña',
  'auth.password_reset.failed': 'intentó restablecer una contraseña sin éxito',
};

export function describeAction(action: string): string {
  return ACTION_PHRASE[action] ?? `registró «${action}»`;
}

/** Quién lo hizo. `known` = es una persona de la empresa (se puede filtrar por ella). */
export function describeActor(actor: AuditLogEntry['actor']): { label: string; known: boolean } {
  if (actor.type === 'SYSTEM') return { label: 'El sistema', known: false };
  if (actor.type === 'ANONYMOUS') return { label: 'Alguien sin sesión', known: false };
  if (actor.name) return { label: actor.name, known: actor.id !== null };
  return { label: 'Una persona sin acceso a la empresa', known: false };
}

const ENTITY_LABEL: Record<string, string> = {
  merchant: 'Comercio',
  merchant_branch: 'Sucursal',
  membership: 'Usuario de la empresa',
  invitation: 'Invitación',
  user: 'Cuenta',
  session: 'Sesión',
  tenant: 'Empresa',
};

export function describeEntity(type: string): string {
  return ENTITY_LABEL[type] ?? type;
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Nombre',
  status: 'Estado',
  role: 'Rol',
  email: 'Correo',
  phone: 'Teléfono',
  ruc: 'RUC',
  address: 'Dirección',
  references: 'Referencias',
  neighborhood: 'Barrio',
  city: 'Ciudad',
  openingHours: 'Horario',
  deletedAt: 'Archivado el',
  expiresAt: 'Vence',
};

export function describeField(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  DISABLED: 'Deshabilitado',
};

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);
const isMerchantStatus = (v: string): v is MerchantStatus =>
  (MERCHANT_STATUSES as readonly string[]).includes(v);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Horario guardado como JSON (`openingHours`): solo los días abiertos, o "Cerrado todos los días". */
function describeOpeningHours(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  const hours = openingHoursSchema.safeParse(parsed);
  if (!hours.success) return json;
  const days = Object.entries(hours.data)
    .filter(([, ranges]) => ranges && ranges.length > 0)
    .map(
      ([day, ranges]) =>
        `${WEEKDAY_LABEL[day as keyof typeof WEEKDAY_LABEL]} ${ranges!.map((r) => `${r.from}–${r.to}`).join(', ')}`,
    );
  return days.length > 0 ? days.join(' · ') : 'Cerrado todos los días';
}

/** Un valor de `changes` para leer: roles y estados traducidos, fechas en la zona del tenant. */
export function formatAuditValue(
  field: string,
  value: string | number | boolean | null,
  entityType: string | null,
): string {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return String(value);
  if (field === 'role' && isRole(value)) return ROLE_LABEL[value];
  if (field === 'status') {
    if (entityType === 'merchant' && isMerchantStatus(value)) return MERCHANT_STATUS_LABEL[value];
    if (entityType === 'membership') return MEMBERSHIP_STATUS_LABEL[value] ?? value;
  }
  if (field === 'openingHours') return describeOpeningHours(value);
  if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
  return value;
}

const REASON_LABEL: Record<string, string> = {
  REVOKED: 'La revocó una persona de la empresa',
  SUPERSEDED: 'La reemplazó una invitación nueva al mismo correo',
  BAD_PASSWORD: 'Contraseña actual incorrecta',
  INVALID_OR_EXPIRED_TOKEN: 'Enlace inválido o vencido',
};

/**
 * Datos extra que le sirven a quien lee. Los identificadores internos (`userId`,
 * `merchantId`, …) no se muestran: no le dicen nada a una persona.
 */
export function describeMetadata(
  metadata: AuditLogEntry['metadata'],
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const { reason, accountCreated, role } = metadata;
  if (typeof reason === 'string')
    out.push({ label: 'Motivo', value: REASON_LABEL[reason] ?? reason });
  if (typeof accountCreated === 'boolean') {
    out.push({
      label: 'Cuenta',
      value: accountCreated ? 'Se creó una cuenta nueva' : 'Ya tenía cuenta',
    });
  }
  if (typeof role === 'string') {
    out.push({ label: 'Rol', value: isRole(role) ? ROLE_LABEL[role] : role });
  }
  return out;
}

/** Pantalla del objeto afectado, si existe: el comercio (también para sus sucursales). */
export function entityLink(entry: AuditLogEntry): { merchantId: string; label: string } | null {
  if (entry.entity?.type === 'merchant') {
    return { merchantId: entry.entity.id, label: 'Ver comercio' };
  }
  const merchantId = entry.metadata.merchantId;
  if (entry.entity?.type === 'merchant_branch' && typeof merchantId === 'string') {
    return { merchantId, label: 'Ver comercio' };
  }
  return null;
}
