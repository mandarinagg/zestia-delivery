import type { INestApplication } from '@nestjs/common';
import request, { type Response, type Test } from 'supertest';
import { expect } from 'vitest';
import type { MembershipRoleName, TestSeeder } from './test-database';
import { TEST_PRINCIPAL_HEADER, principalHeader } from './test-principal.resolver';

type Http = ReturnType<typeof request>;

export interface TenantIsolationOptions {
  /** App creada con `createTestApp()`. */
  readonly app: INestApplication;
  readonly seeder: TestSeeder;
  /** Crea el recurso en el tenant dado (como superusuario) y devuelve su id. */
  readonly seed: (tenantId: string) => Promise<string>;
  /** La request bajo prueba contra el recurso `id`. Devolver el `Test` SIN await. */
  readonly request: (http: Http, id: string) => Test;
  /**
   * Rol de los usuarios de prueba. Por defecto OWNER (el más privilegiado): así un 403/404
   * del intruso no se explica por permisos sino por el aislamiento.
   */
  readonly role?: MembershipRoleName;
  /** Status esperado cuando el dueño accede a su recurso (por defecto 200). */
  readonly ownerStatus?: number;
}

export interface TenantIsolationReport {
  readonly ownerTenantId: string;
  readonly intruderTenantId: string;
  readonly resourceId: string;
  readonly statuses: Readonly<Record<string, number>>;
}

const DENIED = [403, 404];

/**
 * Suite obligatoria de aislamiento (docs/TESTING.md, "Aislamiento de tenants").
 *
 * Crea dos tenants A (dueño del recurso) y B (intruso), cada uno con un usuario miembro, y
 * siembra un recurso en cada uno. Verifica:
 *  1. control: A accede a su recurso y B al suyo con `ownerStatus` (si no, el test pasaría
 *     en falso con un endpoint roto);
 *  2. B pidiendo el id del recurso de A → 403/404;
 *  3. B manipulando "pistas" de tenant del cliente (cabeceras `x-tenant-id`/`x-tenant`,
 *     query `tenantId`) → 403/404: el tenant se resuelve en el servidor;
 *  4. B con una sesión cuyo tenant activo apunta a A (sin membresía allí) → 403;
 *  5. sin autenticación → 401;
 *  y que ninguna respuesta denegada contenga el id del recurso de A.
 */
export async function expectTenantIsolation(
  options: TenantIsolationOptions,
): Promise<TenantIsolationReport> {
  const { app, seeder, seed, role = 'OWNER', ownerStatus = 200 } = options;
  const owner = await seeder.tenantWithMember(role);
  const intruder = await seeder.tenantWithMember(role);
  const victimId = await seed(owner.tenantId);
  const intruderOwnId = await seed(intruder.tenantId);

  const http = request(app.getHttpServer());
  const as = (userId: string, id: string, activeTenantId?: string): Test =>
    options.request(http, id).set(TEST_PRINCIPAL_HEADER, principalHeader(userId, activeTenantId));

  const statuses: Record<string, number> = {};
  const check = async (
    label: string,
    pending: Test,
    allowed: readonly number[],
  ): Promise<Response> => {
    const res = await pending;
    statuses[label] = res.status;
    expect(allowed, `${label}: status ${res.status} (${res.text})`).toContain(res.status);
    return res;
  };
  const denied = async (label: string, pending: Test, allowed = DENIED): Promise<void> => {
    const res = await check(label, pending, allowed);
    expect(res.text, `${label}: la respuesta no debe revelar el recurso`).not.toContain(victimId);
  };

  await check('owner -> own resource', as(owner.userId, victimId), [ownerStatus]);
  await check('intruder -> own resource', as(intruder.userId, intruderOwnId), [ownerStatus]);

  await denied('intruder -> foreign id', as(intruder.userId, victimId));
  await denied(
    'intruder -> foreign id + spoofed tenant hints',
    as(intruder.userId, victimId)
      .set('x-tenant-id', owner.tenantId)
      .set('x-tenant', owner.tenantId)
      .query({ tenantId: owner.tenantId }),
  );
  await denied(
    'intruder session pointing to foreign tenant',
    as(intruder.userId, victimId, owner.tenantId),
    [403],
  );
  await denied('unauthenticated', options.request(http, victimId), [401]);

  return {
    ownerTenantId: owner.tenantId,
    intruderTenantId: intruder.tenantId,
    resourceId: victimId,
    statuses,
  };
}
