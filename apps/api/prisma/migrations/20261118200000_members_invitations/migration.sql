-- Usuarios del tenant e invitaciones (issue #18). Ver docs/SECURITY.md, "Usuarios e invitaciones".
--
-- * La membresía (usuario ↔ tenant) tiene estado propio: un Admin deshabilita a alguien en SU
--   empresa sin tocar la cuenta global (que puede pertenecer a otras empresas).
-- * Invitación = email + rol + token de un solo uso (solo se guarda su SHA-256) con vencimiento.
--   La persona invitada no tiene sesión en el tenant: la acepta a través de dos funciones
--   SECURITY DEFINER acotadas (mismo modelo que el reset de contraseña, #14).

-- memberships: estado ------------------------------------------------------------------------

CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TABLE memberships ADD COLUMN "status" "membership_status" NOT NULL DEFAULT 'ACTIVE';

-- Conteo de propietarios activos (no dejar al tenant sin propietario) y listados por rol.
CREATE INDEX memberships_tenant_id_role_status_idx ON memberships (tenant_id, role, status);

-- invitations --------------------------------------------------------------------------------

CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "membership_role" NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "invited_by" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invitations_email_normalized"
      CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
    CONSTRAINT "invitations_token_hash_sha256" CHECK (octet_length(token_hash) = 32),
    CONSTRAINT "invitations_single_outcome" CHECK (accepted_at IS NULL OR revoked_at IS NULL),
    CONSTRAINT "invitations_accepted_user"
      CHECK ((accepted_at IS NULL) = (accepted_user_id IS NULL))
);

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- Una sola invitación abierta (ni aceptada ni revocada) por email en cada tenant.
CREATE UNIQUE INDEX invitations_tenant_email_open_key
  ON invitations (tenant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX "invitations_tenant_id_created_at_idx" ON "invitations"("tenant_id", "created_at");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey"
  FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_fkey"
  FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El Admin lista, crea, reenvía (nuevo token) y revoca. Nunca DELETE: quedan como historial.
GRANT SELECT, INSERT, UPDATE ON TABLE invitations TO zestia_app;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_tenant_isolation ON invitations
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- Solo dentro de las funciones de abajo (zestia_app no puede asumir el rol del migrador).
CREATE POLICY invitations_auth_definer ON invitations
  FOR ALL TO zestia_migrator USING (true) WITH CHECK (true);

-- La aceptación crea la cuenta si no existe y lee el nombre y estado del tenant sin contexto.
CREATE POLICY users_auth_definer_insert ON users
  FOR INSERT TO zestia_migrator WITH CHECK (true);

CREATE POLICY tenants_auth_definer ON tenants
  FOR SELECT TO zestia_migrator USING (true);

-- Funciones ------------------------------------------------------------------------------------
-- Llave: el SHA-256 del token enviado por email (256 bits aleatorios). Mismas convenciones que
-- las de #14: search_path fijo, tablas calificadas, parámetros validados, sin SQL dinámico.

-- Invitación vigente por el hash de su token: abierta, sin vencer, de un tenant ACTIVE y de un
-- email cuya cuenta (si existe) está ACTIVE. `existing_user_id` es para la API (no se expone):
-- con cuenta, aceptar solo agrega la membresía; sin cuenta, la crea.
CREATE FUNCTION auth_invitation_peek(p_token_hash bytea)
  RETURNS TABLE (
    invitation_id uuid,
    tenant_id uuid,
    tenant_name text,
    email text,
    role membership_role,
    expires_at timestamptz,
    existing_user_id uuid
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  #variable_conflict use_column
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT i.id, i.tenant_id, t.name, i.email, i.role, i.expires_at::timestamptz, u.id
        FROM public.invitations i
        JOIN public.tenants t ON t.id = i.tenant_id
        LEFT JOIN public.users u ON u.email = i.email
       WHERE i.token_hash = p_token_hash
         AND i.accepted_at IS NULL
         AND i.revoked_at IS NULL
         AND i.expires_at > now()
         AND t.status = 'ACTIVE'
         AND (u.id IS NULL OR u.status = 'ACTIVE');
  END
  $$;

-- Acepta una invitación. Se llama DENTRO de la transacción del tenant de la invitación
-- (app.tenant_id fijado por la API desde `auth_invitation_peek`), así la auditoría va en la
-- misma transacción. Los ids los genera la API para poder auditar con el actor correcto.
--
--   ACCEPTED          membresía creada (y la cuenta, si no existía)
--   INVALID           token inexistente, usado, revocado, vencido, tenant o cuenta inactivos
--   DETAILS_REQUIRED  no hay cuenta y faltan nombre o contraseña
--   ALREADY_MEMBER    la cuenta ya tiene una membresía en este tenant
--   STALE             la cuenta apareció o cambió desde el peek (la API reintenta)
CREATE FUNCTION auth_invitation_accept(
  p_token_hash bytea,
  p_tenant_id uuid,
  p_user_id uuid,
  p_membership_id uuid,
  p_name text,
  p_password_hash text
) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
  AS $$
  DECLARE
    v_invitation uuid;
    v_email text;
    v_role membership_role;
    v_user uuid;
    v_user_status user_status;
  BEGIN
    IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32
       OR p_tenant_id IS NULL OR p_user_id IS NULL OR p_membership_id IS NULL THEN
      RAISE EXCEPTION 'auth_invitation_accept: parámetros inválidos' USING ERRCODE = '22023';
    END IF;
    IF p_tenant_id IS DISTINCT FROM app_current_tenant_id() THEN
      RAISE EXCEPTION 'auth_invitation_accept: fuera del contexto del tenant'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT i.id, i.email, i.role INTO v_invitation, v_email, v_role
      FROM public.invitations i
      JOIN public.tenants t ON t.id = i.tenant_id
     WHERE i.token_hash = p_token_hash
       AND i.tenant_id = p_tenant_id
       AND i.accepted_at IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > now()
       AND t.status = 'ACTIVE'
     FOR UPDATE OF i;
    IF v_invitation IS NULL THEN
      RETURN 'INVALID';
    END IF;

    SELECT u.id, u.status INTO v_user, v_user_status FROM public.users u WHERE u.email = v_email;
    IF v_user IS NOT NULL THEN
      IF v_user_status <> 'ACTIVE' THEN
        RETURN 'INVALID';
      END IF;
      IF v_user <> p_user_id THEN
        RETURN 'STALE';
      END IF;
    ELSE
      IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
         OR p_password_hash IS NULL OR p_password_hash NOT LIKE '$argon2id$%' THEN
        RETURN 'DETAILS_REQUIRED';
      END IF;
      INSERT INTO public.users (id, email, name)
        VALUES (p_user_id, v_email, btrim(p_name))
      ON CONFLICT (email) DO NOTHING;
      IF NOT FOUND THEN
        RETURN 'STALE';
      END IF;
      INSERT INTO public.user_credentials (user_id, password_hash)
        VALUES (p_user_id, p_password_hash);
      v_user := p_user_id;
    END IF;

    INSERT INTO public.memberships (id, tenant_id, user_id, role)
      VALUES (p_membership_id, p_tenant_id, v_user, v_role)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
    IF NOT FOUND THEN
      RETURN 'ALREADY_MEMBER';
    END IF;

    UPDATE public.invitations
       SET accepted_at = now(), accepted_user_id = v_user, updated_at = now()
     WHERE id = v_invitation;
    RETURN 'ACCEPTED';
  END
  $$;

REVOKE ALL ON FUNCTION
  auth_invitation_peek(bytea),
  auth_invitation_accept(bytea, uuid, uuid, uuid, text, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  auth_invitation_peek(bytea),
  auth_invitation_accept(bytea, uuid, uuid, uuid, text, text)
TO zestia_app;
