import { Injectable } from '@nestjs/common';
import { TenantDb } from '../tenancy';
import { type AuditEvent, assertSafeAuditEvent, safeCorrelationId } from './audit-event';

/**
 * Escribe eventos en `audit_logs` (append-only; la API solo tiene INSERT/SELECT).
 *
 * El tenant de la fila NO lo elige el llamador:
 *  - dentro de un contexto de tenant (`@TenantScoped()` o `TenantDb.run`) se usa ese tenant y
 *    la MISMA transacción del cambio (si el cambio hace ROLLBACK, el evento también);
 *  - fuera de un contexto (login, reset, …) la fila queda con `tenant_id` NULL, en su propia
 *    transacción sin tenant. RLS rechaza cualquier otra combinación.
 *
 * Punto de extensión para #17 (interceptor transversal, antes/después, vista de admin).
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: TenantDb) {}

  async record(event: AuditEvent): Promise<void> {
    assertSafeAuditEvent(event);
    const row = {
      actorType: event.actor.type,
      actorId: event.actor.type === 'USER' ? event.actor.id : null,
      action: event.action,
      entityType: event.entity?.type ?? null,
      entityId: event.entity?.id ?? null,
      metadata: { ...event.metadata },
      correlationId: safeCorrelationId(event.correlationId),
    };
    // createMany: INSERT sin RETURNING (la política de SELECT no deja leer filas sin tenant).
    if (this.db.active) {
      await this.db.tx.auditLog.createMany({
        data: [{ ...row, tenantId: this.db.context.tenantId }],
      });
      return;
    }
    await this.db.runUnscoped((tx) =>
      tx.auditLog.createMany({ data: [{ ...row, tenantId: null }] }),
    );
  }
}
