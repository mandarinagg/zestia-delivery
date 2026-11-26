import { PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { TENANT_EXEMPT, TENANT_PERMISSIONS, TENANT_SCOPED } from './modules/tenancy';

interface RouteInfo {
  route: string;
  scoped: boolean;
  exempt: boolean;
  permissions: readonly string[] | null;
}

async function collectRoutes(): Promise<RouteInfo[]> {
  process.env.DATABASE_URL ??= 'postgresql://zestia_app:unused@127.0.0.1:1/unused';
  process.env.LOG_LEVEL = 'silent';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const reflector = new Reflector();
  const routes: RouteInfo[] = [];

  for (const module of moduleRef.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        const targets = [handler, controller];
        routes.push({
          route: `${controller.name}.${name}`,
          scoped: reflector.getAllAndOverride<boolean>(TENANT_SCOPED, targets) === true,
          exempt: typeof reflector.getAllAndOverride<string>(TENANT_EXEMPT, targets) === 'string',
          permissions:
            reflector.getAllAndOverride<readonly string[]>(TENANT_PERMISSIONS, targets) ?? null,
        });
      }
    }
  }
  await moduleRef.close();
  return routes;
}

/**
 * Red de seguridad: TODA ruta HTTP declara si es de tenant (`@TenantScoped()`) o si está
 * exenta con motivo (`@TenantExempt(...)`), y toda ruta de tenant declara su permiso
 * (`@RequirePermission(...)`). Un endpoint nuevo sin eso falla acá.
 */
describe('rutas de la API', () => {
  it('cada handler es @TenantScoped() o @TenantExempt()', async () => {
    const routes = await collectRoutes();

    expect(routes.length).toBeGreaterThan(0);
    const unclassified = routes.filter((r) => !r.scoped && !r.exempt).map((r) => r.route);
    expect(unclassified, 'rutas sin @TenantScoped() ni @TenantExempt()').toEqual([]);
    const both = routes.filter((r) => r.scoped && r.exempt).map((r) => r.route);
    expect(both, 'rutas con ambos decoradores').toEqual([]);
    expect(routes).toContainEqual({
      route: 'MerchantsController.findOne',
      scoped: true,
      exempt: false,
      permissions: ['merchants:read'],
    });
    // Autenticación: exenta (crea la sesión y elige el tenant); ver AuthController.
    for (const handler of [
      'login',
      'logout',
      'me',
      'switchTenant',
      'changePassword',
      'forgotPassword',
      'resetPassword',
    ]) {
      expect(routes).toContainEqual({
        route: `AuthController.${handler}`,
        scoped: false,
        exempt: true,
        permissions: null,
      });
    }
    // Aceptar una invitación: todavía no hay membresía; autoriza el token del email.
    for (const handler of ['preview', 'accept']) {
      expect(routes).toContainEqual({
        route: `InvitationAcceptanceController.${handler}`,
        scoped: false,
        exempt: true,
        permissions: null,
      });
    }
  });

  it('cada ruta de tenant declara @RequirePermission() y las exentas no', async () => {
    const routes = await collectRoutes();
    const missing = routes.filter((r) => r.scoped && !r.permissions?.length).map((r) => r.route);
    expect(missing, 'rutas @TenantScoped() sin @RequirePermission()').toEqual([]);
    const misleading = routes.filter((r) => r.exempt && r.permissions).map((r) => r.route);
    expect(misleading, 'rutas @TenantExempt() con @RequirePermission() (no se aplicaría)').toEqual(
      [],
    );
  });

  /**
   * Inventario de permisos por endpoint: cambiar el permiso de una ruta (o agregar una) obliga
   * a actualizar esta tabla, así queda visible en el PR. La matriz rol → permiso se prueba en
   * `packages/auth` y de punta a punta en los `*.int.test.ts` de cada módulo.
   */
  it('inventario de permisos por endpoint', async () => {
    const routes = await collectRoutes();
    const inventory = Object.fromEntries(
      routes.filter((r) => r.scoped).map((r) => [r.route, r.permissions]),
    );
    expect(inventory).toEqual({
      'AuditLogsController.list': ['audit:read'],
      'AuditLogsController.findOne': ['audit:read'],
      'MerchantsController.list': ['merchants:read'],
      'MerchantsController.findOne': ['merchants:read'],
      'MerchantsController.create': ['merchants:manage'],
      'MerchantsController.update': ['merchants:manage'],
      'MerchantsController.suspend': ['merchants:manage'],
      'MerchantsController.reactivate': ['merchants:manage'],
      'MerchantsController.archive': ['merchants:manage'],
      'MerchantsController.createBranch': ['merchants:manage'],
      'MerchantsController.updateBranch': ['merchants:manage'],
      'MerchantsController.archiveBranch': ['merchants:manage'],
      'MembersController.list': ['users:read'],
      'MembersController.findOne': ['users:read'],
      'MembersController.update': ['users:manage'],
      'MembersController.disable': ['users:manage'],
      'MembersController.enable': ['users:manage'],
      'InvitationsController.list': ['users:read'],
      'InvitationsController.create': ['users:manage'],
      'InvitationsController.resend': ['users:manage'],
      'InvitationsController.revoke': ['users:manage'],
    });
  });
});
