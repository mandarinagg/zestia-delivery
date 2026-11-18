import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ENV, type Env } from '../../config/env';
import { AuditModule } from '../audit';
import { MailModule } from '../mail';
import { PRINCIPAL_RESOLVER, TenancyModule } from '../tenancy';
import { AUTH_SETTINGS, authSettingsFromEnv } from './auth-settings';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';
import { PasswordHasher } from './password-hasher';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionPrincipalResolver } from './session-principal.resolver';
import { SessionService } from './session.service';

/**
 * Autenticación y sesiones (issue #14).
 *
 * Global porque registra `PRINCIPAL_RESOLVER`, que necesita el `TenantGuard` de cualquier
 * módulo de negocio (la dependencia va auth → tenancy; tenancy solo conoce el contrato).
 * También registra `CsrfGuard` como guard global (toda request que cambia estado).
 */
@Global()
@Module({
  imports: [TenancyModule, AuditModule, MailModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_SETTINGS, inject: [ENV], useFactory: (env: Env) => authSettingsFromEnv(env) },
    AuthRepository,
    AuthService,
    PasswordHasher,
    SessionService,
    SessionAuthGuard,
    SessionPrincipalResolver,
    { provide: PRINCIPAL_RESOLVER, useExisting: SessionPrincipalResolver },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [PRINCIPAL_RESOLVER, PasswordHasher],
})
export class AuthModule {}
