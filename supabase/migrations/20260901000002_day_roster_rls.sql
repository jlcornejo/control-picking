-- ============================================================
-- RLS del ROSTER DIARIO (day_roster) y atribución por jornada
-- ============================================================
-- Modelo: el equipo del día vive en day_roster. La producción congela el
-- day_roster bajo el que se registró (picking_records.day_roster_id). Por eso:
--
--   - LECTURA de producción por un responsable (Encargado o Supervisor): ve un
--     picking_record si su day_roster_id apunta a un roster donde ÉL es el
--     lead_id. Esto abarca CUALQUIER jornada en que trabajó con ese trabajador,
--     y NO expone la producción de días en que el trabajador fue de otro lead.
--   - ESCRITURA del roster (agregar/quitar) y del picking (insertar/corregir):
--     acotada a la jornada actual del tenant (current_org_workday()).
--
-- Se conserva el bypass de platform admin, el aislamiento de tenant
-- (organization_id = current_org_id()) y las políticas de admin/worker.
-- Las políticas del Encargado basadas en crew_id (current_crew_id) se
-- REEMPLAZAN por las basadas en day_roster.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: ¿el trabajador X está en MI roster de HOY? (para escritura)
-- ------------------------------------------------------------
-- True si existe una fila de day_roster para hoy (zona tenant) donde el
-- responsable soy yo y el trabajador es p_worker_id. Se usa en las políticas de
-- INSERT/UPDATE de picking, que solo aplican a la jornada actual.
CREATE OR REPLACE FUNCTION public.worker_in_my_roster_today(p_worker_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.day_roster dr
    WHERE dr.worker_id = p_worker_id
      AND dr.lead_id = public.current_worker_id()
      AND dr.work_day = public.current_org_workday()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.worker_in_my_roster_today IS
  'True si el trabajador está en el roster de HOY (zona tenant) bajo el responsable autenticado. Usada por RLS de escritura de picking.';

-- ============================================================
-- RLS: day_roster
-- ============================================================
ALTER TABLE day_roster ENABLE ROW LEVEL SECURITY;

-- Admin: CRUD del roster de su organización
CREATE POLICY "admin_all_day_roster" ON day_roster
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

-- Responsable (Encargado o Supervisor): lee las filas de roster donde él es lead.
-- Cubre historial completo (cualquier work_day) de sus propios equipos.
CREATE POLICY "lead_read_own_day_roster" ON day_roster
  FOR SELECT USING (
    is_platform_admin()
    OR (
      (is_crew_lead() OR is_supervisor())
      AND organization_id = current_org_id()
      AND lead_id = current_worker_id()
    )
  );

-- Responsable: arma su equipo de HOY (agrega trabajadores). Solo jornada actual,
-- él como lead y como autor del alta.
CREATE POLICY "lead_insert_day_roster" ON day_roster
  FOR INSERT WITH CHECK (
    (is_crew_lead() OR is_supervisor())
    AND organization_id = current_org_id()
    AND lead_id = current_worker_id()
    AND added_by = current_worker_id()
    AND work_day = current_org_workday()
  );

-- Responsable: ajusta su equipo de HOY (quita trabajadores). Solo jornada actual.
CREATE POLICY "lead_delete_day_roster" ON day_roster
  FOR DELETE USING (
    (is_crew_lead() OR is_supervisor())
    AND organization_id = current_org_id()
    AND lead_id = current_worker_id()
    AND work_day = current_org_workday()
  );

-- Trabajador: puede leer las filas donde él aparece (saber con quién trabajó).
CREATE POLICY "worker_read_own_day_roster" ON day_roster
  FOR SELECT USING (
    is_worker()
    AND organization_id = current_org_id()
    AND worker_id = current_worker_id()
  );

-- ============================================================
-- RLS: workers — el Encargado lee a los miembros de SU roster (cualquier día)
-- ============================================================
-- Reemplaza crew_lead_read_crew_workers (que resolvía por crew_id actual) por la
-- pertenencia vía day_roster: el Encargado ve a un trabajador si alguna vez
-- estuvo en uno de sus rosters. Así conserva visibilidad histórica de su gente
-- sin depender de la cuadrilla base.
DROP POLICY IF EXISTS "crew_lead_read_crew_workers" ON workers;
CREATE POLICY "crew_lead_read_roster_workers" ON workers
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND (
        id = current_worker_id()
        OR id IN (SELECT worker_id FROM day_roster WHERE lead_id = current_worker_id())
      )
    )
  );

-- El Supervisor ya lee a sus trabajadores vía supervisor_assignments
-- (supervisor_read_assigned_workers, migración base). Además, para el caso "sin
-- Encargado" en que el Supervisor arma roster directo, puede leer a quienes
-- estén (o hayan estado) en alguno de sus rosters.
CREATE POLICY "supervisor_read_roster_workers" ON workers
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND id IN (SELECT worker_id FROM day_roster WHERE lead_id = current_worker_id())
    )
  );

-- ============================================================
-- RLS: picking_records — lectura por atribución congelada (day_roster_id)
-- ============================================================
-- Encargado: reemplaza crew_lead_read_crew_picking (crew_id) por el roster
-- congelado. Ve un registro si su day_roster_id apunta a un roster donde él es
-- el lead. Cubre todo su historial y aísla la producción de otros responsables.
DROP POLICY IF EXISTS "crew_lead_read_crew_picking" ON picking_records;
CREATE POLICY "crew_lead_read_roster_picking" ON picking_records
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND day_roster_id IN (SELECT id FROM day_roster WHERE lead_id = current_worker_id())
    )
  );

-- Encargado: INSERT de producción de un trabajador de su roster de HOY.
-- Reemplaza crew_lead_insert_picking (crew_id) por worker_in_my_roster_today.
DROP POLICY IF EXISTS "crew_lead_insert_picking" ON picking_records;
CREATE POLICY "crew_lead_insert_picking" ON picking_records
  FOR INSERT WITH CHECK (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND recorded_by = current_worker_id()
    AND worker_in_my_roster_today(worker_id)
  );

-- Encargado: UPDATE (corrección in-place) solo en la jornada actual, para
-- trabajadores de su roster de hoy. Reemplaza crew_lead_update_picking.
DROP POLICY IF EXISTS "crew_lead_update_picking" ON picking_records;
CREATE POLICY "crew_lead_update_picking" ON picking_records
  FOR UPDATE USING (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND work_day = current_org_workday()
    AND worker_in_my_roster_today(worker_id)
  );

-- ------------------------------------------------------------
-- Supervisor sobre picking: además de sus workers asignados
-- (supervisor_assignments), puede leer/registrar/corregir la producción del
-- equipo que arma él mismo por día (caso sin Encargado), vía day_roster.
-- Estas políticas se SUMAN a las existentes basadas en supervisor_assignments.
-- ------------------------------------------------------------
CREATE POLICY "supervisor_read_roster_picking" ON picking_records
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND day_roster_id IN (SELECT id FROM day_roster WHERE lead_id = current_worker_id())
    )
  );

CREATE POLICY "supervisor_insert_roster_picking" ON picking_records
  FOR INSERT WITH CHECK (
    is_supervisor()
    AND organization_id = current_org_id()
    AND recorded_by = current_worker_id()
    AND worker_in_my_roster_today(worker_id)
  );

CREATE POLICY "supervisor_update_roster_picking" ON picking_records
  FOR UPDATE USING (
    is_supervisor()
    AND organization_id = current_org_id()
    AND work_day = current_org_workday()
    AND worker_in_my_roster_today(worker_id)
  );

-- ------------------------------------------------------------
-- Grants explícitos (coherentes con grants.sql). Las default privileges ya
-- cubren tablas futuras, pero se dejan explícitos para claridad.
-- ------------------------------------------------------------
GRANT ALL ON public.day_roster TO authenticated, service_role;
GRANT SELECT ON public.day_roster TO anon;
