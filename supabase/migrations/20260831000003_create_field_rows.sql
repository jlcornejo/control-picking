-- ============================================================
-- MELGAS: tercer nivel de la jerarquía física del campo
-- ============================================================
-- Jerarquía: fields (campo) -> blocks (cuartel/paño) -> field_rows (melga).
-- La "melga" es la hilera/faja de plantación por donde el trabajador cosecha.
-- En código se usa el término agtech estándar `row` (tabla `field_rows` para
-- evitar la palabra reservada SQL `rows`); en la UI se muestra como "Melga".
--
-- Nivel OPCIONAL y configurable por cliente:
--   organizations.rows_enabled  -> default del tenant.
--   fields.rows_enabled         -> override por campo (NULL = hereda de la org).
-- Mecánica idéntica a crew_mode_enabled.
--
-- La melga NO tiene producto ni tarifa propios: los hereda del block. Por eso
-- solo lleva identificación (name, row_number) y estado.
-- ============================================================

-- Default de uso de melgas para la organización (mismo patrón que crew_mode_enabled)
ALTER TABLE organizations ADD COLUMN rows_enabled BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN organizations.rows_enabled IS 'Default de uso de Melgas (field_rows); cada campo puede sobreescribirlo.';

-- Override de uso de melgas por campo (NULL = hereda de organizations.rows_enabled)
ALTER TABLE fields ADD COLUMN rows_enabled BOOLEAN;
COMMENT ON COLUMN fields.rows_enabled IS 'Override del uso de Melgas para este campo. NULL hereda el default de la organización.';

-- Tabla de melgas (field_rows)
CREATE TABLE field_rows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  block_id         UUID NOT NULL REFERENCES blocks(id) ON DELETE RESTRICT,
  name             VARCHAR(100) NOT NULL,          -- ej. "Melga 1", "Hilera 12-A"
  row_number       INTEGER CHECK (row_number IS NULL OR row_number > 0),  -- orden en terreno (opcional)
  status           entity_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices (FKs y filtros comunes)
CREATE INDEX idx_field_rows_block_id ON field_rows (block_id);
CREATE INDEX idx_field_rows_organization ON field_rows (organization_id);
CREATE INDEX idx_field_rows_status ON field_rows (status);

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER trg_field_rows_updated_at
  BEFORE UPDATE ON field_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger multi-tenant: autocompleta organization_id desde el claim org_id del JWT
CREATE TRIGGER trg_set_org_id_field_rows
  BEFORE INSERT ON field_rows
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_id();

COMMENT ON TABLE field_rows IS 'Melga/hilera - subdivisión de un block (cuartel/paño). Nivel opcional (rows_enabled). Hereda producto y tarifa del block.';
COMMENT ON COLUMN field_rows.block_id IS 'Block (cuartel/paño) al que pertenece la melga.';
COMMENT ON COLUMN field_rows.row_number IS 'Número de melga/hilera para ordenar y ubicar en terreno. Opcional.';
