import { Injectable } from '@nestjs/common';
import { TenantDb } from '../tenancy';
import {
  type AuditChanges,
  type AuditEvent,
  type AuditMetadata,
  assertSafeAuditEvent,
  safeCorrelationId,
} from './audit-event';

/** Cambio de datos hecho por el usuario de la request (ver `AuditService.recordChange`). */
export interface AuditChangeEvent {
  /** `<dominio>.<acción>`, p. ej. `merchants.updated`. */
  readonly action: string;
  readonly entity: { readonly type: string; readonly id: string };
  /** De `auditDiff()`. `null` = nada auditado cambió (igual se registra la acción). */
  readonly changes: AuditChanges | null;
  readonly metadata?: AuditMetadata;
}

/**
 * Escribe eventos en `audit_logs` (append-only; la API solo tiene INSERT/SELECT).
 *
 * El tenant de la fila NO lo elige el llamador:
 *  - dentro de un contexto de tenant (`@TenantScoped()` o `TenantDb.run`) se usa ese tenant y
 *    la MISMA transacción del cambio (si el cambio hace ROLLBACK, el evento también);
 *  - fuera de un contexto (login, reset, …) la fila queda con `tenant_id` NULL, en su propia
 *    transacción sin tenant. RLS rechaza cualquier otra combinación.
 *
 * Para cambios de datos de negocio usar `recordChange()` (#17).
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
      changes: event.changes ?? undefined,
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

  /**
   * Registra un cambio de datos de negocio en la MISMA transacción del tenant: si el cambio
   * hace ROLLBACK, el evento también, y no hay cambio sin su evento. El actor (usuario de la
   * sesión) y el correlationId salen del contexto de tenant, no del llamador.
   *
   * Solo dentro de `@TenantScoped()` / `TenantDb.run` (si no, `TenantContextMissingError`).
   */
  async recordChange(event: AuditChangeEvent): Promise<void> {
    const context = this.db.context;
    return this.record({
      action: event.action,
      actor: { type: 'USER', id: context.userId },
      entity: event.entity,
      changes: event.changes,
      metadata: event.metadata,
      correlationId: context.correlationId ?? null,
    });
  }
}
