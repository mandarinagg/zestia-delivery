import type { IncomingMessage } from 'node:http';
import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { Principal, PrincipalResolver } from '../tenancy';
import { SessionService } from './session.service';

/**
 * Implementación real de `PRINCIPAL_RESOLVER` (contrato de #15): el principal sale de la sesión
 * de servidor de la cookie. `activeTenantId` es la preferencia guardada en la sesión; el
 * `TenantGuard` la revalida contra una membresía real en un tenant ACTIVE en cada request.
 */
@Injectable()
export class SessionPrincipalResolver implements PrincipalResolver {
  constructor(private readonly sessions: SessionService) {}

  async resolve(context: ExecutionContext): Promise<Principal | null> {
    const session = await this.sessions.current(
      context.switchToHttp().getRequest<IncomingMessage>(),
    );
    return session ? { userId: session.userId, activeTenantId: session.activeTenantId } : null;
  }
}
