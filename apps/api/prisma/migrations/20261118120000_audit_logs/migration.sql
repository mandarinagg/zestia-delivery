-- Auditoría mínima (issue #14). El interceptor transversal, los diffs antes/después y la vista
-- de administración llegan con el issue #17 sobre esta misma tabla.
--
-- Reglas:
--  * Append-only: el rol de la aplicación solo tiene SELECT + INSERT (sin UPDATE/DELETE/TRUNCATE)
--    y además un trigger rechaza UPDATE/DELETE/TRUNCATE para cualquier rol (incluido el dueño).
--  * tenant_id NULL = evento previo a elegir tenant (login, logout, reset de contraseña).
--  * RLS forzada: la API inserta con el tenant del contexto (o NULL fuera de un contexto de
--    tenant) y lee solo las filas de su tenant activo. Las filas sin tenant no las lee la API.
--  * Sin PII ni secretos en metadata (lo valida AuditService en la aplicación).

-- UUID v7 generado en la DB, para tablas cuyas filas insertan funciones SQL (Prisma genera v7
-- del lado del cliente en el resto). PostgreSQL 17 no trae uuidv7() (llega en 18).
CREATE FUNCTION app_uuid_v7() RETURNS uuid
  LANGUAGE sql VOLATILE PARALLEL SAFE
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT encode(
      set_bit(
        set_bit(
          overlay(uuid_send(gen_random_uuid())
                  PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                  FROM 1 FOR 6),
          52, 1),
        53, 1),
      'hex')::uuid
  $$;

GRANT EXECUTE ON FUNCTION app_uuid_v7() TO zestia_app;

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('USER', 'ANONYMOUS', 'SYSTEM');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "tenant_id" UUID,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_action_format" CHECK (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND length(action) <= 100),
    CONSTRAINT "audit_logs_metadata_object" CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT "audit_logs_correlation_id_length" CHECK (length(correlation_id) <= 128)
);

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_occurred_at_idx" ON "audit_logs"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- Append-only para todos los roles ------------------------------------------------------------

CREATE FUNCTION audit_logs_reject_change() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
  AS $$
  BEGIN
    RAISE EXCEPTION 'audit_logs es append-only (% no permitido)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END
  $$;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_change();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_reject_change();

-- Privilegios y RLS ---------------------------------------------------------------------------

GRANT SELECT, INSERT ON TABLE audit_logs TO zestia_app;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Insertar: con tenant activo, solo filas de ese tenant; sin tenant activo, solo filas sin tenant.
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (tenant_id IS NOT DISTINCT FROM app_current_tenant_id());

-- Leer: solo el tenant activo (la vista de administración y sus permisos son #17).
CREATE POLICY audit_logs_tenant_read ON audit_logs
  FOR SELECT
  USING (tenant_id = app_current_tenant_id());
