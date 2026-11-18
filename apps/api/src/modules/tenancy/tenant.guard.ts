import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '../../generated/prisma/enums';
import { PRINCIPAL_RESOLVER, type PrincipalResolver } from './principal';
import { setRequestTenantContext } from './tenant-request';
import { TENANT_ROLES } from './tenant-metadata';
import { TenantResolver } from './tenant.resolver';

/**
 * Resuelve el tenant en el servidor: principal autenticado → membresía activa → rol.
 * Ignora a propósito cualquier `tenantId` que venga en headers, query o body.
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

    const roles = this.reflector.getAllAndOverride<readonly MembershipRole[] | null>(TENANT_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(resolution.context.role)) {
      throw new ForbiddenException({ statusCode: 403, code: 'ROLE_NOT_ALLOWED' });
    }

    setRequestTenantContext(context.switchToHttp().getRequest<object>(), resolution.context);
    return true;
  }
}
