-- Aviso de vencimiento de sesión en la web (issue #14).
--
-- `auth_session_lookup` devuelve además los SEGUNDOS que le quedan a la sesión (por inactividad
-- y absolutos), calculados con el reloj de la DB DESPUÉS de renovar. La API los manda en los
-- headers `X-Session-Idle-Remaining` / `X-Session-Absolute-Remaining`: así el cliente no
-- depende de que su reloj coincida con el del servidor y no hace falta una consulta extra.
--
-- Cambia el tipo de retorno: hay que borrar y recrear la función y volver a dar los permisos
-- (mismo modelo que en `*_auth_sessions`: sin acceso directo a las tablas para `zestia_app`).

DROP FUNCTION auth_session_lookup(bytea);

CREATE FUNCTION auth_session_lookup(p_token_hash bytea)
  RETURNS TABLE (
    session_id uuid,
    user_id uuid,
    active_tenant_id uuid,
    idle_remaining_seconds integer,
    absolute_remaining_seconds integer
  )
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
    RETURN QUERY
      SELECT s.id, s.user_id, s.active_tenant_id,
             GREATEST(0, floor(extract(epoch FROM (LEAST(s.idle_expires_at, s.absolute_expires_at) - now()))))::integer,
             GREATEST(0, floor(extract(epoch FROM (s.absolute_expires_at - now()))))::integer
        FROM public.sessions s WHERE s.id = v_id;
  END
  $$;

REVOKE ALL ON FUNCTION auth_session_lookup(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_session_lookup(bytea) TO zestia_app;
