-- ============================================================
-- FASE 2: Cuadrillas (crews) y Modo Capataz opcional
-- ============================================================
-- crews: grupo de trabajadores gestionado por un Encargado (crew_lead).
-- Existe solo cuando el Modo Capataz está activo para el contexto.
-- workers.crew_id: pertenencia opcional de un trabajador a una cuadrilla.
-- fields.crew_mode_enabled: override del default de la organización.
--   organizations.crew_mode_enabled ya existe (migración de organizations).
-- ============================================================

-- Tabla de cuadrillas
CREATE TABLE crews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  crew_lead_id     UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,  -- worker con rol crew_lead
  name             VARCHAR(120) NOT NULL,   -- ej. "Furgón 3"
  status           entity_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crews_organization ON crews (organization_id);
CREATE INDEX idx_crews_lead ON crews (crew_lead_id);

-- Clave única compuesta para la FK de integridad de tenant desde workers.crew_id
ALTER TABLE crews ADD CONSTRAINT uq_crews_id_org UNIQUE (id, organization_id);

-- Integridad de tenant: el crew_lead debe pertenecer a la misma organización
ALTER TABLE crews ADD CONSTRAINT fk_crews_lead_org
  FOREIGN KEY (crew_lead_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

CREATE TRIGGER trg_crews_updated_at
  BEFORE UPDATE ON crews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE crews IS 'Cuadrilla de trabajadores gestionada por un Encargado (crew_lead). Solo con Modo Capataz activo.';
COMMENT ON COLUMN crews.crew_lead_id IS 'Worker con rol crew_lead responsable de la cuadrilla.';

-- Pertenencia de un trabajador a una cuadrilla (opcional)
ALTER TABLE workers ADD COLUMN crew_id UUID;
CREATE INDEX idx_workers_crew ON workers (crew_id);
-- FK compuesta: la cuadrilla debe ser de la misma organización que el worker
ALTER TABLE workers ADD CONSTRAINT fk_workers_crew_org
  FOREIGN KEY (crew_id, organization_id) REFERENCES crews (id, organization_id) ON DELETE SET NULL;

COMMENT ON COLUMN workers.crew_id IS 'Cuadrilla a la que pertenece el trabajador (Modo Capataz). NULL si no aplica.';

-- Override de Modo Capataz por campo (NULL = hereda de organizations.crew_mode_enabled)
ALTER TABLE fields ADD COLUMN crew_mode_enabled BOOLEAN;

COMMENT ON COLUMN fields.crew_mode_enabled IS 'Override del Modo Capataz para este campo. NULL hereda el default de la organización.';
