import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

/** Resultado de inspeccionar el rol con el que se conecta la API. */
export type DatabaseRoleCheck =
  { status: 'ok' } | { status: 'down' } | { status: 'insecure_role'; reasons: readonly string[] };

/**
 * Cliente Prisma de bajo nivel (pool `pg` vía driver adapter).
 *
 * ⚠️ Solo lo usan `database/`, `health/` y el módulo `tenancy` (regla de ESLint). Cualquier
 * acceso a datos de negocio pasa por `TenantDb` (modules/tenancy), que abre la transacción y
 * fija `app.tenant_id`. Una query hecha directamente con este cliente corre sin contexto y RLS
 * devuelve cero filas (fail-closed).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX }),
    });
  }

  /**
   * Verifica que el rol de la conexión no pueda saltearse RLS: sin SUPERUSER, sin BYPASSRLS y
   * sin ser dueño de tablas (el dueño podría desactivar RLS con ALTER TABLE).
   */
  async checkConnectionRole(): Promise<DatabaseRoleCheck> {
    let rows: { rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }[];
    try {
      rows = await this.$queryRaw`
        SELECT r.rolsuper, r.rolbypassrls,
               EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relowner = r.oid
                       AND c.relnamespace = 'public'::regnamespace) AS owns_tables
        FROM pg_catalog.pg_roles r
        WHERE r.rolname = current_user`;
    } catch {
      return { status: 'down' };
    }
    const role = rows[0];
    if (!role) return { status: 'down' };
    const reasons = [
      role.rolsuper && 'SUPERUSER',
      role.rolbypassrls && 'BYPASSRLS',
      role.owns_tables && 'TABLE_OWNER',
    ].filter((r): r is string => typeof r === 'string');
    return reasons.length > 0 ? { status: 'insecure_role', reasons } : { status: 'ok' };
  }

  /**
   * Falla rápido si la API arranca con un rol privilegiado. Si la DB no responde todavía,
   * solo avisa: `/health/ready` reportará el estado.
   */
  async onApplicationBootstrap(): Promise<void> {
    const check = await this.checkConnectionRole();
    if (check.status === 'insecure_role') {
      throw new Error(
        `DATABASE_URL usa un rol privilegiado (${check.reasons.join(', ')}). ` +
          'La API debe conectarse con el rol de aplicación sin BYPASSRLS (ver README).',
      );
    }
    if (check.status === 'down') {
      this.logger.warn('Base de datos no disponible al arrancar; /health/ready responderá 503.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
