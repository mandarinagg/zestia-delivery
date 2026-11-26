import { Injectable } from '@nestjs/common';
import type { AuditLogEntry, AuditLogPage, AuditLogQuery } from '@zestia/contracts';
import type { AuditLog, Prisma } from '../../generated/prisma/client';
import { TenantDb } from '../tenancy';

/**
 * Lectura de la auditoría del tenant activo (vista de Propietario/Admin, #17). Además de RLS
 * (`audit_logs_tenant_read`), filtra por el tenant del contexto. Las filas sin tenant (login,
 * reset) no se ven nunca.
 */
@Injectable()
export class AuditLogsRepository {
  constructor(private readonly db: TenantDb) {}

  /** Más recientes primero; cursor = id (UUID v7, ordenable por tiempo). */
  async list(query: AuditLogQuery): Promise<AuditLogPage> {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: this.db.context.tenantId,
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      id: query.cursor ? { lt: query.cursor } : undefined,
      occurredAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lt: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
      // Prefijo por segmentos: `merchants` incluye `merchants.updated` pero no `merchantsx.y`.
      OR: query.action
        ? [{ action: query.action }, { action: { startsWith: `${query.action}.` } }]
        : undefined,
    };
    const rows = await this.db.tx.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return {
      data: await this.toEntries(page),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async findById(id: string): Promise<AuditLogEntry | null> {
    const row = await this.db.tx.auditLog.findFirst({
      where: { id, tenantId: this.db.context.tenantId },
    });
    if (!row) return null;
    const [entry] = await this.toEntries([row]);
    return entry ?? null;
  }

  private async toEntries(rows: readonly AuditLog[]): Promise<AuditLogEntry[]> {
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id) => id !== null))];
    // RLS de `users`: solo se ven usuarios con membresía en el tenant activo.
    const users =
      actorIds.length > 0
        ? await this.db.tx.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true },
          })
        : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      actor: {
        type: row.actorType,
        id: row.actorId,
        name: row.actorId ? (names.get(row.actorId) ?? null) : null,
      },
      entity: row.entityType && row.entityId ? { type: row.entityType, id: row.entityId } : null,
      changes: (row.changes as AuditLogEntry['changes']) ?? null,
      metadata: (row.metadata ?? {}) as AuditLogEntry['metadata'],
      correlationId: row.correlationId,
    }));
  }
}
