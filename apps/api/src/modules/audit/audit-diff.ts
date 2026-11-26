import type { AuditChanges, AuditFieldChange, AuditMetadataValue } from './audit-event';

/**
 * Qué campos de una entidad se auditan. Lista explícita (allowlist): un campo nuevo de la
 * entidad NO entra en la auditoría hasta que alguien lo agrega acá a conciencia.
 */
export interface AuditFieldSpec<T> {
  /** Campos cuyo valor antes/después se guarda. */
  readonly fields: readonly (keyof T & string)[];
  /**
   * Campos con datos personales (teléfono, dirección, RUC de persona, …): se registra que
   * cambiaron, nunca el valor.
   */
  readonly redacted?: readonly (keyof T & string)[];
}

type Snapshot<T> = Partial<Record<keyof T & string, unknown>>;

/**
 * Cambios entre dos versiones de una entidad, solo de los campos que cambiaron.
 * - Alta: `before = null` (todos los campos con valor salen con `from: null`).
 * - Baja física: `after = null`. (Las bajas lógicas son un cambio de `deletedAt`/`status`.)
 * Devuelve `null` si no cambió nada auditado.
 *
 * Fechas → ISO 8601 UTC; `undefined` → `null`. Otros tipos (objetos, arrays) no se aceptan: el
 * valor de un campo auditado tiene que ser plano.
 */
export function auditDiff<T>(
  before: Snapshot<T> | null,
  after: Snapshot<T> | null,
  spec: AuditFieldSpec<T>,
): AuditChanges | null {
  const redacted = new Set<string>(spec.redacted ?? []);
  const fields = [...new Set<string>([...spec.fields, ...redacted])];
  const changes: Record<string, AuditFieldChange> = {};
  for (const field of fields) {
    const from = toAuditValue(before?.[field as keyof T & string], field);
    const to = toAuditValue(after?.[field as keyof T & string], field);
    if (from === to) continue;
    changes[field] = redacted.has(field) ? { redacted: true } : { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function toAuditValue(value: unknown, field: string): AuditMetadataValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new TypeError(`auditDiff: el campo ${field} no tiene un valor plano`);
}
