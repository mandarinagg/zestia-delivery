-- Autenticación y sesiones (issue #14). Ver docs/SECURITY.md, "Autenticación".
--
-- Modelo de acceso:
--  * Las tablas de autenticación (user_credentials, sessions, auth_attempts,
--    password_reset_tokens) NO tienen ningún GRANT para zestia_app. Tienen RLS forzada y una
--    única política, limitada al rol zestia_migrator.
--  * La API las toca SOLO a través de las funciones SECURITY DEFINER de abajo: son del
--    migrador (dueño del esquema; sin SUPERUSER ni BYPASSRLS), fijan search_path, devuelven lo
--    mínimo y solo zestia_app tiene EXECUTE. Como zestia_app no puede asumir el rol del
--    migrador, las políticas "TO zestia_migrator" solo se activan dentro de estas funciones.
--  * Cada función exige una "llave" que la API no puede fabricar sin el secreto o sin pasar
--    por el rate limit:
--      - sesiones: el SHA-256 del token opaco de la cookie (256 bits aleatorios);
--      - hash de contraseña por email: un intento de login registrado (y contado por el rate
--        limit) hace menos de 2 minutos para ESE email, y una sola vez por intento;
--      - reset: el SHA-256 del token enviado por email.
--
-- Las funciones no fijan app.tenant_id/app.user_id ni leen datos de tenants.

-- Endurecimiento: las funciones nuevas del migrador NO son ejecutables por PUBLIC por defecto.
ALTER DEFAULT PRIVILEGES FOR ROLE zestia_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Email normalizado (trim + minúsculas): unicidad sin distinguir mayúsculas.
ALTER TABLE users ADD CONSTRAINT users_email_normalized
  CHECK (email = lower(btrim(email)) AND length(email) <= 254);

-- CreateEnum
CREATE TYPE "auth_attempt_kind" AS ENUM ('LOGIN', 'PASSWORD_RESET', 'CHANGE_PASSWORD');

-- CreateEnum
CREATE TYPE "session_revoke_reason" AS ENUM ('LOGOUT', 'ROTATED', 'PASSWORD_CHANGED', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "user_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_credentials_password_hash_phc" CHECK (password_hash LIKE '$argon2id$%')
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "active_tenant_id" UUID,
    "idle_timeout_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "session_revoke_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_token_hash_sha256" CHECK (octet_length(token_hash) = 32)
);

-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "kind" "auth_attempt_kind" NOT NULL,
    "account_key" BYTEA NOT NULL,
    "ip_key" BYTEA NOT NULL,
    "user_id" UUID,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "looked_up_at" TIMESTAMPTZ(3),
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_reset_tokens_token_hash_sha256" CHECK (octet_length(token_hash) = 32)
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_attempts_kind_account_key_attempted_at_idx" ON "auth_attempts"("kind", "account_key", "attempted_at");

-- CreateIndex
CREATE INDEX "auth_attempts_kind_ip_key_attempted_at_idx" ON "auth_attempts"("kind", "ip_key", "attempted_at");

-- CreateIndex
CREATE INDEX "auth_attempts_attempted_at_idx" ON "auth_attempts"("attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_tenant_id_fkey" FOREIGN KEY ("active_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tablas de autenticación (sin GRANT a zestia_app; solo las funciones de abajo) ---------

ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY user_credentials_auth_definer ON user_credentials
  FOR ALL TO zestia_migrator USING (true) WITH CHECK (true);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_auth_definer ON sessions
  FOR ALL TO zestia_migrator USING (true) WITH CHECK (true);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_attempts_auth_definer ON auth_attempts
  FOR ALL TO zestia_migrator USING (true) WITH CHECK (true);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY password_reset_tokens_auth_definer ON password_reset_tokens
  FOR ALL TO zestia_migrator USING (true) WITH CHECK (true);

-- Las funciones de login/reset buscan usuarios por email (el rol de la app solo ve su propio
-- usuario y los miembros de su tenant activo). Solo lectura.
CREATE POLICY users_auth_definer ON users
  FOR SELECT TO zestia_migrator USING (true);

-- Funciones -------------------------------------------------------------------------------------
-- Convenciones: SECURITY DEFINER, search_path fijo (pg_catalog primero, pg_temp al final),
-- tablas calificadas con `public.`, parámetros validados y acotados, sin SQL dinámico.

-- Registra un intento y aplica el rate limit (ventana deslizante) por cuenta y por IP.
-- Cuenta: fallos desde el último éxito dentro de la ventana. IP: fallos dentro de la ventana.
-- Un intento bloqueado NO se registra (no extiende el bloqueo). Las claves se guardan como
-- SHA-256 (seudónimas). Purga intentos de más de 2 días.
CREATE FUNCTION auth_attempt_register(
  p_kind auth_attempt_kind,
  p_account text,
  p_ip text,
  p_window_seconds integer,
  p_max_per_account integer,
  p_max_per_ip integer
) RETURNS TABLE (attempt_id uuid, allowed boolean, retry_after_seconds integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_account_key bytea;
    v_ip_key bytea;
    v_window interval;
    v_since timestamptz;
    v_max_account integer := LEAST(GREATEST(coalesce(p_max_per_account, 1), 1), 100);
    v_max_ip integer := LEAST(GREATEST(coalesce(p_max_per_ip, 1), 1), 10000);
    v_last_success timestamptz;
    v_account_count integer;
    v_account_oldest timestamptz;
    v_ip_count integer;
    v_ip_oldest timestamptz;
    v_retry integer := 0;
    v_id uuid;
  BEGIN
    IF p_kind IS NULL OR p_account IS NULL OR length(p_account) NOT BETWEEN 1 AND 320
       OR p_ip IS NULL OR length(p_ip) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'auth_attempt_register: parámetros inválidos' USING ERRCODE = '22023';
    END IF;
    v_account_key := sha256(convert_to(p_account, 'UTF8'));
    v_ip_key := sha256(convert_to(p_ip, 'UTF8'));
    v_window := make_interval(secs => LEAST(GREATEST(coalesce(p_window_seconds, 60), 60), 86400));
    v_since := now() - v_window;

    -- Serializa por cuenta: dos intentos simultáneos no pueden pasar ambos el último cupo.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_kind::text || ':' || encode(v_account_key, 'hex'), 0));

    DELETE FROM public.auth_attempts
      WHERE id IN (SELECT a.id FROM public.auth_attempts a
                   WHERE a.attempted_at < now() - interval '2 days' LIMIT 500);

    SELECT max(a.attempted_at) INTO v_last_success
      FROM public.auth_attempts a
      WHERE a.kind = p_kind AND a.account_key = v_account_key AND a.succeeded
        AND a.attempted_at > v_since;

    SELECT count(*)::int, min(a.attempted_at) INTO v_account_count, v_account_oldest
      FROM public.auth_attempts a
      WHERE a.kind = p_kind AND a.account_key = v_account_key AND NOT a.succeeded
        AND a.attempted_at > GREATEST(v_since, coalesce(v_last_success, v_since));

    SELECT count(*)::int, min(a.attempted_at) INTO v_ip_count, v_ip_oldest
      FROM public.auth_attempts a
      WHERE a.kind = p_kind AND a.ip_key = v_ip_key AND NOT a.succeeded
        AND a.attempted_at > v_since;

    IF v_account_count >= v_max_account THEN
      v_retry := GREATEST(v_retry, ceil(extract(epoch FROM (v_account_oldest + v_window - now())))::int);
    END IF;
    IF v_ip_count >= v_max_ip THEN
      v_retry := GREATEST(v_retry, ceil(extract(epoch FROM (v_ip_oldest + v_window - now())))::int);
    END IF;

    IF v_account_count >= v_max_account OR v_ip_count >= v_max_ip THEN
      RETURN QUERY SELECT NULL::uuid, false, GREATEST(v_retry, 1);
      RETURN;
    END IF;

    INSERT INTO public.auth_attempts (kind, account_key, ip_key)
      VALUES (p_kind, v_account_key, v_ip_key)
      RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, true, 0;
  END
  $$;

-- Credenciales para verificar un login. Exige un intento LOGIN recién registrado para ESE
-- email (mismo SHA-256), no consumido: una lectura de hash por intento contado. Devuelve cero
-- filas si el email no existe. `password_hash` es NULL si el usuario no tiene contraseña.
CREATE FUNCTION auth_login_lookup(p_attempt_id uuid, p_email text)
  RETURNS TABLE (user_id uuid, password_hash text, user_status user_status)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_user uuid;
  BEGIN
    IF p_attempt_id IS NULL OR p_email IS NULL THEN
      RETURN;
    END IF;
    UPDATE public.auth_attempts a
       SET looked_up_at = now(),
           user_id = (SELECT u.id FROM public.users u WHERE u.email = p_email)
     WHERE a.id = p_attempt_id
       AND a.kind = 'LOGIN'
       AND a.looked_up_at IS NULL
       AND NOT a.succeeded
       AND a.attempted_at > now() - interval '2 minutes'
       AND a.account_key = sha256(convert_to(p_email, 'UTF8'))
    RETURNING a.user_id INTO v_user;

    IF v_user IS NULL THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT u.id, c.password_hash, u.status
      FROM public.users u
      LEFT JOIN public.user_credentials c ON c.user_id = u.id
      WHERE u.id = v_user;
  END
  $$;

-- Cierra un login exitoso: marca el intento (resetea el contador de la cuenta), opcionalmente
-- re-hashea con parámetros nuevos, revoca la sesión que traía el navegador (rotación) y crea la
-- sesión nueva. Exige un intento LOGIN consultado, no usado, de < 2 min, de un usuario ACTIVE
-- con contraseña. Devuelve el id de la sesión, o NULL si no corresponde.
CREATE FUNCTION auth_login_complete(
  p_attempt_id uuid,
  p_token_hash bytea,
  p_idle_seconds integer,
  p_absolute_seconds integer,
  p_active_tenant_id uuid,
  p_replaced_token_hash bytea,
  p_rehash text
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    v_user uuid;
    v_idle integer := LEAST(GREATEST(coalesce(p_idle_seconds, 60), 60), 86400);
    v_absolute integer := LEAST(GREATEST(coalesce(p_absolute_seconds, 300), 300), 2592000);
    v_session uuid;
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
      RAISE EXCEPTION 'auth_login_complete: token inválido' USING ERRCODE = '22023';
    END IF;
    v_idle := LEAST(v_idle, v_absolute);

    UPDATE public.auth_attempts a
       SET succeeded = true
     WHERE a.id = p_attempt_id
       AND a.kind = 'LOGIN'
       AND a.looked_up_at IS NOT NULL
       AND NOT a.succeeded
       AND a.attempted_at > now() - interval '2 minutes'
       AND a.user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.users u
                   JOIN public.user_credentials c ON c.user_id = u.id
                   WHERE u.id = a.user_id AND u.status = 'ACTIVE')
    RETURNING a.user_id INTO v_user;

    IF v_user IS NULL THEN
      RETURN NULL;
    END IF;

    IF p_rehash IS NOT NULL AND p_rehash LIKE '$argon2id$%' THEN
      UPDATE public.user_credentials SET password_hash = p_rehash, updated_at = now()
        WHERE user_id = v_user;
    END IF;

    IF p_replaced_token_hash IS NOT NULL THEN
      UPDATE public.sessions
         SET revoked_at = now(), revoked_reason = 'ROTATED'
       WHERE token_hash = p_replaced_token_hash AND revoked_at IS NULL;
    END IF;

    -- Limpieza oportunista de sesiones muertas del usuario.
    DELETE FROM public.sessions s
     WHERE s.user_id = v_user
       AND (s.revoked_at IS NOT NULL OR s.idle_expires_at <= now() OR s.absolute_expires_at <= now());

    INSERT INTO public.sessions
      (user_id, token_hash, active_tenant_id, idle_timeout_seconds, idle_expires_at, absolute_expires_at)
    VALUES
      (v_user, p_token_hash, p_active_tenant_id, v_idle,
       now() + make_interval(secs => v_idle), now() + make_interval(secs => v_absolute))
    RETURNING id INTO v_session;
    RETURN v_session;
  END
  $$;

-- Sesión válida (no revocada, sin vencer, usuario ACTIVE) por el hash de su token. Renueva el
-- vencimiento por inactividad como mucho una vez por minuto (sin superar el absoluto).
CREATE FUNCTION auth_session_lookup(p_token_hash bytea)
  RETURNS TABLE (session_id uuid, user_id uuid, active_tenant_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_id uuid;
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
      RETURN;
    END IF;
    SELECT s.id INTO v_id
      FROM public.sessions s
      JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.idle_expires_at > now()
       AND s.absolute_expires_at > now()
       AND u.status = 'ACTIVE';
    IF v_id IS NULL THEN
      RETURN;
    END IF;
    UPDATE public.sessions s
       SET last_seen_at = now(),
           idle_expires_at = LEAST(now() + make_interval(secs => s.idle_timeout_seconds), s.absolute_expires_at)
     WHERE s.id = v_id AND s.last_seen_at < now() - interval '60 seconds';
    RETURN QUERY SELECT s.id, s.user_id, s.active_tenant_id FROM public.sessions s WHERE s.id = v_id;
  END
  $$;

-- Logout: revoca la sesión del token. Devuelve la sesión revocada (cero filas si no había una
-- activa).
CREATE FUNCTION auth_session_revoke(p_token_hash bytea)
  RETURNS TABLE (session_id uuid, user_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
      RETURN;
    END IF;
    RETURN QUERY
      WITH revoked AS (
        UPDATE public.sessions s
           SET revoked_at = now(), revoked_reason = 'LOGOUT'
         WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL
        RETURNING s.id, s.user_id
      )
      SELECT r.id, r.user_id FROM revoked r;
  END
  $$;

-- Guarda el tenant activo (preferencia) de una sesión válida. La membresía la valida la API
-- antes (TenantResolver) y el guard de tenancy la vuelve a validar en cada request.
CREATE FUNCTION auth_session_set_active_tenant(p_token_hash bytea, p_tenant_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
      RETURN false;
    END IF;
    UPDATE public.sessions s
       SET active_tenant_id = p_tenant_id
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.idle_expires_at > now()
       AND s.absolute_expires_at > now();
    RETURN FOUND;
  END
  $$;

-- Hash de la contraseña del usuario DE LA SESIÓN (para cambiar la contraseña). Sin el token de
-- una sesión válida no devuelve nada.
CREATE FUNCTION auth_session_credentials(p_token_hash bytea)
  RETURNS TABLE (user_id uuid, password_hash text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT s.user_id, c.password_hash
        FROM public.sessions s
        JOIN public.users u ON u.id = s.user_id
        LEFT JOIN public.user_credentials c ON c.user_id = s.user_id
       WHERE s.token_hash = p_token_hash
         AND s.revoked_at IS NULL
         AND s.idle_expires_at > now()
         AND s.absolute_expires_at > now()
         AND u.status = 'ACTIVE';
  END
  $$;

-- Cambio de contraseña autenticado: exige la sesión válida y un intento CHANGE_PASSWORD de ese
-- usuario (< 2 min, no usado). Guarda el hash nuevo, revoca las demás sesiones, rota el token
-- de la sesión actual e invalida los tokens de reset pendientes. Devuelve el user_id o NULL.
CREATE FUNCTION auth_change_password(
  p_token_hash bytea,
  p_attempt_id uuid,
  p_new_password_hash text,
  p_new_token_hash bytea
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    v_session uuid;
    v_user uuid;
    v_attempt uuid;
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32
       OR p_new_token_hash IS NULL OR octet_length(p_new_token_hash) <> 32
       OR p_new_password_hash IS NULL OR p_new_password_hash NOT LIKE '$argon2id$%' THEN
      RAISE EXCEPTION 'auth_change_password: parámetros inválidos' USING ERRCODE = '22023';
    END IF;

    SELECT s.id, s.user_id INTO v_session, v_user
      FROM public.sessions s
      JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.idle_expires_at > now()
       AND s.absolute_expires_at > now()
       AND u.status = 'ACTIVE'
     FOR UPDATE OF s;
    IF v_session IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.auth_attempts a
       SET succeeded = true, user_id = v_user
     WHERE a.id = p_attempt_id
       AND a.kind = 'CHANGE_PASSWORD'
       AND NOT a.succeeded
       AND a.attempted_at > now() - interval '2 minutes'
       AND a.account_key = sha256(convert_to(v_user::text, 'UTF8'))
    RETURNING a.id INTO v_attempt;
    IF v_attempt IS NULL THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.user_credentials (user_id, password_hash)
      VALUES (v_user, p_new_password_hash)
    ON CONFLICT (user_id) DO UPDATE
      SET password_hash = EXCLUDED.password_hash, password_changed_at = now(), updated_at = now();

    UPDATE public.sessions
       SET revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
     WHERE user_id = v_user AND id <> v_session AND revoked_at IS NULL;

    UPDATE public.sessions
       SET token_hash = p_new_token_hash, last_seen_at = now(),
           idle_expires_at = LEAST(now() + make_interval(secs => idle_timeout_seconds), absolute_expires_at)
     WHERE id = v_session;

    UPDATE public.password_reset_tokens
       SET invalidated_at = now()
     WHERE user_id = v_user AND used_at IS NULL AND invalidated_at IS NULL;

    RETURN v_user;
  END
  $$;

-- Pedido de reset: exige un intento PASSWORD_RESET recién registrado para ESE email (contado
-- por el rate limit), no consumido. Si el email es de un usuario ACTIVE, invalida sus tokens
-- anteriores y guarda el hash del nuevo. Devuelve el user_id, o NULL (email desconocido o
-- usuario deshabilitado: la API responde igual en ambos casos).
CREATE FUNCTION auth_password_reset_issue(
  p_attempt_id uuid,
  p_email text,
  p_token_hash bytea,
  p_ttl_seconds integer
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    v_user uuid;
    v_ttl integer := LEAST(GREATEST(coalesce(p_ttl_seconds, 300), 300), 7200);
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 OR p_email IS NULL THEN
      RAISE EXCEPTION 'auth_password_reset_issue: parámetros inválidos' USING ERRCODE = '22023';
    END IF;

    UPDATE public.auth_attempts a
       SET looked_up_at = now(),
           user_id = (SELECT u.id FROM public.users u WHERE u.email = p_email AND u.status = 'ACTIVE')
     WHERE a.id = p_attempt_id
       AND a.kind = 'PASSWORD_RESET'
       AND a.looked_up_at IS NULL
       AND a.attempted_at > now() - interval '2 minutes'
       AND a.account_key = sha256(convert_to(p_email, 'UTF8'))
    RETURNING a.user_id INTO v_user;

    IF v_user IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.password_reset_tokens
       SET invalidated_at = now()
     WHERE user_id = v_user AND used_at IS NULL AND invalidated_at IS NULL;
    DELETE FROM public.password_reset_tokens
     WHERE user_id = v_user AND expires_at < now() - interval '1 day';

    INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (v_user, p_token_hash, now() + make_interval(secs => v_ttl));
    RETURN v_user;
  END
  $$;

-- Completa un reset: token vigente, no usado ni invalidado, de un usuario ACTIVE. Lo marca
-- usado (un solo uso), guarda el hash nuevo, invalida otros tokens y revoca TODAS las sesiones
-- del usuario. Devuelve el user_id o NULL.
CREATE FUNCTION auth_password_reset_complete(p_token_hash bytea, p_new_password_hash text)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    v_token uuid;
    v_user uuid;
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32
       OR p_new_password_hash IS NULL OR p_new_password_hash NOT LIKE '$argon2id$%' THEN
      RETURN NULL;
    END IF;

    SELECT t.id, t.user_id INTO v_token, v_user
      FROM public.password_reset_tokens t
      JOIN public.users u ON u.id = t.user_id
     WHERE t.token_hash = p_token_hash
       AND t.used_at IS NULL
       AND t.invalidated_at IS NULL
       AND t.expires_at > now()
       AND u.status = 'ACTIVE'
     FOR UPDATE OF t;
    IF v_token IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE public.password_reset_tokens SET used_at = now() WHERE id = v_token;
    UPDATE public.password_reset_tokens
       SET invalidated_at = now()
     WHERE user_id = v_user AND id <> v_token AND used_at IS NULL AND invalidated_at IS NULL;

    INSERT INTO public.user_credentials (user_id, password_hash)
      VALUES (v_user, p_new_password_hash)
    ON CONFLICT (user_id) DO UPDATE
      SET password_hash = EXCLUDED.password_hash, password_changed_at = now(), updated_at = now();

    UPDATE public.sessions
       SET revoked_at = now(), revoked_reason = 'PASSWORD_RESET'
     WHERE user_id = v_user AND revoked_at IS NULL;

    RETURN v_user;
  END
  $$;

-- EXECUTE solo para el rol de la aplicación -------------------------------------------------

REVOKE ALL ON FUNCTION
  auth_attempt_register(auth_attempt_kind, text, text, integer, integer, integer),
  auth_login_lookup(uuid, text),
  auth_login_complete(uuid, bytea, integer, integer, uuid, bytea, text),
  auth_session_lookup(bytea),
  auth_session_revoke(bytea),
  auth_session_set_active_tenant(bytea, uuid),
  auth_session_credentials(bytea),
  auth_change_password(bytea, uuid, text, bytea),
  auth_password_reset_issue(uuid, text, bytea, integer),
  auth_password_reset_complete(bytea, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  auth_attempt_register(auth_attempt_kind, text, text, integer, integer, integer),
  auth_login_lookup(uuid, text),
  auth_login_complete(uuid, bytea, integer, integer, uuid, bytea, text),
  auth_session_lookup(bytea),
  auth_session_revoke(bytea),
  auth_session_set_active_tenant(bytea, uuid),
  auth_session_credentials(bytea),
  auth_change_password(bytea, uuid, text, bytea),
  auth_password_reset_issue(uuid, text, bytea, integer),
  auth_password_reset_complete(bytea, text)
TO zestia_app;
