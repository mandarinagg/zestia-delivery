-- Consultar el estado de la sesión SIN renovarla (issue #14, aviso de vencimiento).
--
-- 1. `p_renew boolean DEFAULT true`: con `false`, `auth_session_lookup` valida la sesión y
--    devuelve lo que le queda sin tocar `idle_expires_at` ni `last_seen_at`. Sirve para
--    `GET /auth/session-status`: el panel pregunta al llegar a cero, y esa pregunta no puede
--    alargar la sesión (si no, un panel abandonado se mantendría vivo solo).
-- 2. Los restantes se redondean con `ceil`, no con `floor`: mientras la sesión es válida
--    quedan al menos 1 s, y el cliente nunca cree que vence ANTES que el servidor. Con `floor`
--    el cliente preguntaba justo al vencer, con fracciones de segundo todavía a favor.
--
-- Cambia la firma: se borra la versión de un parámetro (si no, quedaría como sobrecarga) y se
-- vuelve a dar el permiso. Mismo modelo que `*_auth_sessions`: SECURITY DEFINER, `search_path`
-- fijo, sin EXECUTE para PUBLIC, solo `zestia_app`.

DROP FUNCTION auth_session_lookup(bytea);

CREATE FUNCTION auth_session_lookup(p_token_hash bytea, p_renew boolean DEFAULT true)
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
    IF COALESCE(p_renew, true) THEN
      UPDATE public.sessions s
         SET last_seen_at = now(),
             idle_expires_at = LEAST(now() + make_interval(secs => s.idle_timeout_seconds), s.absolute_expires_at)
       WHERE s.id = v_id AND s.last_seen_at < now() - interval '60 seconds';
    END IF;
    RETURN QUERY
      SELECT s.id, s.user_id, s.active_tenant_id,
             GREATEST(0, ceil(extract(epoch FROM (LEAST(s.idle_expires_at, s.absolute_expires_at) - now()))))::integer,
             GREATEST(0, ceil(extract(epoch FROM (s.absolute_expires_at - now()))))::integer
        FROM public.sessions s WHERE s.id = v_id;
  END
  $$;

REVOKE ALL ON FUNCTION auth_session_lookup(bytea, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_session_lookup(bytea, boolean) TO zestia_app;
