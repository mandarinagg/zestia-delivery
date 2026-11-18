import type { MembershipRole } from '../../generated/prisma/enums';

/**
 * Tenant activo de una request (o de un job). Lo construye SOLO el servidor a partir de la
 * membresía del usuario autenticado; nunca de cabeceras, query o body enviados por el cliente.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly role: MembershipRole;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Error de programación: se pidió el cliente de datos fuera de un contexto de tenant. */
export class TenantContextMissingError extends Error {
  constructor() {
    super(
      'Acceso a datos de tenant fuera de un contexto de tenant. ' +
        'Usá @TenantScoped() en el endpoint o TenantDb.run() en jobs.',
    );
    this.name = 'TenantContextMissingError';
  }
}
