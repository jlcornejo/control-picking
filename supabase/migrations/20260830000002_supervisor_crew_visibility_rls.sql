-- ============================================================
-- FASE 3b (RLS): visibilidad del Supervisor sobre sus cuadrillas
-- ============================================================
-- Con la jerarquía admin>supervisor>encargado>trabajador, el Supervisor a cargo
-- de una cuadrilla (crews.supervisor_id = él) puede LEER:
--   - la liquidación de esa cuadrilla (settlements payee_type='crew')
--   - los pagos del campo al Encargado de esa cuadrilla (payments.crew_id)
-- Es solo lectura: el registro del pago al Encargado lo hace el Admin.
-- El pago del Encargado a sus trabajadores (nivel 2) sigue gobernado por las
-- políticas crew_lead existentes.
-- ============================================================

-- Supervisor: lee la liquidación de las cuadrillas que supervisa
CREATE POLICY "supervisor_read_crew_settlements" ON settlements
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND payee_type = 'crew'
      AND crew_id IN (SELECT id FROM crews WHERE supervisor_id = current_worker_id())
    )
  );

-- Supervisor: lee los pagos del campo al Encargado de las cuadrillas que supervisa
CREATE POLICY "supervisor_read_crew_payments" ON payments
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND crew_id IN (SELECT id FROM crews WHERE supervisor_id = current_worker_id())
    )
  );
