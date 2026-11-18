import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, canAll } from '@zestia/auth';
import { PRINCIPAL_RESOLVER, type PrincipalResolver } from './principal';
import { setRequestTenantContext } from './tenant-request';
import { TENANT_PERMISSIONS } from './tenant-metadata';
import { TenantResolver } from './tenant.resolver';

/**
 * Resuelve el tenant en el servidor: principal autenticado → membresía activa → rol → permiso
 * (`@RequirePermission()`, matriz de `@zestia/auth`). Ignora a propósito cualquier `tenantId`
 * o rol que venga en headers, query o body.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
    private readonly tenants: TenantResolver,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const principal = await this.principals.resolve(context);
    if (!principal) throw new UnauthorizedException();

    const resolution = await this.tenants.resolve(principal);
    if (!resolution.ok) {
      if (resolution.reason === 'INVALID_PRINCIPAL') throw new UnauthorizedException();
      throw new ForbiddenException({ statusCode: 403, code: resolution.reason });
    }

    const required = this.reflector.getAllAndOverride<readonly Permission[] | undefined>(
      TENANT_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    // Falla cerrado: una ruta de tenant sin permiso declarado es un error de programación
    // (app-routes.test.ts lo atrapa antes de llegar acá).
    if (!required || required.length === 0) {
      throw new InternalServerErrorException();
    }
    if (!canAll(resolution.context.role, required)) {
      throw new ForbiddenException({ statusCode: 403, code: 'PERMISSION_DENIED' });
    }

    const request = context.switchToHttp().getRequest<{ id?: unknown }>();
    setRequestTenantContext(request, {
      ...resolution.context,
      correlationId: typeof request.id === 'string' ? request.id : null,
    });
    return true;
  }
}
