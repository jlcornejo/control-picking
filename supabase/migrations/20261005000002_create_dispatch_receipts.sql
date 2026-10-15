-- ============================================================
-- RECEPCIÓN DE DESPACHO (lo que el cliente/planta confirma recibir)
-- ============================================================
-- Tabla SEPARADA (no columnas embebidas) para habilitar 1:N a futuro.
-- Hoy 1:1 por índice único UNIQUE (guide_id); para abrir recepciones
-- parciales basta eliminar ese índice en una migración futura.
--
-- Reversibilidad (documentada; sin `down` automático; correr ANTES del down de
-- dispatch_guides):
--   DROP TABLE dispatch_receipts CASCADE;
-- ============================================================

CREATE TABLE dispatch_receipts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  guide_id           UUID NOT NULL,

  received_trays     NUMERIC(12, 2) NOT NULL CHECK (received_trays >= 0),
  received_weight_kg NUMERIC(12, 3) NOT NULL CHECK (received_weight_kg >= 0),
  received_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes              VARCHAR(500),

  recorded_by        UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_dispatch_receipts_id_org UNIQUE (id, organization_id)
);

-- 1:1 HOY: una recepción por guía. Para 1:N futuro -> DROP este índice.
CREATE UNIQUE INDEX uq_dispatch_receipt_one_per_guide
  ON dispatch_receipts (guide_id);

-- FKs compuestas de tenant
ALTER TABLE dispatch_receipts ADD CONSTRAINT fk_receipt_guide_org
  FOREIGN KEY (guide_id, organization_id) REFERENCES dispatch_guides (id, organization_id) ON DELETE CASCADE;
ALTER TABLE dispatch_receipts ADD CONSTRAINT fk_receipt_recorded_by_org
  FOREIGN KEY (recorded_by, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX idx_dispatch_receipts_organization ON dispatch_receipts (organization_id);
CREATE INDEX idx_dispatch_receipts_guide_id ON dispatch_receipts (guide_id);

CREATE TRIGGER trg_dispatch_receipts_updated_at
  BEFORE UPDATE ON dispatch_receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_dispatch_receipts
  BEFORE INSERT ON dispatch_receipts
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

-- RLS (mismo patrón de roles que dispatch_guides)
ALTER TABLE dispatch_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_dispatch_receipts" ON dispatch_receipts
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

CREATE POLICY "supervisor_manage_dispatch_receipts" ON dispatch_receipts
  FOR ALL USING (
    is_platform_admin()
    OR (is_supervisor() AND organization_id = current_org_id())
  );

CREATE POLICY "member_read_dispatch_receipts" ON dispatch_receipts
  FOR SELECT USING (
    is_platform_admin()
    OR ((is_crew_lead() OR is_worker()) AND organization_id = current_org_id())
  );

COMMENT ON TABLE dispatch_receipts IS 'Recepción confirmada por el cliente/planta para una guía (bandejas+peso recibidos). Tabla separada 1:N-ready; hoy 1:1 por índice único uq_dispatch_receipt_one_per_guide.';
COMMENT ON INDEX uq_dispatch_receipt_one_per_guide IS 'Restringe a una recepción por guía (1:1). Eliminar este índice habilita recepciones parciales 1:N.';
