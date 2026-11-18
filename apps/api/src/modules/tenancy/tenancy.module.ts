import { Module } from '@nestjs/common';
import { PRINCIPAL_RESOLVER, UnauthenticatedPrincipalResolver } from './principal';
import { TenantDb } from './tenant-db';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';
import { TenantGuard } from './tenant.guard';
import { TenantResolver } from './tenant.resolver';

/**
 * Multi-tenancy (issue #15). Los módulos de negocio lo importan para usar `@TenantScoped()` y
 * `TenantDb`. La autenticación (#14) reemplaza el provider `PRINCIPAL_RESOLVER`.
 */
@Module({
  providers: [
    TenantDb,
    TenantResolver,
    TenantGuard,
    TenantTransactionInterceptor,
    { provide: PRINCIPAL_RESOLVER, useClass: UnauthenticatedPrincipalResolver },
  ],
  exports: [
    TenantDb,
    TenantResolver,
    TenantGuard,
    TenantTransactionInterceptor,
    PRINCIPAL_RESOLVER,
  ],
})
export class TenancyModule {}
