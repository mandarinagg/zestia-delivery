import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionService } from './session.service';

export const NO_SESSION_RENEWAL = 'zestia:no-session-renewal';

/**
 * El endpoint consulta la sesión SIN renovarla (`GET /auth/session-status`): el guard valida y
 * devuelve los restantes pero no alarga `idle_expires_at`.
 */
export const NoSessionRenewal = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_SESSION_RENEWAL, reason);

/**
 * Exige una sesión válida (endpoints de la propia sesión: me, switch-tenant, change-password,
 * que son `@TenantExempt`). Los endpoints de negocio NO usan este guard: usan
 * `@TenantScoped()`, que obtiene el principal por `PRINCIPAL_RESOLVER`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const session = await this.sessions.current(
      http.getRequest<IncomingMessage>(),
      http.getResponse<ServerResponse>(),
      {
        renew: !this.reflector.getAllAndOverride<string | undefined>(NO_SESSION_RENEWAL, [
          context.getHandler(),
          context.getClass(),
        ]),
      },
    );
    if (!session) throw new UnauthorizedException({ statusCode: 401, code: 'UNAUTHENTICATED' });
    return true;
  }
}
