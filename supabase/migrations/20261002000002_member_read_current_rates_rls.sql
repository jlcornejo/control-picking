-- ============================================================
-- RLS: lectura de tarifas vigentes para miembros no-admin
-- ============================================================
-- Bug: al registrar picking, el supervisor (y crew_lead) resuelve la tarifa
-- vigente del producto para congelar `rate_amount_snapshot`. La tabla `rates`
-- solo tenía la policy `admin_all_rates` (requiere is_admin()), por lo que la
-- consulta del supervisor devolvía 0 filas y el registro fallaba con
-- "Sin tarifa vigente para este producto".
--
-- Fix: agregar una policy SELECT que permita a supervisor, crew_lead y worker
-- leer las tarifas `current` de su propia organización. Espeja exactamente el
-- patrón de `member_read_active_box_types` (box_types) y mantiene el aislamiento
-- por tenant. Solo concede LECTURA de tarifas vigentes; la gestión (crear/
-- actualizar/historizar) sigue siendo exclusiva de admin vía `admin_all_rates`.
--
-- Seguridad: scope por organización (organization_id = current_org_id()) y por
-- estado (status = 'current'); platform_admin mantiene bypass de tenant.
-- ============================================================

CREATE POLICY "member_read_current_rates" ON rates
  FOR SELECT USING (
    is_platform_admin()
    OR (
      (is_supervisor() OR is_crew_lead() OR is_worker())
      AND status = 'current'
      AND organization_id = current_org_id()
    )
  );

COMMENT ON POLICY "member_read_current_rates" ON rates IS 'Permite a supervisor/crew_lead/worker leer las tarifas vigentes (status=current) de su organización, necesario para congelar rate_amount_snapshot al registrar picking. Solo lectura; la gestión de tarifas sigue siendo de admin.';
