import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { Principal, PrincipalResolver } from '../modules/tenancy';

/**
 * SOLO TESTS. Simula la sesión autenticada que implementará #14: lee el principal de la
 * cabecera `x-test-principal: <userId>[:<activeTenantId>]`.
 *
 * Nunca se registra en AppModule (src/testing está fuera del build): se inyecta con
 * `overrideProvider(PRINCIPAL_RESOLVER)` en `createTestApp()`. Representa lo que el servidor
 * guardó en la sesión, no un dato confiable del cliente.
 */
export const TEST_PRINCIPAL_HEADER = 'x-test-principal';

@Injectable()
export class TestPrincipalResolver implements PrincipalResolver {
  resolve(context: ExecutionContext): Principal | null {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = request.headers[TEST_PRINCIPAL_HEADER];
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const [userId = '', activeTenantId] = raw.split(':');
    return { userId, activeTenantId: activeTenantId || null };
  }
}

export function principalHeader(userId: string, activeTenantId?: string): string {
  return activeTenantId ? `${userId}:${activeTenantId}` : userId;
}
