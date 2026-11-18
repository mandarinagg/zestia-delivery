import {
  type ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, Role } from '@zestia/auth';
import { describe, expect, it } from 'vitest';
import type { PrincipalResolver } from './principal';
import { RequirePermission } from './require-permission.decorator';
import { TenantGuard } from './tenant.guard';
import type { TenantResolver } from './tenant.resolver';

const IDS = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  membershipId: '00000000-0000-4000-8000-000000000003',
};

function guardFor(role: Role): TenantGuard {
  const principals: PrincipalResolver = {
    resolve: () => ({ userId: IDS.userId, activeTenantId: null }),
  };
  const tenants = {
    resolve: () => Promise.resolve({ ok: true, context: { ...IDS, role } }),
  } as unknown as TenantResolver;
  return new TenantGuard(principals, tenants, new Reflector());
}

function contextFor(handler: () => unknown, controller: object = class {}): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

function handlerWith(...permissions: [Permission, ...Permission[]]): () => void {
  const handler = (): void => undefined;
  RequirePermission(...permissions)(handler, 'handler', { value: handler });
  return handler;
}

describe('TenantGuard: permisos', () => {
  it('deja pasar si el rol tiene el permiso', async () => {
    await expect(
      guardFor('OPERATOR').canActivate(contextFor(handlerWith('merchants:read'))),
    ).resolves.toBe(true);
  });

  it('403 PERMISSION_DENIED si el rol no lo tiene', async () => {
    const promise = guardFor('COURIER').canActivate(contextFor(handlerWith('merchants:read')));
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toMatchObject({
      response: { statusCode: 403, code: 'PERMISSION_DENIED' },
    });
  });

  it('con varios permisos exige todos', async () => {
    const ctx = contextFor(handlerWith('merchants:read', 'merchants:manage'));
    await expect(guardFor('OPERATOR').canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guardFor('ADMIN').canActivate(ctx)).resolves.toBe(true);
  });

  it('falla cerrado si la ruta no declara permiso (ni siquiera el Propietario pasa)', async () => {
    const bare = (): void => undefined;
    await expect(guardFor('OWNER').canActivate(contextFor(bare))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('el permiso del handler pisa al del controller', async () => {
    @RequirePermission('users:manage-owners')
    class Controller {}
    const ctx = contextFor(handlerWith('merchants:read'), Controller);
    await expect(guardFor('OPERATOR').canActivate(ctx)).resolves.toBe(true);
  });
});

describe('@RequirePermission()', () => {
  it('rechaza permisos desconocidos al declarar la ruta', () => {
    expect(() => RequirePermission('merchants:delete' as Permission)).toThrow(/inválidos/);
  });
});
