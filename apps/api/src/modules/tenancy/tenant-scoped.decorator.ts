import { SetMetadata, UseGuards, UseInterceptors, applyDecorators } from '@nestjs/common';
import { TENANT_EXEMPT, TENANT_SCOPED } from './tenant-metadata';
import { TenantGuard } from './tenant.guard';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';

/**
 * Marca un controller o handler como de tenant:
 *  1. `TenantGuard`: principal (401 si falta) → membresía activa (403 si no hay) → permiso
 *     de `@RequirePermission()` (403 `PERMISSION_DENIED`). Cada ruta declara su permiso.
 *  2. `TenantTransactionInterceptor`: corre el handler dentro de una transacción con
 *     `app.tenant_id`/`app.user_id` fijados; `TenantDb.tx` solo funciona ahí adentro.
 */
export function TenantScoped(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(TENANT_SCOPED, true),
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
