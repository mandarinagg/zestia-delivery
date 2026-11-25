import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * Exige una sesión válida (endpoints de la propia sesión: me, switch-tenant, change-password,
 * que son `@TenantExempt`). Los endpoints de negocio NO usan este guard: usan
 * `@TenantScoped()`, que obtiene el principal por `PRINCIPAL_RESOLVER`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const session = await this.sessions.current(
      http.getRequest<IncomingMessage>(),
      http.getResponse<ServerResponse>(),
    );
    if (!session) throw new UnauthorizedException({ statusCode: 401, code: 'UNAUTHENTICATED' });
    return true;
  }
}
