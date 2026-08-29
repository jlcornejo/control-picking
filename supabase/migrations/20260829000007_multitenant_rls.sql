-- ============================================================
-- MULTI-TENANT RLS: aislamiento de tenant + bypass de plataforma
-- ============================================================
-- Reescribe todas las políticas existentes con el patrón:
--   is_platform_admin() OR (<predicado_rol_existente> AND organization_id = current_org_id())
-- El platform admin salta el aislamiento (centralizado y auditable).
-- Todo lo demás queda acotado a la organización del usuario.
--
-- También habilita RLS en las tablas nuevas (organizations, platform_admins,
-- platform_audit_log).
-- ============================================================

-- ============================================================
-- PRODUCTS
-- ============================================================
DROP POLICY "admin_all_products" ON products;
CREATE POLICY "admin_all_products" ON products
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "authenticated_read_products" ON products;
CREATE POLICY "authenticated_read_products" ON products
  FOR SELECT USING (
    is_platform_admin()
    OR (auth.role() = 'authenticated' AND status = 'active' AND organization_id = current_org_id())
  );

-- ============================================================
-- FIELDS
-- ============================================================
DROP POLICY "admin_all_fields" ON fields;
CREATE POLICY "admin_all_fields" ON fields
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "supervisor_read_fields" ON fields;
CREATE POLICY "supervisor_read_fields" ON fields
  FOR SELECT USING (
    is_platform_admin()
    OR (is_supervisor() AND status = 'active' AND organization_id = current_org_id())
  );

-- ============================================================
-- BLOCKS
-- ============================================================
DROP POLICY "admin_all_blocks" ON blocks;
CREATE POLICY "admin_all_blocks" ON blocks
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "supervisor_read_assigned_blocks" ON blocks;
CREATE POLICY "supervisor_read_assigned_blocks" ON blocks
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND status = 'active'
      AND organization_id = current_org_id()
      AND id IN (
        SELECT block_id FROM supervisor_assignments
        WHERE supervisor_id = current_worker_id()
        AND block_id IS NOT NULL
      )
    )
  );

DROP POLICY worker_read_blocks_with_records ON blocks;
CREATE POLICY worker_read_blocks_with_records ON blocks
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_worker()
      AND organization_id = current_org_id()
      AND id IN (
        SELECT DISTINCT block_id FROM picking_records WHERE worker_id = current_worker_id()
      )
    )
  );

-- ============================================================
-- RATES (confidencial: solo admin dentro de su org)
-- ============================================================
DROP POLICY "admin_all_rates" ON rates;
CREATE POLICY "admin_all_rates" ON rates
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

-- ============================================================
-- WORKERS
-- ============================================================
DROP POLICY "admin_all_workers" ON workers;
CREATE POLICY "admin_all_workers" ON workers
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "supervisor_read_assigned_workers" ON workers;
CREATE POLICY "supervisor_read_assigned_workers" ON workers
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND (
        id = current_worker_id()
        OR id IN (
          SELECT worker_id FROM supervisor_assignments
          WHERE supervisor_id = current_worker_id()
          AND worker_id IS NOT NULL
        )
      )
    )
  );

DROP POLICY "worker_read_self" ON workers;
CREATE POLICY "worker_read_self" ON workers
  FOR SELECT USING (
    is_platform_admin()
    OR (is_worker() AND organization_id = current_org_id() AND id = current_worker_id())
  );

-- ============================================================
-- SUPERVISOR_ASSIGNMENTS
-- ============================================================
DROP POLICY "admin_all_assignments" ON supervisor_assignments;
CREATE POLICY "admin_all_assignments" ON supervisor_assignments
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "supervisor_read_own_assignments" ON supervisor_assignments;
CREATE POLICY "supervisor_read_own_assignments" ON supervisor_assignments
  FOR SELECT USING (
    is_platform_admin()
    OR (is_supervisor() AND organization_id = current_org_id() AND supervisor_id = current_worker_id())
  );

-- ============================================================
-- PICKING_RECORDS
-- ============================================================
DROP POLICY "admin_all_picking" ON picking_records;
CREATE POLICY "admin_all_picking" ON picking_records
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "supervisor_read_picking" ON picking_records;
CREATE POLICY "supervisor_read_picking" ON picking_records
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND worker_id IN (
        SELECT worker_id FROM supervisor_assignments
        WHERE supervisor_id = current_worker_id()
        AND worker_id IS NOT NULL
      )
    )
  );

DROP POLICY "supervisor_insert_picking" ON picking_records;
CREATE POLICY "supervisor_insert_picking" ON picking_records
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND worker_id IN (
        SELECT worker_id FROM supervisor_assignments
        WHERE supervisor_id = current_worker_id()
        AND worker_id IS NOT NULL
      )
      AND recorded_by = current_worker_id()
    )
  );

DROP POLICY "supervisor_update_picking" ON picking_records;
CREATE POLICY "supervisor_update_picking" ON picking_records
  FOR UPDATE USING (
    is_platform_admin()
    OR (
      is_supervisor()
      AND organization_id = current_org_id()
      AND recorded_by = current_worker_id()
      AND work_day = CURRENT_DATE
    )
  );

DROP POLICY "worker_read_own_picking" ON picking_records;
CREATE POLICY "worker_read_own_picking" ON picking_records
  FOR SELECT USING (
    is_platform_admin()
    OR (is_worker() AND organization_id = current_org_id() AND worker_id = current_worker_id())
  );

-- ============================================================
-- SETTLEMENTS
-- ============================================================
DROP POLICY "admin_all_settlements" ON settlements;
CREATE POLICY "admin_all_settlements" ON settlements
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "worker_read_own_settlements" ON settlements;
CREATE POLICY "worker_read_own_settlements" ON settlements
  FOR SELECT USING (
    is_platform_admin()
    OR (is_worker() AND organization_id = current_org_id() AND worker_id = current_worker_id())
  );

-- ============================================================
-- PAYMENTS
-- ============================================================
DROP POLICY "admin_all_payments" ON payments;
CREATE POLICY "admin_all_payments" ON payments
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

DROP POLICY "worker_read_own_payments" ON payments;
CREATE POLICY "worker_read_own_payments" ON payments
  FOR SELECT USING (
    is_platform_admin()
    OR (is_worker() AND organization_id = current_org_id() AND worker_id = current_worker_id())
  );

-- ============================================================
-- TABLAS NUEVAS: RLS
-- ============================================================

-- ORGANIZATIONS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Platform admin: control total sobre todas las organizaciones
CREATE POLICY "platform_admin_all_organizations" ON organizations
  FOR ALL USING (is_platform_admin());

-- Admin: lee y actualiza SU propia organización (branding, config)
CREATE POLICY "admin_read_own_organization" ON organizations
  FOR SELECT USING (is_admin() AND id = current_org_id());

CREATE POLICY "admin_update_own_organization" ON organizations
  FOR UPDATE USING (is_admin() AND id = current_org_id());

-- Supervisor/worker: lectura de su propia organización (branding para UI)
CREATE POLICY "member_read_own_organization" ON organizations
  FOR SELECT USING (
    (is_supervisor() OR is_worker()) AND id = current_org_id()
  );

-- PLATFORM_ADMINS: solo platform admins
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_platform_admins" ON platform_admins
  FOR ALL USING (is_platform_admin());

-- PLATFORM_AUDIT_LOG: solo platform admins
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_audit_log" ON platform_audit_log
  FOR ALL USING (is_platform_admin());
