import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextMissingError, type TenantContext } from './tenant-context';
import { runInDbScope, type TenantTx } from './tenant-transaction';

interface TenantScope {
  readonly context: TenantContext;
  readonly tx: TenantTx;
}

const scopeStorage = new AsyncLocalStorage<TenantScope>();

/**
 * ÚNICA puerta de acceso a datos de negocio.
 *
 * Los repositorios inyectan `TenantDb` y usan `db.tx` (cliente de la transacción del tenant
 * actual) y `db.context.tenantId` (para filtrar también en la aplicación, además de RLS).
 * Fuera de un contexto de tenant, `db.tx` lanza `TenantContextMissingError`: no existe forma de
 * obtener un cliente sin `app.tenant_id` fijado.
 *
 * - En HTTP, el contexto lo abre `@TenantScoped()` (guard + interceptor).
 * - En jobs/workers, `run(context, fn)` con un contexto construido por el servidor
 *   (p. ej. el tenant_id de la fila del outbox), nunca con datos del cliente.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  get tx(): TenantTx {
    return this.current().tx;
  }

  get context(): TenantContext {
    return this.current().context;
  }

  /** `true` si hay una transacción de tenant activa en el flujo asíncrono actual. */
  get active(): boolean {
    return scopeStorage.getStore() !== undefined;
  }

  run<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
    if (this.active) {
      // Anidar abriría otra conexión con otro tenant dentro del mismo flujo: se prohíbe.
      throw new Error(
        'Ya hay un contexto de tenant activo; no se permiten transacciones anidadas.',
      );
    }
    return runInDbScope(this.prisma, { tenantId: context.tenantId, userId: context.userId }, (tx) =>
      scopeStorage.run({ context, tx }, fn),
    );
  }

  /**
   * Transacción SIN tenant ni usuario (`app.tenant_id` y `app.user_id` vacíos): RLS deja ver
   * cero filas de toda tabla de tenant y solo permite insertar filas sin tenant (p. ej. la
   * auditoría de login). Para lo previo a elegir tenant: las funciones `SECURITY DEFINER` de
   * autenticación y la auditoría pre-tenant. No da acceso a ningún dato de negocio.
   *
   * El cliente se pasa a `fn` (no queda en `db.tx`). No se puede anidar en un contexto de
   * tenant: ahí se usa `db.tx` directamente.
   */
  runUnscoped<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    if (this.active) {
      throw new Error('Hay un contexto de tenant activo; usá db.tx en lugar de runUnscoped().');
    }
    return runInDbScope(this.prisma, { tenantId: null, userId: null }, fn);
  }

  private current(): TenantScope {
    const scope = scopeStorage.getStore();
    if (!scope) throw new TenantContextMissingError();
    return scope;
  }
}
