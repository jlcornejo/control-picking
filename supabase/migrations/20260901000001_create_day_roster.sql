-- ============================================================
-- ROSTER DIARIO (day_roster): equipo de trabajo por jornada
-- ============================================================
-- En terreno un responsable (Encargado/crew_lead o Supervisor cuando no hay
-- Encargado) arma CADA JORNADA su equipo del día. Un trabajador puede ir hoy
-- con un responsable y mañana con otro, sin reescribir la historia.
--
-- Decisiones de negocio que este esquema materializa:
--   1) Cuadrilla base: workers.crew_id se conserva SOLO como referencia
--      ("su gente habitual") para pre-cargar el listado al armar el roster.
--      Ya NO es la fuente de verdad de "con quién trabajó" el trabajador.
--   2) Un solo responsable por trabajador por día: UNIQUE(org, work_day, worker_id).
--   3) El responsable del día (lead_id) puede ser crew_lead O supervisor.
--      crew_id es OPCIONAL: se llena si el responsable es un Encargado de
--      cuadrilla; queda NULL cuando el trabajador depende directo del Supervisor.
--   4) Roster manual, aprobado cada jornada: no hay pre-carga automática; cada
--      día parte vacío y el responsable agrega a propósito a su equipo.
--
-- La atribución histórica se congela en picking_records.day_roster_id (abajo):
-- así, aunque el trabajador cambie de equipo o se borre el roster, la
-- producción de esa jornada sigue apuntando al responsable correcto.
-- ============================================================

-- ------------------------------------------------------------
-- Tabla: day_roster
-- ------------------------------------------------------------
CREATE TABLE day_roster (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  work_day         DATE NOT NULL,                                            -- jornada (zona del tenant)
  worker_id        UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,   -- trabajador del equipo del día
  lead_id          UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,  -- responsable del día (crew_lead o supervisor)
  crew_id          UUID,                                                     -- cuadrilla (si el responsable es Encargado). NULL si es supervisor directo
  added_by         UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,  -- quién agregó al trabajador al roster
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un trabajador tiene un solo responsable por día (regla de negocio 2)
  CONSTRAINT uq_day_roster_worker_day UNIQUE (organization_id, work_day, worker_id)
);

-- Índices para las consultas frecuentes
CREATE INDEX idx_day_roster_organization ON day_roster (organization_id);
CREATE INDEX idx_day_roster_lead_day ON day_roster (lead_id, work_day);
CREATE INDEX idx_day_roster_worker_day ON day_roster (worker_id, work_day);
CREATE INDEX idx_day_roster_crew_day ON day_roster (crew_id, work_day) WHERE crew_id IS NOT NULL;

-- Clave única compuesta: destino de la FK compuesta desde picking_records.day_roster_id
ALTER TABLE day_roster ADD CONSTRAINT uq_day_roster_id_org UNIQUE (id, organization_id);

-- ------------------------------------------------------------
-- Integridad de tenant (FKs compuestas): todo debe ser de la misma organización
-- ------------------------------------------------------------
ALTER TABLE day_roster ADD CONSTRAINT fk_day_roster_worker_org
  FOREIGN KEY (worker_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE CASCADE;

ALTER TABLE day_roster ADD CONSTRAINT fk_day_roster_lead_org
  FOREIGN KEY (lead_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE day_roster ADD CONSTRAINT fk_day_roster_added_by_org
  FOREIGN KEY (added_by, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE day_roster ADD CONSTRAINT fk_day_roster_crew_org
  FOREIGN KEY (crew_id, organization_id) REFERENCES crews (id, organization_id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Autocompletar organization_id desde el JWT (mismo patrón que las demás tablas)
-- ------------------------------------------------------------
CREATE TRIGGER trg_set_org_id_day_roster
  BEFORE INSERT ON day_roster
  FOR EACH ROW EXECUTE FUNCTION set_organization_id();

-- ------------------------------------------------------------
-- Respaldo de work_day en la zona del tenant (nunca UTC), como picking_records
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_day_roster_work_day()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.work_day IS NULL THEN
    NEW.work_day := public.org_workday(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.set_day_roster_work_day IS
  'Respaldo: fija day_roster.work_day en la zona del tenant si el INSERT no lo especifica.';

-- El trigger corre DESPUÉS del de organization_id (orden alfabético de nombres:
-- trg_set_org_id_day_roster < trg_set_work_day_day_roster) para que
-- organization_id ya esté disponible al calcular la zona.
CREATE TRIGGER trg_set_work_day_day_roster
  BEFORE INSERT ON day_roster
  FOR EACH ROW EXECUTE FUNCTION set_day_roster_work_day();

-- ------------------------------------------------------------
-- Comentarios
-- ------------------------------------------------------------
COMMENT ON TABLE day_roster IS 'Equipo de trabajo por jornada: qué trabajadores están a cargo de qué responsable (Encargado o Supervisor) en un work_day. Fuente de verdad operativa por día; workers.crew_id es solo la cuadrilla base de referencia.';
COMMENT ON COLUMN day_roster.work_day IS 'Jornada (fecha) del equipo, en la zona horaria del tenant.';
COMMENT ON COLUMN day_roster.lead_id IS 'Responsable del día: worker con rol crew_lead (Encargado) o supervisor cuando no hay Encargado.';
COMMENT ON COLUMN day_roster.crew_id IS 'Cuadrilla asociada cuando el responsable es un Encargado. NULL si el trabajador depende directo del Supervisor.';
COMMENT ON COLUMN day_roster.added_by IS 'Worker (responsable o supervisor) que agregó al trabajador al roster del día.';
COMMENT ON CONSTRAINT uq_day_roster_worker_day ON day_roster IS 'Un trabajador tiene un único responsable por jornada (evita doble atribución de producción).';

-- ============================================================
-- picking_records.day_roster_id: congela la atribución del día
-- ============================================================
-- Al registrar producción se guarda el roster de esa jornada. Es un snapshot
-- inmutable de "bajo qué responsable/equipo se cosechó", análogo a
-- rate_amount_snapshot. Nullable para no romper registros previos ni flujos sin
-- roster (p.ej. organizaciones sin Modo Capataz que registran vía supervisor).
ALTER TABLE picking_records ADD COLUMN day_roster_id UUID;

-- FK compuesta de tenant: el roster referenciado debe ser de la misma organización.
-- ON DELETE RESTRICT: no se puede borrar un roster con producción asociada
-- (protege la trazabilidad histórica).
ALTER TABLE picking_records ADD CONSTRAINT fk_picking_day_roster_org
  FOREIGN KEY (day_roster_id, organization_id) REFERENCES day_roster (id, organization_id) ON DELETE RESTRICT;

-- Índice parcial: solo indexa registros que sí tienen roster.
CREATE INDEX idx_picking_records_day_roster ON picking_records (day_roster_id) WHERE day_roster_id IS NOT NULL;

COMMENT ON COLUMN picking_records.day_roster_id IS 'Roster del día (day_roster) bajo el cual se registró la producción. Congela la atribución trabajador-responsable de esa jornada. NULL para registros sin roster.';
COMMENT ON CONSTRAINT fk_picking_day_roster_org ON picking_records IS 'Garantiza que el picking_record y su roster del día pertenecen a la misma organización.';
