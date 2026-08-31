-- ============================================================
-- FASE 3b (RLS): el Encargado registra y corrige el picking de su cuadrilla
-- ============================================================
-- Hasta ahora el crew_lead solo tenía SELECT sobre picking_records
-- (crew_lead_read_crew_picking). Pero la app móvil muestra al Encargado la
-- pantalla de Registro y de corrección, por lo que necesita INSERT y UPDATE
-- acotados a los trabajadores de SU cuadrilla:
--   - INSERT: registrar producción de un trabajador de su cuadrilla (recorded_by = él).
--   - UPDATE: corregir un registro de su cuadrilla dentro de la misma jornada
--     (soft-update: se edita el original y se conserva un snapshot de auditoría;
--      el snapshot lo inserta la política de INSERT).
-- El aislamiento de tenant y la pertenencia a la cuadrilla se validan en la política.
-- ============================================================

-- INSERT: producción/correcciones de los trabajadores de su cuadrilla
CREATE POLICY "crew_lead_insert_picking" ON picking_records
  FOR INSERT WITH CHECK (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND recorded_by = current_worker_id()
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  );

-- UPDATE: corregir (in-place) un registro de su cuadrilla, solo en la jornada actual
CREATE POLICY "crew_lead_update_picking" ON picking_records
  FOR UPDATE USING (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND work_day = CURRENT_DATE
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  );
