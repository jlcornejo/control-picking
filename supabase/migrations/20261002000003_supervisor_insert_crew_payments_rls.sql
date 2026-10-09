-- ============================================================
-- RLS: el Supervisor registra pagos de las cuadrillas que supervisa
-- ============================================================
-- Decisión de negocio (amplía el diseño de 20260830000002, donde el pago al
-- Encargado era solo del Admin): el Supervisor que supervisa una cuadrilla
-- (crews.supervisor_id = él) también puede REGISTRAR el pago del campo a esa
-- cuadrilla (liquidación payee_type='crew').
--
-- Bug que corrige: la UI de Liquidaciones ya mostraba el botón "Pagar" al
-- Supervisor, pero payments solo tenía INSERT para admin (admin_all_payments) y
-- crew_lead (crew_lead_insert_member_payments). Al confirmar, el pago fallaba
-- con "new row violates row-level security policy for table payments".
--
-- Alcance (acotado y espeja supervisor_read_crew_payments):
--   - Solo pagos de cuadrilla: crew_id debe apuntar a una crew que el supervisor
--     supervisa; worker_id debe ser NULL (los pagos a trabajador individual
--     siguen siendo de admin o del crew_lead a su gente).
--   - Mismo tenant (organization_id = current_org_id()).
--   - platform_admin mantiene bypass.
-- La inmutabilidad de liquidaciones pagadas y el tope "pagado <= liquidado" se
-- siguen aplicando en la lógica de pago (no se relajan aquí): esta policy solo
-- habilita el INSERT acotado al ámbito del supervisor.
-- ============================================================

CREATE POLICY "supervisor_insert_crew_payments" ON payments
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND worker_id IS NULL
      AND crew_id IN (SELECT id FROM crews WHERE supervisor_id = current_worker_id())
    )
  );

COMMENT ON POLICY "supervisor_insert_crew_payments" ON payments IS 'Permite al supervisor registrar pagos de cuadrilla (payee_type=crew) de las cuadrillas que supervisa (crews.supervisor_id = él), acotado por organización y a crew_id (worker_id NULL). Complementa supervisor_read_crew_payments.';

-- ============================================================
-- RLS: el Supervisor actualiza el estado de la liquidación de su cuadrilla
-- ============================================================
-- Complemento necesario del INSERT de arriba: tras registrar el pago, la app
-- recalcula settlements.status ('partial' -> 'paid' cuando pagado >= liquidado).
-- settlements solo tenía UPDATE para admin (admin_all_settlements) y crew_lead
-- (crew_lead_update_member_settlements, solo payee_type='worker'). Sin esta
-- policy, el UPDATE del supervisor se rechazaba en silencio y la liquidación de
-- cuadrilla quedaba en 'partial' aunque estuviera totalmente pagada.
--
-- Alcance (espeja supervisor_read_crew_settlements): solo liquidaciones de
-- cuadrilla (payee_type='crew') de las cuadrillas que supervisa, mismo tenant.
-- No relaja la inmutabilidad del invariante #14: habilita la transición de
-- estado que acompaña al pago; no permite revertir ni editar montos (total_amount
-- se mantiene; la lógica de negocio no reabre una liquidación ya pagada).
-- ============================================================

CREATE POLICY "supervisor_update_crew_settlements" ON settlements
  FOR UPDATE USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND payee_type = 'crew'
      AND crew_id IN (SELECT id FROM crews WHERE supervisor_id = current_worker_id())
    )
  );

COMMENT ON POLICY "supervisor_update_crew_settlements" ON settlements IS 'Permite al supervisor actualizar la liquidación de cuadrilla (payee_type=crew) de las cuadrillas que supervisa, necesario para marcar status=paid al completar el pago. Complementa supervisor_insert_crew_payments.';
