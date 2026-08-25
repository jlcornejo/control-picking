-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================
-- Rules:
--   Admin: full access to all tables
--   Supervisor: read/write picking_records for assigned workers, read assigned blocks
--   Worker: read only their own picking_records, settlements, payments
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE picking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PRODUCTS
-- ============================================================
-- Admin: full CRUD
CREATE POLICY "admin_all_products" ON products
  FOR ALL USING (is_admin());

-- Supervisor/Worker: read active products (needed for display)
CREATE POLICY "authenticated_read_products" ON products
  FOR SELECT USING (auth.role() = 'authenticated' AND status = 'active');

-- ============================================================
-- FIELDS
-- ============================================================
-- Admin: full CRUD
CREATE POLICY "admin_all_fields" ON fields
  FOR ALL USING (is_admin());

-- Supervisor: read active fields (they see all fields for context)
CREATE POLICY "supervisor_read_fields" ON fields
  FOR SELECT USING (is_supervisor() AND status = 'active');

-- ============================================================
-- BLOCKS
-- ============================================================
-- Admin: full CRUD
CREATE POLICY "admin_all_blocks" ON blocks
  FOR ALL USING (is_admin());

-- Supervisor: read only assigned blocks
CREATE POLICY "supervisor_read_assigned_blocks" ON blocks
  FOR SELECT USING (
    is_supervisor()
    AND status = 'active'
    AND id IN (
      SELECT block_id FROM supervisor_assignments
      WHERE supervisor_id = current_worker_id()
      AND block_id IS NOT NULL
    )
  );

-- ============================================================
-- RATES
-- ============================================================
-- Admin: full CRUD
CREATE POLICY "admin_all_rates" ON rates
  FOR ALL USING (is_admin());

-- No access for supervisor/worker (rates are confidential)
-- Workers see estimated earnings calculated server-side, not raw rates

-- ============================================================
-- WORKERS
-- ============================================================
-- Admin: full CRUD
CREATE POLICY "admin_all_workers" ON workers
  FOR ALL USING (is_admin());

-- Supervisor: read only assigned workers
CREATE POLICY "supervisor_read_assigned_workers" ON workers
  FOR SELECT USING (
    is_supervisor()
    AND (
      -- Can see themselves
      id = current_worker_id()
      -- Can see assigned workers
      OR id IN (
        SELECT worker_id FROM supervisor_assignments
        WHERE supervisor_id = current_worker_id()
        AND worker_id IS NOT NULL
      )
    )
  );

-- Worker: read only themselves
CREATE POLICY "worker_read_self" ON workers
  FOR SELECT USING (
    is_worker()
    AND id = current_worker_id()
  );

-- ============================================================
-- SUPERVISOR_ASSIGNMENTS
-- ============================================================
-- Admin: full CRUD
CREATE POLICY "admin_all_assignments" ON supervisor_assignments
  FOR ALL USING (is_admin());

-- Supervisor: read their own assignments
CREATE POLICY "supervisor_read_own_assignments" ON supervisor_assignments
  FOR SELECT USING (
    is_supervisor()
    AND supervisor_id = current_worker_id()
  );

-- ============================================================
-- PICKING_RECORDS
-- ============================================================
-- Admin: full access
CREATE POLICY "admin_all_picking" ON picking_records
  FOR ALL USING (is_admin());

-- Supervisor: read/insert for assigned workers only
CREATE POLICY "supervisor_read_picking" ON picking_records
  FOR SELECT USING (
    is_supervisor()
    AND worker_id IN (
      SELECT worker_id FROM supervisor_assignments
      WHERE supervisor_id = current_worker_id()
      AND worker_id IS NOT NULL
    )
  );

CREATE POLICY "supervisor_insert_picking" ON picking_records
  FOR INSERT WITH CHECK (
    is_supervisor()
    AND worker_id IN (
      SELECT worker_id FROM supervisor_assignments
      WHERE supervisor_id = current_worker_id()
      AND worker_id IS NOT NULL
    )
    AND recorded_by = current_worker_id()
  );

CREATE POLICY "supervisor_update_picking" ON picking_records
  FOR UPDATE USING (
    is_supervisor()
    AND recorded_by = current_worker_id()
    AND work_day = CURRENT_DATE
  );

-- Worker: read only their own records
CREATE POLICY "worker_read_own_picking" ON picking_records
  FOR SELECT USING (
    is_worker()
    AND worker_id = current_worker_id()
  );

-- ============================================================
-- SETTLEMENTS
-- ============================================================
-- Admin: full access
CREATE POLICY "admin_all_settlements" ON settlements
  FOR ALL USING (is_admin());

-- Worker: read only their own settlements
CREATE POLICY "worker_read_own_settlements" ON settlements
  FOR SELECT USING (
    is_worker()
    AND worker_id = current_worker_id()
  );

-- ============================================================
-- PAYMENTS
-- ============================================================
-- Admin: full access
CREATE POLICY "admin_all_payments" ON payments
  FOR ALL USING (is_admin());

-- Worker: read only their own payments
CREATE POLICY "worker_read_own_payments" ON payments
  FOR SELECT USING (
    is_worker()
    AND worker_id = current_worker_id()
  );
