-- ============================================================
-- DESTARE (TARA) + TIPOS DE CAJA + CONTROL DE TOLERANCIA DE PESO
-- ============================================================
-- Feature KAN-6. Permite configurar tipos de caja/envase por organización,
-- cada uno con su destare (tara a restar del peso bruto), un peso neto objetivo
-- y una banda de tolerancia (superior e inferior). Al registrar picking se puede
-- capturar el peso bruto de la caja; el sistema calcula el neto (bruto - tara) y
-- marca si quedó fuera de tolerancia para alertar (control de merma) y auditar.
--
-- Decisiones de negocio:
--   - Aplica a productos con unit_measure = 'box' (configurable vía feature flag).
--   - El PAGO NO cambia: sigue siendo por `quantity` (cantidad de cajas). El peso
--     es control de calidad/merma + auditoría, no altera tarifas ni liquidaciones.
--   - La alerta es NO bloqueante: el registro se guarda igual; `out_of_tolerance`
--     queda persistido para auditoría.
--   - Gating: la funcionalidad se activa por organización con el feature flag
--     `box_tare_control`.
-- ============================================================

-- ------------------------------------------------------------
-- Unidad en que se expresa la tolerancia de una caja
-- ------------------------------------------------------------
CREATE TYPE tolerance_unit AS ENUM ('percent', 'kg');

-- ============================================================
-- box_types: catálogo de tipos de caja/envase por organización
-- ============================================================
CREATE TABLE box_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name                  VARCHAR(100) NOT NULL,                 -- ej. "Bandeja 10 kg"
  tare_weight_kg        NUMERIC(10, 3) NOT NULL CHECK (tare_weight_kg >= 0),   -- destare a restar del bruto
  target_net_weight_kg  NUMERIC(10, 3) NOT NULL CHECK (target_net_weight_kg > 0), -- peso neto objetivo de fruta
  tolerance_over        NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (tolerance_over >= 0),  -- límite superior
  tolerance_under       NUMERIC(10, 3) NOT NULL DEFAULT 0 CHECK (tolerance_under >= 0), -- límite inferior
  tolerance_unit        tolerance_unit NOT NULL DEFAULT 'percent',
  status                entity_status NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Requisito para la FK compuesta de integridad de tenant desde picking_records.
  CONSTRAINT uq_box_types_id_org UNIQUE (id, organization_id)
);

-- Índices (FKs y filtros comunes)
CREATE INDEX idx_box_types_organization ON box_types (organization_id);
CREATE INDEX idx_box_types_status ON box_types (status);

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER trg_box_types_updated_at
  BEFORE UPDATE ON box_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger multi-tenant: autocompleta organization_id desde el claim org_id del JWT
CREATE TRIGGER trg_set_org_id_box_types
  BEFORE INSERT ON box_types
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_id();

COMMENT ON TABLE box_types IS 'Tipos de caja/envase por organización, con destare (tara), peso neto objetivo y banda de tolerancia. Base del control de merma al pesar la cosecha.';
COMMENT ON COLUMN box_types.tare_weight_kg IS 'Peso propio del envase (kg) que se resta del peso bruto para obtener el neto.';
COMMENT ON COLUMN box_types.target_net_weight_kg IS 'Peso neto objetivo de fruta por caja (kg).';
COMMENT ON COLUMN box_types.tolerance_over IS 'Tolerancia superior permitida antes de alertar sobrellenado. En % o kg según tolerance_unit.';
COMMENT ON COLUMN box_types.tolerance_under IS 'Tolerancia inferior permitida antes de alertar caja incompleta. En % o kg según tolerance_unit.';
COMMENT ON COLUMN box_types.tolerance_unit IS 'Unidad de las tolerancias: percent (% del objetivo) o kg (valor absoluto).';

-- ============================================================
-- box_types: Row Level Security
-- ============================================================
-- Espeja el modelo de acceso de field_rows/blocks:
--   admin       -> control total dentro de su organización.
--   supervisor  -> lee cajas activas de su organización (para registrar).
--   crew_lead   -> lee cajas activas de su organización (para registrar).
--   worker      -> lee cajas activas de su organización (referencia).
-- platform_admin siempre pasa (bypass de tenant).
ALTER TABLE box_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_box_types" ON box_types
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

CREATE POLICY "member_read_active_box_types" ON box_types
  FOR SELECT USING (
    is_platform_admin()
    OR (
      (is_supervisor() OR is_crew_lead() OR is_worker())
      AND status = 'active'
      AND organization_id = current_org_id()
    )
  );

-- ============================================================
-- picking_records: enlace con box_type y snapshot del pesaje
-- ============================================================
-- box_type_id OPCIONAL: solo se completa cuando el tenant usa el control de
-- destare y el producto es por caja. El registro SIEMPRE conserva block_id y
-- quantity (el pago no cambia). Los pesos son un snapshot inmutable de auditoría.
ALTER TABLE picking_records ADD COLUMN box_type_id UUID;
ALTER TABLE picking_records ADD COLUMN gross_weight_kg NUMERIC(10, 3) CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0);
ALTER TABLE picking_records ADD COLUMN tare_snapshot_kg NUMERIC(10, 3) CHECK (tare_snapshot_kg IS NULL OR tare_snapshot_kg >= 0);
ALTER TABLE picking_records ADD COLUMN net_weight_kg NUMERIC(10, 3) CHECK (net_weight_kg IS NULL OR net_weight_kg >= 0);
ALTER TABLE picking_records ADD COLUMN out_of_tolerance BOOLEAN NOT NULL DEFAULT false;

-- FK compuesta: la caja referenciada debe ser de la misma organización.
ALTER TABLE picking_records ADD CONSTRAINT fk_picking_box_type_org
  FOREIGN KEY (box_type_id, organization_id) REFERENCES box_types (id, organization_id) ON DELETE RESTRICT;

-- Índice parcial: solo indexa registros que sí llevan tipo de caja.
CREATE INDEX idx_picking_records_box_type_id ON picking_records (box_type_id) WHERE box_type_id IS NOT NULL;

-- Índice parcial para reportes de merma: registros fuera de tolerancia.
CREATE INDEX idx_picking_records_out_of_tolerance ON picking_records (organization_id, work_day) WHERE out_of_tolerance;

COMMENT ON COLUMN picking_records.box_type_id IS 'Tipo de caja usada (box_types). NULL si el tenant/producto no usa control de destare. Debe pertenecer al mismo tenant.';
COMMENT ON COLUMN picking_records.gross_weight_kg IS 'Peso bruto pesado en balanza (kg), incluye la tara. Snapshot inmutable de auditoría.';
COMMENT ON COLUMN picking_records.tare_snapshot_kg IS 'Tara aplicada al momento del registro (kg), congelada desde box_types.tare_weight_kg.';
COMMENT ON COLUMN picking_records.net_weight_kg IS 'Peso neto = bruto - tara (kg). Snapshot inmutable de auditoría. No altera el pago (que es por quantity).';
COMMENT ON COLUMN picking_records.out_of_tolerance IS 'true si el peso neto quedó fuera de la banda de tolerancia de la caja al registrar. Alerta de merma, no bloqueante.';
COMMENT ON CONSTRAINT fk_picking_box_type_org ON picking_records IS 'Garantiza que el picking_record y su tipo de caja pertenecen a la misma organización.';

-- ============================================================
-- Feature flag: box_tare_control
-- ============================================================
-- Gating de la funcionalidad de destare/tolerancia. Default global apagado;
-- cada organización lo activa vía override (organization_feature_flags).
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('box_tare_control', 'Control de Destare y Tolerancia', 'Captura de peso bruto por caja, descuento de tara y alerta de merma cuando el peso neto queda fuera de la tolerancia configurada.', 'cosecha', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
