-- Auditoría transversal (issue #17): cambios antes/después y consulta por entidad.
--
-- `changes`: { "<campo>": { "from": <valor>, "to": <valor> } | { "redacted": true } }, solo los
-- campos que cambiaron. Los campos con datos personales se registran como `redacted` (se sabe
-- QUE cambió, no el valor). Lo arma `auditDiff()` en la API; NULL = evento sin cambios de datos.
ALTER TABLE audit_logs ADD COLUMN changes jsonb;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_changes_is_object
  CHECK (changes IS NULL OR jsonb_typeof(changes) = 'object');

-- Historial de una entidad dentro del tenant (vista de auditoría filtrada por entidad).
CREATE INDEX audit_logs_tenant_entity_idx
  ON audit_logs (tenant_id, entity_type, entity_id, occurred_at);

-- Consulta paginada de la vista: más recientes primero, cursor por id (UUID v7, ordenable).
CREATE INDEX audit_logs_tenant_id_desc_idx ON audit_logs (tenant_id, id DESC);
