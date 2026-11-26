import { SetMetadata } from '@nestjs/common';
import { type Permission, isPermission } from '@zestia/auth';
import { TENANT_PERMISSIONS } from './tenant-metadata';

/**
 * Permisos que exige un endpoint de tenant (matriz de `@zestia/auth`, issue #16). Con varios,
 * hacen falta TODOS. En el handler pisa al del controller.
 *
 * Obligatorio en toda ruta `@TenantScoped()`: lo exige `app-routes.test.ts`, y si faltara en
 * runtime el `TenantGuard` falla cerrado.
 */
export function RequirePermission(
  ...permissions: [Permission, ...Permission[]]
): MethodDecorator & ClassDecorator {
  const invalid = permissions.filter((p) => !isPermission(p));
  if (permissions.length === 0 || invalid.length > 0) {
    throw new Error(
      `@RequirePermission(): permisos inválidos: ${invalid.join(', ') || '(ninguno)'}`,
    );
  }
  return SetMetadata(TENANT_PERMISSIONS, Object.freeze([...permissions]));
}
