-- Comercios y sucursales (issue #19).

-- merchants: reglas de datos ------------------------------------------------------------------

-- Teléfono en E.164 (+ y 8 a 15 dígitos). La API normaliza lo que escribe la persona.
ALTER TABLE merchants
  ADD CONSTRAINT merchants_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');

-- RUC paraguayo: número y dígito verificador separados por guion (p. ej. 80012345-6).
ALTER TABLE merchants
  ADD CONSTRAINT merchants_ruc_format CHECK (ruc IS NULL OR ruc ~ '^[0-9]{1,8}-[0-9]$');

ALTER TABLE merchants
  ADD CONSTRAINT merchants_name_not_blank CHECK (length(btrim(name)) BETWEEN 1 AND 120);

-- Archivar = borrado lógico: `deleted_at` se fija exactamente cuando el estado es ARCHIVED.
ALTER TABLE merchants
  ADD CONSTRAINT merchants_archived_deleted_at
  CHECK ((status = 'ARCHIVED') = (deleted_at IS NOT NULL));

-- Sin dos comercios vigentes con el mismo nombre (sin distinguir mayúsculas) en un tenant.
CREATE UNIQUE INDEX merchants_tenant_name_active_key
  ON merchants (tenant_id, lower(name))
  WHERE deleted_at IS NULL;

-- Listado por nombre.
CREATE INDEX merchants_tenant_status_name_idx ON merchants (tenant_id, status, name, id);

-- merchant_branches ---------------------------------------------------------------------------

CREATE TABLE merchant_branches (
  id             uuid        NOT NULL DEFAULT app_uuid_v7(),
  tenant_id      uuid        NOT NULL,
  merchant_id    uuid        NOT NULL,
  name           text        NOT NULL,
  address        text        NOT NULL,
  neighborhood   text        NOT NULL,
  city           text        NOT NULL,
  "references"   text,
  phone          text,
  -- { "mon": [{ "from": "08:00", "to": "12:00" }, …], … }: lo valida la API (contratos Zod).
  opening_hours  jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz(3) NOT NULL DEFAULT now(),
  updated_at     timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at     timestamptz(3),

  CONSTRAINT merchant_branches_pkey PRIMARY KEY (id),
  -- FK compuesta: una sucursal nunca apunta a un comercio de otro tenant.
  CONSTRAINT merchant_branches_merchant_fkey FOREIGN KEY (tenant_id, merchant_id)
    REFERENCES merchants (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT merchant_branches_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT merchant_branches_phone_e164
    CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT merchant_branches_text_lengths CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
    AND length(btrim(address)) BETWEEN 1 AND 200
    AND length(btrim(neighborhood)) BETWEEN 1 AND 80
    AND length(btrim(city)) BETWEEN 1 AND 80
    AND ("references" IS NULL OR length("references") <= 300)
  ),
  CONSTRAINT merchant_branches_opening_hours_object
    CHECK (jsonb_typeof(opening_hours) = 'object')
);

CREATE UNIQUE INDEX merchant_branches_tenant_id_id_key ON merchant_branches (tenant_id, id);
CREATE INDEX merchant_branches_tenant_merchant_idx
  ON merchant_branches (tenant_id, merchant_id, name)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX merchant_branches_merchant_name_active_key
  ON merchant_branches (tenant_id, merchant_id, lower(name))
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON TABLE merchant_branches TO zestia_app;

ALTER TABLE merchant_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_branches FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_branches_tenant_isolation ON merchant_branches
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
