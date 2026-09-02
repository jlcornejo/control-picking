-- ============================================================
-- RLS: "solo la jornada actual" en la zona del tenant (no UTC)
-- ============================================================
-- Las políticas que permiten CORREGIR (UPDATE) un picking_record solo dentro
-- de la jornada actual usaban work_day = CURRENT_DATE, que se evalúa en UTC.
-- Eso rechaza correcciones legítimas de noche (hora local) y acepta las del
-- día equivocado tras la medianoche UTC. Se reemplaza por current_org_workday(),
-- que devuelve "hoy" en la zona horaria de la organización del usuario.
--
-- Redefine las políticas de UPDATE al mismo estado vigente pero cambiando la
-- comparación de fecha. No altera el resto de condiciones (rol, tenant, autoría).
-- ============================================================

-- Supervisor: corregir sus propios registros, solo en la jornada actual (tz tenant)
DROP POLICY IF EXISTS "supervisor_update_picking" ON picking_records;
CREATE POLICY "supervisor_update_picking" ON picking_records
  FOR UPDATE USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND recorded_by = current_worker_id()
      AND work_day = current_org_workday()
    )
  );

-- Encargado (crew_lead): corregir registros de su cuadrilla, solo jornada actual (tz tenant)
DROP POLICY IF EXISTS "crew_lead_update_picking" ON picking_records;
CREATE POLICY "crew_lead_update_picking" ON picking_records
  FOR UPDATE USING (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND work_day = current_org_workday()
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  );
