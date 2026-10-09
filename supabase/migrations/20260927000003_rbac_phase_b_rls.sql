-- ============================================================
-- RBAC CONFIGURABLE — FASE B: endurecer RLS con has_permission (KAN-5)
-- ============================================================
-- La Fase A aplicó el gating de capacidades en Edge Functions y UI. La Fase B
-- lo lleva a la base de datos: las políticas FOR ALL de administración de tablas
-- SENSIBLES ahora exigen, además del rol admin, la capacidad correspondiente.
--
-- Semántica de has_permission(cap) (ver migración 20260927000002):
--   - platform_admin → siempre true (bypass de tenant, se mantiene arriba igual).
--   - worker SIN perfil (sin claim `permissions`) → true (capacidades completas
--     del rol → comportamiento idéntico al previo, retrocompatible).
--   - worker CON perfil → true solo si la capacidad está listada.
--
-- Patrón de cada política:
--   is_platform_admin()
--   OR (is_admin() AND has_permission('<cap>') AND organization_id = current_org_id())
--
-- NO se endurecen:
--   - picking_records / day_roster: son del flujo OPERATIVO de terreno, no de
--     gestión; su acceso ya está acotado por rol y asignaciones.
--   - permission_profiles: el admin debe poder gestionar el RBAC siempre; añadir
--     una capacidad aquí arriesga un auto-bloqueo (admin que se quita settings y
--     ya no puede re-habilitarse). Se deja solo con is_admin().
--   - field_rows: hereda del mismo dominio que fields; se endurece con fields.manage.
--
-- Solo se tocan las políticas FOR ALL de admin. Las de lectura y las de otros
-- roles (supervisor, crew_lead, worker) quedan intactas.
-- ============================================================

-- WORKERS → workers.manage
DROP POLICY "admin_all_workers" ON workers;
CREATE POLICY "admin_all_workers" ON workers
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('workers.manage') AND organization_id = current_org_id())
  );

-- RATES → rates.manage
DROP POLICY "admin_all_rates" ON rates;
CREATE POLICY "admin_all_rates" ON rates
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('rates.manage') AND organization_id = current_org_id())
  );

-- SETTLEMENTS → settlements.manage
DROP POLICY "admin_all_settlements" ON settlements;
CREATE POLICY "admin_all_settlements" ON settlements
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('settlements.manage') AND organization_id = current_org_id())
  );

-- PAYMENTS → payments.manage
DROP POLICY "admin_all_payments" ON payments;
CREATE POLICY "admin_all_payments" ON payments
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('payments.manage') AND organization_id = current_org_id())
  );

-- FIELDS → fields.manage
DROP POLICY "admin_all_fields" ON fields;
CREATE POLICY "admin_all_fields" ON fields
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('fields.manage') AND organization_id = current_org_id())
  );

-- BLOCKS → fields.manage (misma capacidad de estructura productiva)
DROP POLICY "admin_all_blocks" ON blocks;
CREATE POLICY "admin_all_blocks" ON blocks
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('fields.manage') AND organization_id = current_org_id())
  );

-- FIELD_ROWS → fields.manage (melgas, parte de la estructura productiva)
DROP POLICY "admin_all_field_rows" ON field_rows;
CREATE POLICY "admin_all_field_rows" ON field_rows
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('fields.manage') AND organization_id = current_org_id())
  );

-- PRODUCTS → products.manage
DROP POLICY "admin_all_products" ON products;
CREATE POLICY "admin_all_products" ON products
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('products.manage') AND organization_id = current_org_id())
  );

-- BOX_TYPES → box_types.manage
DROP POLICY "admin_all_box_types" ON box_types;
CREATE POLICY "admin_all_box_types" ON box_types
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('box_types.manage') AND organization_id = current_org_id())
  );

-- CREWS → crews.manage
DROP POLICY "admin_all_crews" ON crews;
CREATE POLICY "admin_all_crews" ON crews
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('crews.manage') AND organization_id = current_org_id())
  );

-- SUPERVISOR_ASSIGNMENTS → supervisors.manage
DROP POLICY "admin_all_assignments" ON supervisor_assignments;
CREATE POLICY "admin_all_assignments" ON supervisor_assignments
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('supervisors.manage') AND organization_id = current_org_id())
  );
