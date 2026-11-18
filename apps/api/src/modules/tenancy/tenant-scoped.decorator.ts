import { SetMetadata, UseGuards, UseInterceptors, applyDecorators } from '@nestjs/common';
import type { MembershipRole } from '../../generated/prisma/enums';
import { TENANT_EXEMPT, TENANT_ROLES, TENANT_SCOPED } from './tenant-metadata';
import { TenantGuard } from './tenant.guard';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';

export interface TenantScopedOptions {
  /**
   * Roles de membresía con acceso. Control mínimo hasta que llegue la matriz de permisos de
   * `packages/auth` (#14); omitirlo = cualquier miembro del tenant.
   */
  readonly roles?: readonly MembershipRole[];
}

/**
 * Marca un controller o handler como de tenant:
 *  1. `TenantGuard`: principal (401 si falta) → membresía activa (403 si no hay) → rol.
 *  2. `TenantTransactionInterceptor`: corre el handler dentro de una transacción con
 *     `app.tenant_id`/`app.user_id` fijados; `TenantDb.tx` solo funciona ahí adentro.
 */
export function TenantScoped(options: TenantScopedOptions = {}): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(TENANT_SCOPED, true),
    SetMetadata(TENANT_ROLES, options.roles ?? null),
    UseGuards(TenantGuard),
    UseInterceptors(TenantTransactionInterceptor),
  );
}

/**
 * Declara explícitamente que un controller NO es de tenant (healthchecks, login, webhooks
 * entrantes con su propia autenticación). Un test recorre todas las rutas y exige
 * `@TenantScoped()` o `@TenantExempt()` en cada una.
 */
export function TenantExempt(reason: string): MethodDecorator & ClassDecorator {
  return SetMetadata(TENANT_EXEMPT, reason);
}
