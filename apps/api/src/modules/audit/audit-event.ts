/**
 * Evento de auditoría (tabla append-only `audit_logs`). #14: eventos de autenticación; #17:
 * cambios antes/después (`changes`, armados con `auditDiff()`) y consulta para Propietario/Admin.
 */

/** `USER`: usuario autenticado. `ANONYMOUS`: sin sesión (p. ej. login fallido). */
export type AuditActor =
  | { readonly type: 'USER'; readonly id: string }
  | { readonly type: 'ANONYMOUS' }
  | { readonly type: 'SYSTEM' };

export type AuditMetadataValue = string | number | boolean | null;

/** Metadata plana, sin PII ni secretos (se valida en `assertSafeAuditEvent`). */
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

/** Cambio de un campo: valores antes y después, o solo la marca si es un dato personal. */
export type AuditFieldChange =
  | { readonly from: AuditMetadataValue; readonly to: AuditMetadataValue }
  | { readonly redacted: true };

/** Solo los campos que cambiaron. Se arma con `auditDiff()`. */
export type AuditChanges = Readonly<Record<string, AuditFieldChange>>;

export interface AuditEvent {
  /** `<dominio>.<acción>[.<detalle>]` en minúsculas, p. ej. `auth.login.failed`. */
  readonly action: string;
  readonly actor: AuditActor;
  /** Entidad afectada (tipo + id interno). Nunca un email u otro dato personal como id. */
  readonly entity?: { readonly type: string; readonly id: string } | null;
  readonly metadata?: AuditMetadata;
  /** Antes/después por campo (`auditDiff()`). */
  readonly changes?: AuditChanges | null;
  /** `correlationId` de la request (pino-http). */
  readonly correlationId?: string | null;
}

const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const ENTITY_TYPE_RE = /^[a-z][a-z0-9_]*$/;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const METADATA_KEY_RE = /^[a-z][A-Za-z0-9_]{0,63}$/;
/** Claves que delatan secretos o PII: no se aceptan en metadata (ni como parte del nombre). */
const FORBIDDEN_KEY_RE =
  /pass|pwd|token|secret|cookie|csrf|hash|mail|phone|address|authorization|apikey|api_key/i;
const MAX_METADATA_KEYS = 20;
const MAX_STRING = 200;
const MAX_CHANGED_FIELDS = 50;
const MAX_CHANGE_STRING = 500;

const CORRELATION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * El correlationId puede venir del cliente (`x-request-id`): si no tiene un formato seguro se
 * descarta (NULL) en lugar de fallar la operación auditada.
 */
export function safeCorrelationId(value: string | null | undefined): string | null {
  return typeof value === 'string' && CORRELATION_ID_RE.test(value) ? value : null;
}

export class UnsafeAuditEventError extends Error {
  constructor(reason: string) {
    super(`Evento de auditoría rechazado: ${reason}`);
    this.name = 'UnsafeAuditEventError';
  }
}

/**
 * Defensa en profundidad contra PII/secretos en la auditoría: formato de acción y entidad,
 * metadata plana con claves permitidas y valores cortos, sin nada que parezca un email.
 * Es un error de programación (se lanza, no se ignora).
 */
export function assertSafeAuditEvent(event: AuditEvent): void {
  if (!ACTION_RE.test(event.action) || event.action.length > 100) {
    throw new UnsafeAuditEventError('acción con formato inválido');
  }
  if (event.actor.type === 'USER' && !SAFE_ID_RE.test(event.actor.id)) {
    throw new UnsafeAuditEventError('id de actor inválido');
  }
  if (event.entity) {
    if (!ENTITY_TYPE_RE.test(event.entity.type) || !SAFE_ID_RE.test(event.entity.id)) {
      throw new UnsafeAuditEventError('entidad inválida');
    }
  }
  const entries = Object.entries(event.metadata ?? {});
  if (entries.length > MAX_METADATA_KEYS) {
    throw new UnsafeAuditEventError('demasiadas claves en metadata');
  }
  for (const [key, value] of entries) {
    if (!METADATA_KEY_RE.test(key) || FORBIDDEN_KEY_RE.test(key)) {
      throw new UnsafeAuditEventError(`clave de metadata no permitida: ${key}`);
    }
    assertSafeValue(value, MAX_STRING, `metadata.${key}`);
  }
  assertSafeChanges(event.changes);
}

function assertSafeValue(value: unknown, maxString: number, where: string): void {
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new UnsafeAuditEventError(`el valor debe ser plano (${where})`);
  }
  if (typeof value === 'string' && (value.length > maxString || value.includes('@'))) {
    throw new UnsafeAuditEventError(`valor no permitido en ${where}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new UnsafeAuditEventError(`número inválido en ${where}`);
  }
}

/**
 * `changes`: campos con nombre válido; los que delatan datos personales o secretos (`phone`,
 * `email`, `address`, `password`, …) SOLO pueden ir como `{ redacted: true }`.
 */
function assertSafeChanges(changes: AuditChanges | null | undefined): void {
  if (changes == null) return;
  if (typeof changes !== 'object' || Array.isArray(changes)) {
    throw new UnsafeAuditEventError('changes debe ser un objeto');
  }
  const entries = Object.entries(changes);
  if (entries.length > MAX_CHANGED_FIELDS) {
    throw new UnsafeAuditEventError('demasiados campos en changes');
  }
  for (const [field, change] of entries) {
    if (!METADATA_KEY_RE.test(field)) {
      throw new UnsafeAuditEventError(`campo no permitido en changes: ${field}`);
    }
    const keys = change && typeof change === 'object' ? Object.keys(change).sort().join(',') : '';
    if (keys === 'redacted' && (change as { redacted: unknown }).redacted === true) continue;
    if (keys !== 'from,to') {
      throw new UnsafeAuditEventError(`cambio con formato inválido en ${field}`);
    }
    if (FORBIDDEN_KEY_RE.test(field)) {
      throw new UnsafeAuditEventError(`${field} es un dato sensible: debe ir como redacted`);
    }
    const { from, to } = change as { from: unknown; to: unknown };
    assertSafeValue(from, MAX_CHANGE_STRING, `changes.${field}.from`);
    assertSafeValue(to, MAX_CHANGE_STRING, `changes.${field}.to`);
  }
}
