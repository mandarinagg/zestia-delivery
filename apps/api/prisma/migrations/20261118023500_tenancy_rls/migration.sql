-- Multi-tenancy: Row Level Security (issue #15, ADR-004, docs/ARCHITECTURE.md "Multi-tenancy").
--
-- La API abre una transacción por request y ejecuta
--   SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)
-- (equivalente parametrizado de SET LOCAL). Las políticas leen esos valores.
--
-- Fail-closed: sin valor, o con valor vacío (lo que queda en la sesión después de un
-- SET LOCAL ya terminado), las funciones devuelven NULL y `x = NULL` nunca es verdadero:
-- cero filas, sin error. Un valor que no es UUID produce error (nunca filas).
--
-- Regla: TODA tabla a la que accede el rol de la aplicación tiene RLS habilitada y FORZADA
-- (FORCE aplica las políticas también al dueño de la tabla). Lo verifica un test de catálogo.
-- El rol `zestia_app` debe existir antes de migrar (infra/docker/postgres/initdb/01-roles.sh).

-- Funciones de contexto -------------------------------------------------------------------

CREATE FUNCTION app_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid $$;

-- Privilegios del rol de la aplicación (solo lo explícito) ---------------------------------

GRANT USAGE ON SCHEMA public TO zestia_app;
GRANT EXECUTE ON FUNCTION app_current_tenant_id(), app_current_user_id() TO zestia_app;

GRANT SELECT ON TABLE tenants TO zestia_app;
GRANT SELECT ON TABLE users TO zestia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE memberships TO zestia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE merchants TO zestia_app;

-- tenants ----------------------------------------------------------------------------------
-- Con tenant activo: solo ese tenant. Sin tenant activo (resolución de membresía, selector de
-- empresa): los tenants donde el usuario del contexto tiene membresía.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON tenants
  FOR SELECT
  USING (
    id = app_current_tenant_id()
    OR (
      app_current_tenant_id() IS NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.tenant_id = tenants.id AND m.user_id = app_current_user_id()
      )
    )
  );

-- memberships ------------------------------------------------------------------------------

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON memberships
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- Resolución del tenant activo: antes de fijar app.tenant_id, el servidor busca las
-- membresías del usuario autenticado. Solo lectura y solo sin tenant activo.
CREATE POLICY memberships_self_lookup ON memberships
  FOR SELECT
  USING (app_current_tenant_id() IS NULL AND user_id = app_current_user_id());

-- users (global, sin tenant_id, pero con PII) ----------------------------------------------
-- Visible el propio usuario y los miembros del tenant activo. El alta y el login por email
-- (issue #14) necesitan su propio camino (p. ej. función SECURITY DEFINER acotada).

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_self ON users
  FOR SELECT
  USING (id = app_current_user_id());

CREATE POLICY users_tenant_members ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id AND m.tenant_id = app_current_tenant_id()
    )
  );

-- merchants (tabla de negocio) ---------------------------------------------------------------

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants FORCE ROW LEVEL SECURITY;

CREATE POLICY merchants_tenant_isolation ON merchants
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
