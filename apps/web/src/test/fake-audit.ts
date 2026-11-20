import { type Role, can } from '@zestia/auth';
import { type AuditLogEntry, auditLogQuerySchema } from '@zestia/contracts';

/**
 * SOLO TESTS. `GET /api/v1/audit-logs` y `GET /audit-logs/:id` en memoria (#17), con el esquema
 * de `@zestia/contracts` y las mismas reglas que la API real: permiso `audit:read`, solo el
 * tenant activo, prefijo de acción por segmentos, `from` inclusive, `to` exclusive, más
 * recientes primero y cursor = id.
 */

type Reply = { status: number; body?: unknown };

let seq = 0;
/** UUID v7 válido y creciente: el orden por id es el orden de alta, como en la DB. */
const nextId = () => `0192f0c4-3000-7000-8000-${String(++seq).padStart(12, '0')}`;

const err = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code },
});

export type SeedAuditEntry = Partial<Omit<AuditLogEntry, 'id'>> & { action: string };

export class FakeAudit {
  private rows: { tenantId: string; entry: AuditLogEntry }[] = [];
  /** Cuántas de las próximas consultas responden 500 (para probar el estado de error). */
  failures = 0;

  reset(): void {
    this.rows = [];
    this.failures = 0;
  }

  /** Agrega un evento; cada uno es más nuevo que el anterior. */
  seed(tenantId: string, data: SeedAuditEntry): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: nextId(),
      occurredAt: data.occurredAt ?? '2026-11-18T15:00:00.000Z',
      action: data.action,
      actor: data.actor ?? { type: 'SYSTEM', id: null, name: null },
      entity: data.entity ?? null,
      changes: data.changes ?? null,
      metadata: data.metadata ?? {},
      correlationId: data.correlationId ?? null,
    };
    this.rows.push({ tenantId, entry });
    return entry;
  }

  handle(
    method: string,
    path: string,
    search: URLSearchParams,
    who: { tenantId: string; role: Role },
  ): Reply | null {
    const match = /^\/audit-logs(?:\/([^/]+))?$/.exec(path);
    if (!match || method !== 'GET') return null;
    if (!can(who.role, 'audit:read')) return err(403, 'PERMISSION_DENIED');
    if (this.failures > 0) {
      this.failures -= 1;
      return err(500, 'INTERNAL_ERROR');
    }
    const own = this.rows.filter((r) => r.tenantId === who.tenantId).map((r) => r.entry);

    const [, id] = match;
    if (id) {
      const entry = own.find((e) => e.id === id);
      return entry ? { status: 200, body: entry } : err(404, 'NOT_FOUND');
    }

    const parsed = auditLogQuerySchema.safeParse(Object.fromEntries(search));
    if (!parsed.success) return err(400, 'VALIDATION_FAILED');
    const q = parsed.data;
    const rows = own
      .filter((e) => !q.action || e.action === q.action || e.action.startsWith(`${q.action}.`))
      .filter((e) => !q.entityType || e.entity?.type === q.entityType)
      .filter((e) => !q.entityId || e.entity?.id === q.entityId)
      .filter((e) => !q.actorId || e.actor.id === q.actorId)
      .filter((e) => !q.from || Date.parse(e.occurredAt) >= Date.parse(q.from))
      .filter((e) => !q.to || Date.parse(e.occurredAt) < Date.parse(q.to))
      .filter((e) => !q.cursor || e.id < q.cursor)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    const page = rows.slice(0, q.limit);
    return {
      status: 200,
      body: { data: page, nextCursor: rows.length > q.limit ? page.at(-1)!.id : null },
    };
  }
}
