import { z } from 'zod';

/**
 * Contratos de auditoría (`/api/v1/audit-logs`, issue #17). Ver docs/API_CONTRACTS.md.
 * Solo lectura: la auditoría la escribe el servidor.
 */

export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 100;

const auditValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const auditFieldChangeSchema = z.union([
  z.object({ from: auditValueSchema, to: auditValueSchema }),
  z.object({ redacted: z.literal(true) }),
]);

/**
 * Filtros de `GET /audit-logs`. Los parámetros desconocidos se ignoran (también un `tenantId`:
 * el tenant sale de la sesión).
 */
export const auditLogQuerySchema = z.object({
  /** Prefijo de acción: `merchants` o `merchants.updated`. */
  action: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/)
    .max(100)
    .optional(),
  entityType: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(64)
    .optional(),
  entityId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  actorId: z.uuid().optional(),
  /** Desde (inclusive), ISO 8601 con zona. */
  from: z.iso.datetime({ offset: true }).optional(),
  /** Hasta (exclusive), ISO 8601 con zona. */
  to: z.iso.datetime({ offset: true }).optional(),
  /** `nextCursor` de la página anterior. */
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_MAX).default(AUDIT_PAGE_DEFAULT),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  action: z.string(),
  actor: z.object({
    type: z.enum(['USER', 'ANONYMOUS', 'SYSTEM']),
    id: z.uuid().nullable(),
    /** Nombre si el usuario sigue siendo miembro del tenant; si no, `null`. */
    name: z.string().nullable(),
  }),
  entity: z.object({ type: z.string(), id: z.string() }).nullable(),
  /** Solo los campos que cambiaron; los datos personales van como `{ redacted: true }`. */
  changes: z.record(z.string(), auditFieldChangeSchema).nullable(),
  metadata: z.record(z.string(), auditValueSchema),
  correlationId: z.string().nullable(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogPageSchema = z.object({
  data: z.array(auditLogEntrySchema),
  nextCursor: z.uuid().nullable(),
});
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
