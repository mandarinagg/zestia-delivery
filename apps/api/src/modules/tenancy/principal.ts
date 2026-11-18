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
 * Contrato que la autenticación (#14) debe implementar y registrar con el token
 * `PRINCIPAL_RESOLVER`. Devuelve `null` si la request no está autenticada (→ 401).
 */
export interface PrincipalResolver {
  resolve(context: ExecutionContext): Principal | null | Promise<Principal | null>;
}

export const PRINCIPAL_RESOLVER = Symbol('PRINCIPAL_RESOLVER');

/**
 * Implementación por defecto mientras no exista autenticación: nadie está autenticado, por lo
 * que todo endpoint con `@TenantScoped()` responde 401 (fail-closed). Los tests reemplazan este
 * provider con un resolver de prueba (src/testing), que no se compila en el build.
 */
@Injectable()
export class UnauthenticatedPrincipalResolver implements PrincipalResolver {
  resolve(): null {
    return null;
  }
}
