import type { TenantContext } from './tenant-context';

const TENANT_CONTEXT = Symbol('zestia.tenantContext');

type RequestWithTenant = { [TENANT_CONTEXT]?: TenantContext };

/** Guarda el contexto resuelto por el guard en la request (clave privada: un Symbol). */
export function setRequestTenantContext(request: object, context: TenantContext): void {
  (request as RequestWithTenant)[TENANT_CONTEXT] = context;
}

export function getRequestTenantContext(request: object): TenantContext | undefined {
  return (request as RequestWithTenant)[TENANT_CONTEXT];
}
