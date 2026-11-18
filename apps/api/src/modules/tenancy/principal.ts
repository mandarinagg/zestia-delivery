import { type ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Identidad autenticada de una request. La implementa la autenticación (issue #14).
 *
 * - `userId`: id del `User` global, tomado de la sesión del servidor (nunca del body/headers
 *   en claro).
 * - `activeTenantId`: tenant elegido en la sesión (login / selector de empresa), o `null`.
 *   Es solo una PREFERENCIA: el tenant se confirma contra una membresía real en la DB
 *   (`TenantResolver`). Si es `null` y el usuario tiene una sola membresía, se usa esa.
 */
export interface Principal {
  readonly userId: string;
  readonly activeTenantId: string | null;
}

/**
 * Contrato que implementa la autenticación y se registra con el token `PRINCIPAL_RESOLVER`
 * (hoy: `SessionPrincipalResolver` del módulo auth, sesión de servidor por cookie). Devuelve
 * `null` si la request no está autenticada (→ 401).
 */
export interface PrincipalResolver {
  resolve(context: ExecutionContext): Principal | null | Promise<Principal | null>;
}

export const PRINCIPAL_RESOLVER = Symbol('PRINCIPAL_RESOLVER');

/**
 * Resolver que no autentica a nadie: todo endpoint con `@TenantScoped()` responde 401. Útil en
 * tests de unidad o módulos armados sin autenticación. La app real usa el de `AuthModule`.
 */
@Injectable()
export class UnauthenticatedPrincipalResolver implements PrincipalResolver {
  resolve(): null {
    return null;
  }
}
