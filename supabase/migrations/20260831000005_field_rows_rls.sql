-- ============================================================
-- MELGAS: Row Level Security para field_rows
-- ============================================================
-- Espeja el modelo de acceso de blocks (estado final en multitenant_rls):
--   admin        -> control total dentro de su organización.
--   supervisor   -> lee melgas de los blocks que tiene asignados.
--   worker       -> lee melgas donde tiene producción registrada.
-- platform_admin siempre pasa (bypass de tenant).
-- ============================================================

ALTER TABLE field_rows ENABLE ROW LEVEL SECURITY;

-- Admin: control total sobre las melgas de SU organización
CREATE POLICY "admin_all_field_rows" ON field_rows
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

-- Supervisor: lee melgas activas de los blocks que tiene asignados
CREATE POLICY "supervisor_read_assigned_field_rows" ON field_rows
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND status = 'active'
      AND organization_id = current_org_id()
      AND block_id IN (
        SELECT block_id FROM supervisor_assignments
        WHERE supervisor_id = current_worker_id()
        AND block_id IS NOT NULL
      )
    )
  );

-- Worker: lee melgas donde tiene producción registrada
CREATE POLICY "worker_read_field_rows_with_records" ON field_rows
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_worker()
      AND organization_id = current_org_id()
      AND id IN (
        SELECT DISTINCT row_id FROM picking_records
        WHERE worker_id = current_worker_id() AND row_id IS NOT NULL
      )
    )
  );

-- Crew lead: lee melgas activas de su organización (para registrar producción de su cuadrilla)
CREATE POLICY "crew_lead_read_field_rows" ON field_rows
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND status = 'active'
      AND organization_id = current_org_id()
    )
  );
