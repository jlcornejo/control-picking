-- ============================================================
-- FASE 3: RLS de liquidaciones y pagos para el crew_lead (Encargado)
-- ============================================================
-- El Encargado necesita:
--   - Ver la liquidación de SU cuadrilla (nivel 1, payee_type='crew'): lo que
--     el cliente le paga a él.
--   - Generar y gestionar las liquidaciones/pagos de nivel 2 hacia los
--     trabajadores de su cuadrilla (payee_type='worker', worker en su crew).
--
-- Nota de compatibilidad: la política existente worker_read_own_settlements
-- compara worker_id = current_worker_id(). Con worker_id ahora nullable sigue
-- siendo correcta: matchea las liquidaciones individuales del trabajador y no
-- matchea las de cuadrilla (worker_id IS NULL), que es lo deseado.
-- El trigger prevent_paid_settlement_update permanece intacto (inmutabilidad
-- de liquidaciones pagadas en ambos niveles).
-- ============================================================

-- ---- SETTLEMENTS ----

-- Crew lead: lee la liquidación de su propia cuadrilla (nivel 1)
CREATE POLICY "crew_lead_read_crew_settlement" ON settlements
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND payee_type = 'crew'
      AND crew_id = current_crew_id()
    )
  );

-- Crew lead: lee las liquidaciones individuales de los trabajadores de su cuadrilla (nivel 2)
CREATE POLICY "crew_lead_read_member_settlements" ON settlements
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND payee_type = 'worker'
      AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
    )
  );

-- Crew lead: crea liquidaciones de nivel 2 para trabajadores de su cuadrilla
CREATE POLICY "crew_lead_insert_member_settlements" ON settlements
  FOR INSERT WITH CHECK (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND payee_type = 'worker'
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  );

-- Crew lead: actualiza liquidaciones de nivel 2 de su cuadrilla (el trigger
-- prevent_paid_settlement_update sigue bloqueando cambios sobre las pagadas)
CREATE POLICY "crew_lead_update_member_settlements" ON settlements
  FOR UPDATE USING (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND payee_type = 'worker'
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  );

-- ---- PAYMENTS ----

-- Crew lead: lee los pagos de las liquidaciones de nivel 2 de su cuadrilla
CREATE POLICY "crew_lead_read_member_payments" ON payments
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
    )
  );

-- Crew lead: registra pagos a los trabajadores de su cuadrilla
CREATE POLICY "crew_lead_insert_member_payments" ON payments
  FOR INSERT WITH CHECK (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  );
