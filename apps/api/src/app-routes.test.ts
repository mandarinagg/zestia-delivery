import { PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { TENANT_EXEMPT, TENANT_SCOPED } from './modules/tenancy';

/**
 * Red de seguridad: TODA ruta HTTP declara si es de tenant (`@TenantScoped()`) o si está
 * exenta con motivo (`@TenantExempt(...)`). Un endpoint nuevo sin ninguna de las dos falla acá.
 */
describe('rutas de la API', () => {
  it('cada handler es @TenantScoped() o @TenantExempt()', async () => {
    process.env.DATABASE_URL ??= 'postgresql://zestia_app:unused@127.0.0.1:1/unused';
    process.env.LOG_LEVEL = 'silent';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const reflector = new Reflector();
    const routes: { route: string; scoped: boolean; exempt: boolean }[] = [];

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
          });
        }
      }
    }
    await moduleRef.close();

    expect(routes.length).toBeGreaterThan(0);
    const unclassified = routes.filter((r) => !r.scoped && !r.exempt).map((r) => r.route);
    expect(unclassified, 'rutas sin @TenantScoped() ni @TenantExempt()').toEqual([]);
    const both = routes.filter((r) => r.scoped && r.exempt).map((r) => r.route);
    expect(both, 'rutas con ambos decoradores').toEqual([]);
    expect(routes).toContainEqual({
      route: 'MerchantsController.findOne',
      scoped: true,
      exempt: false,
    });
  });
});
