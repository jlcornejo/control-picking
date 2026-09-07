-- ============================================================
-- MELGAS: integridad de tenant y enlace con picking_records
-- ============================================================
-- 1) Clave única compuesta (id, organization_id) en field_rows, requisito
--    para las FKs compuestas de integridad de tenant.
-- 2) FK compuesta field_rows -> blocks: la melga y su block deben pertenecer
--    a la misma organización.
-- 3) picking_records.row_id (melga) OPCIONAL. Si viene, la melga debe ser de la
--    misma organización (FK compuesta). El registro SIEMPRE conserva block_id;
--    row_id es un refinamiento que no altera métricas ni liquidaciones por paño.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Clave única compuesta en field_rows (destino de FK compuesta)
-- ------------------------------------------------------------
ALTER TABLE field_rows ADD CONSTRAINT uq_field_rows_id_org UNIQUE (id, organization_id);

-- ------------------------------------------------------------
-- 2. field_rows -> blocks (misma organización)
--    Reemplaza la FK simple creada en la migración de field_rows.
-- ------------------------------------------------------------
ALTER TABLE field_rows DROP CONSTRAINT field_rows_block_id_fkey;
ALTER TABLE field_rows ADD CONSTRAINT fk_field_rows_block_org
  FOREIGN KEY (block_id, organization_id) REFERENCES blocks (id, organization_id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- 3. picking_records.row_id (melga opcional)
-- ------------------------------------------------------------
ALTER TABLE picking_records ADD COLUMN row_id UUID;

-- FK compuesta: la melga referenciada debe ser de la misma organización.
-- ON DELETE RESTRICT: no se puede borrar una melga con producción asociada.
ALTER TABLE picking_records ADD CONSTRAINT fk_picking_row_org
  FOREIGN KEY (row_id, organization_id) REFERENCES field_rows (id, organization_id) ON DELETE RESTRICT;

-- Índice parcial: solo indexa registros que sí tienen melga (la mayoría de
-- tenants no usan melgas, así el índice se mantiene pequeño).
CREATE INDEX idx_picking_records_row_id ON picking_records (row_id) WHERE row_id IS NOT NULL;

COMMENT ON COLUMN picking_records.row_id IS 'Melga (field_rows) opcional de donde salió la cosecha. NULL si el tenant/campo no usa melgas. Debe pertenecer al mismo block_id del registro.';
COMMENT ON CONSTRAINT fk_picking_row_org ON picking_records IS 'Garantiza que el picking_record y su melga pertenecen a la misma organización.';
COMMENT ON CONSTRAINT fk_field_rows_block_org ON field_rows IS 'Garantiza que la melga y su block pertenecen a la misma organización.';
