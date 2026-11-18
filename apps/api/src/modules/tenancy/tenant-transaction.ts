import type { PrismaClient } from '../../generated/prisma/client';
import type { Prisma } from '../../generated/prisma/client';
import { isUuid } from './tenant-context';

/**
 * Cliente Prisma de una transacción de tenant. Sin `$queryRawUnsafe`/`$executeRawUnsafe`:
 * SQL crudo solo con tagged templates (parametrizado).
 */
export type TenantTx = Omit<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;

/** Valores que se fijan en la transacción. `null` = sin valor (RLS devuelve cero filas). */
export interface DbSessionScope {
  readonly tenantId: string | null;
  readonly userId: string | null;
}

/** Límites de la transacción interactiva (ms). */
export const TENANT_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Corre `fn` dentro de una transacción interactiva de Prisma con `app.tenant_id` y
 * `app.user_id` fijados con `set_config(..., is_local => true)` — el equivalente parametrizado
 * de `SET LOCAL`: vale solo hasta el COMMIT/ROLLBACK, así que no se filtra a la siguiente
 * request que reutilice la conexión del pool.
 *
 * Siempre fija AMBOS valores (vacío si no aplica) para pisar cualquier valor de sesión que
 * hubiera quedado en la conexión.
 *
 * Bajo nivel: el código de negocio usa `TenantDb`, no esta función.
 */
export async function runInDbScope<T>(
  prisma: PrismaClient,
  scope: DbSessionScope,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (scope.tenantId !== null && !isUuid(scope.tenantId)) {
    throw new Error('tenantId inválido: debe ser un UUID');
  }
  if (scope.userId !== null && !isUuid(scope.userId)) {
    throw new Error('userId inválido: debe ser un UUID');
  }
  const tenantId = scope.tenantId ?? '';
  const userId = scope.userId ?? '';
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }, TENANT_TX_OPTIONS);
}
