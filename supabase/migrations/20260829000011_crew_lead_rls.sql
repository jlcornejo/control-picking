-- ============================================================
-- FASE 2: helpers y RLS para el rol crew_lead (Encargado)
-- ============================================================
-- El Encargado solo accede a SU cuadrilla, dentro de SU organización:
--   - sus trabajadores (workers con crew_id = su cuadrilla)
--   - la producción de esos trabajadores (picking_records)
--   - su propia cuadrilla (crews)
-- Se mantiene el bypass de platform admin y el aislamiento de tenant.
-- ============================================================

-- ¿El usuario actual es crew_lead?
CREATE OR REPLACE FUNCTION public.is_crew_lead()
RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() ->> 'app_role') = 'crew_lead';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Cuadrilla activa del crew_lead actual (la que él lidera)
CREATE OR REPLACE FUNCTION public.current_crew_id()
RETURNS UUID AS $$
  SELECT id FROM public.crews
  WHERE crew_lead_id = current_worker_id()
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_crew_lead IS 'True si el usuario autenticado tiene rol crew_lead.';
COMMENT ON FUNCTION public.current_crew_id IS 'Cuadrilla activa liderada por el crew_lead actual.';

-- ============================================================
-- RLS: crews
-- ============================================================
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;

-- Admin: CRUD de las cuadrillas de su organización
CREATE POLICY "admin_all_crews" ON crews
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

-- Supervisor: lectura de las cuadrillas de su organización
CREATE POLICY "supervisor_read_crews" ON crews
  FOR SELECT USING (
    is_platform_admin()
    OR (is_supervisor() AND organization_id = current_org_id())
  );

-- Crew lead: lectura de su propia cuadrilla
CREATE POLICY "crew_lead_read_own_crew" ON crews
  FOR SELECT USING (
    is_platform_admin()
    OR (is_crew_lead() AND organization_id = current_org_id() AND crew_lead_id = current_worker_id())
  );

-- ============================================================
-- RLS: workers — el crew_lead lee a los miembros de su cuadrilla
-- ============================================================
CREATE POLICY "crew_lead_read_crew_workers" ON workers
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND (id = current_worker_id() OR crew_id = current_crew_id())
    )
  );

-- ============================================================
-- RLS: picking_records — el crew_lead lee la producción de su cuadrilla
-- ============================================================
CREATE POLICY "crew_lead_read_crew_picking" ON picking_records
  FOR SELECT USING (
    is_platform_admin()
    OR (
      is_crew_lead()
      AND organization_id = current_org_id()
      AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
    )
  );
