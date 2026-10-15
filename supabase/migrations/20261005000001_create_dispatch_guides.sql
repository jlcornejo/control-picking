-- ============================================================
-- GUÍAS DE DESPACHO (logística: fruta que SALE del campo -> cliente)
-- ============================================================
-- Independiente del pago. Agrega picking_records (bandejas + peso) para
-- despachar, y permite comparar contra lo recibido (dispatch_receipts).
-- Gating: feature flag `dispatch_guides` (org_override, default off).
-- scope = 'block' (por paño/cuartel) | 'field' (cierre diario del campo).
--
-- Reversibilidad (documentada; sin `down` automático; correr DESPUÉS del down
-- de dispatch_receipts):
--   DROP TABLE dispatch_guides CASCADE;
-- ============================================================

CREATE TABLE dispatch_guides (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  scope              TEXT NOT NULL CHECK (scope IN ('block','field')),
  field_id           UUID NOT NULL,                 -- siempre presente (ambos scopes)
  block_id           UUID,                           -- solo scope='block'

  work_day           DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),

  guide_number       VARCHAR(60) NOT NULL,           -- número de guía (por tenant)

  -- Totales DESPACHADOS (auto-sugeridos desde picking, editables antes de cerrar)
  total_trays        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_trays >= 0),
  total_weight_kg    NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (total_weight_kg >= 0),

  -- Procedencia del peso
  weight_precise     BOOLEAN NOT NULL DEFAULT false, -- true = balanza (net_weight_kg); false = aproximado/manual
  weight_source      TEXT NOT NULL DEFAULT 'estimated'
                       CHECK (weight_source IN ('scale','estimated','mixed')),

  carrier            VARCHAR(150),                   -- transportista/furgón (opcional)
  notes              VARCHAR(500),

  closed_at          TIMESTAMPTZ,                    -- se setea al cerrar
  created_by         UUID NOT NULL,                  -- worker que creó la guía
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coherencia de scope <-> block_id
  CONSTRAINT chk_dispatch_scope_block CHECK (
    (scope = 'field' AND block_id IS NULL)
    OR (scope = 'block' AND block_id IS NOT NULL)
  ),
  -- Requisito para FKs compuestas de tenant que apunten a esta tabla a futuro
  CONSTRAINT uq_dispatch_guides_id_org UNIQUE (id, organization_id),
  -- Evitar duplicar número de guía dentro del tenant
  CONSTRAINT uq_dispatch_guide_number UNIQUE (organization_id, guide_number)
);

-- Índice único parcial: evita por error dos guías de cierre de campo del mismo
-- día (una sola mirada 'field' por campo/día). Las guías 'block' no se limitan
-- (puede haber varias por paño con distinto número).
CREATE UNIQUE INDEX uq_dispatch_field_day
  ON dispatch_guides (organization_id, field_id, work_day)
  WHERE scope = 'field';

-- FKs compuestas de tenant (mismo patrón que blocks/picking_records)
ALTER TABLE dispatch_guides ADD CONSTRAINT fk_dispatch_field_org
  FOREIGN KEY (field_id, organization_id) REFERENCES fields (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE dispatch_guides ADD CONSTRAINT fk_dispatch_block_org
  FOREIGN KEY (block_id, organization_id) REFERENCES blocks (id, organization_id) ON DELETE RESTRICT;
ALTER TABLE dispatch_guides ADD CONSTRAINT fk_dispatch_created_by_org
  FOREIGN KEY (created_by, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

-- Índices (FKs + filtros comunes)
CREATE INDEX idx_dispatch_guides_organization ON dispatch_guides (organization_id);
CREATE INDEX idx_dispatch_guides_field_id ON dispatch_guides (field_id);
CREATE INDEX idx_dispatch_guides_block_id ON dispatch_guides (block_id) WHERE block_id IS NOT NULL;
CREATE INDEX idx_dispatch_guides_org_workday ON dispatch_guides (organization_id, work_day);
CREATE INDEX idx_dispatch_guides_status ON dispatch_guides (status);

-- updated_at + organization_id triggers (patrón del proyecto)
CREATE TRIGGER trg_dispatch_guides_updated_at
  BEFORE UPDATE ON dispatch_guides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_dispatch_guides
  BEFORE INSERT ON dispatch_guides
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

-- Inmutabilidad de la guía cerrada (análogo a settlements pagadas):
-- con status='closed' el ÚNICO cambio permitido es una reapertura PURA
-- (closed -> open sin tocar contenido). Editar y reabrir en un mismo UPDATE
-- se rechaza: la API separa reopen (POST /:id/reopen) de edit (PUT /:id) y la
-- DB lo refuerza para preservar la auditabilidad del documento cerrado.
-- updated_at (lo setea el otro trigger) y closed_at (se pone NULL al reabrir)
-- están permitidos; todo lo demás debe quedar idéntico a OLD.
CREATE OR REPLACE FUNCTION prevent_closed_guide_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    IF NEW.status <> 'open'
       OR NEW.scope           IS DISTINCT FROM OLD.scope
       OR NEW.field_id        IS DISTINCT FROM OLD.field_id
       OR NEW.block_id        IS DISTINCT FROM OLD.block_id
       OR NEW.work_day         IS DISTINCT FROM OLD.work_day
       OR NEW.guide_number    IS DISTINCT FROM OLD.guide_number
       OR NEW.total_trays     IS DISTINCT FROM OLD.total_trays
       OR NEW.total_weight_kg IS DISTINCT FROM OLD.total_weight_kg
       OR NEW.weight_precise  IS DISTINCT FROM OLD.weight_precise
       OR NEW.weight_source   IS DISTINCT FROM OLD.weight_source
       OR NEW.carrier         IS DISTINCT FROM OLD.carrier
       OR NEW.notes           IS DISTINCT FROM OLD.notes
    THEN
      RAISE EXCEPTION 'Closed dispatch guide (id: %) can only be reopened, not edited; reopen first then edit', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dispatch_guides_immutable_when_closed
  BEFORE UPDATE ON dispatch_guides
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_guide_update();

-- ============================================================
-- RLS: patrón is_platform_admin() OR (<rol> AND organization_id = current_org_id())
-- ============================================================
ALTER TABLE dispatch_guides ENABLE ROW LEVEL SECURITY;

-- admin: control total dentro de su organización
CREATE POLICY "admin_all_dispatch_guides" ON dispatch_guides
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

-- supervisor: puede crear/gestionar guías de su organización (logística de terreno)
CREATE POLICY "supervisor_manage_dispatch_guides" ON dispatch_guides
  FOR ALL USING (
    is_platform_admin()
    OR (is_supervisor() AND organization_id = current_org_id())
  );

-- crew_lead / worker: solo lectura dentro de su organización (referencia)
CREATE POLICY "member_read_dispatch_guides" ON dispatch_guides
  FOR SELECT USING (
    is_platform_admin()
    OR ((is_crew_lead() OR is_worker()) AND organization_id = current_org_id())
  );

COMMENT ON TABLE dispatch_guides IS 'Guía de despacho (logística campo->cliente). Agrega picking_records (bandejas+peso) por paño o por campo/día. Independiente del pago. Gating: feature flag dispatch_guides.';
COMMENT ON COLUMN dispatch_guides.scope IS 'block = por paño/cuartel; field = cierre diario del campo entero.';
COMMENT ON COLUMN dispatch_guides.field_id IS 'Campo de la guía. Siempre presente (en scope block se deriva del block.field_id).';
COMMENT ON COLUMN dispatch_guides.block_id IS 'Paño de la guía. Solo scope=block; NULL en scope=field.';
COMMENT ON COLUMN dispatch_guides.weight_precise IS 'true = peso de balanza (SUM net_weight_kg); false = aproximado o editado a mano.';
COMMENT ON COLUMN dispatch_guides.weight_source IS 'scale (todo balanza), estimated (todo aproximado), mixed (parte balanza/parte estimado).';
