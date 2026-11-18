import { Module } from '@nestjs/common';
import { TenantDb } from './tenant-db';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';
import { TenantGuard } from './tenant.guard';
import { TenantResolver } from './tenant.resolver';

/**
 * Multi-tenancy (issue #15). Los módulos de negocio lo importan para usar `@TenantScoped()` y
 * `TenantDb`.
 *
 * `TenantGuard` necesita el provider `PRINCIPAL_RESOLVER`, que este módulo NO define: lo
 * registra (global) el módulo de autenticación (`AuthModule`, issue #14). Sin él la app no
 * arranca (fail-closed). Los tests lo reemplazan con `overrideProvider(PRINCIPAL_RESOLVER)`.
 */
@Module({
  providers: [TenantDb, TenantResolver, TenantGuard, TenantTransactionInterceptor],
  exports: [TenantDb, TenantResolver, TenantGuard, TenantTransactionInterceptor],
})
export class TenancyModule {}
