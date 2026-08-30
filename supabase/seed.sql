-- ============================================================
-- SEED DATA: Testing/Development
-- NOTE: Auth users must be created via API after db reset.
--       Run: npm run db:seed-users
--
-- Multi-tenant: todos los datos de ejemplo pertenecen a la organización
-- semilla 'default' (creada en la migración de multi-tenancy). Un segundo
-- tenant de ejemplo ('sur-berries') se agrega para probar aislamiento.
--
-- NOTA: se usa la subconsulta (SELECT id FROM organizations WHERE slug='default')
-- en lugar de variables de psql, para que corra bajo `supabase db reset`.
-- ============================================================

-- ============================================================
-- ORGANIZACIÓN 2: "Sur Berries SpA" (slug 'sur-berries')
-- CON Modo Capataz activo — sirve para validar el flujo del Encargado.
-- (La organización 'default' opera SIN Modo Capataz: pago directo.)
-- ============================================================
INSERT INTO organizations (id, name, slug, subscription_status, status, crew_mode_enabled, brand_primary_color, brand_secondary_color) VALUES
  ('0a000002-0000-0000-0000-000000000001', 'Sur Berries SpA', 'sur-berries', 'active', 'active', true, '#7c3aed', '#f59e0b')
ON CONFLICT (slug) DO UPDATE SET crew_mode_enabled = EXCLUDED.crew_mode_enabled;

-- Usuarios de sur-berries: admin, encargado (crew_lead) y trabajadores
INSERT INTO workers (id, organization_id, full_name, national_id, phone, role, status, qr_badge_url) VALUES
  ('aa0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Admin Sur Berries', '20.111.111-1', '+56966666661', 'admin', 'active', 'badge-sur-admin-001'),
  ('aa0000fe-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Roberto Fuentes (Capataz)', '20.222.222-2', '+56966666662', 'crew_lead', 'active', 'badge-sur-lead-001'),
  ('aa0000fd-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Camila Rojas', '20.333.333-3', '+56966666663', 'worker', 'active', 'badge-sur-worker-001'),
  ('aa0000fc-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Diego Torres', '20.444.444-4', '+56966666664', 'worker', 'active', 'badge-sur-worker-002'),
  ('aa0000fb-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Fernanda Silva', '20.555.555-5', '+56966666665', 'worker', 'active', 'badge-sur-worker-003')
ON CONFLICT (id) DO NOTHING;

-- Producto y tarifa de sur-berries
INSERT INTO products (id, organization_id, name, unit_measure, status) VALUES
  ('bb0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Frutilla', 'kg', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rates (id, organization_id, product_id, amount, effective_from, status) VALUES
  ('cc0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'bb0000ff-0000-0000-0000-000000000001', 1200, now(), 'current')
ON CONFLICT (id) DO NOTHING;

-- Campo y paño de sur-berries (hereda crew_mode de la organización: crew_mode_enabled = NULL)
INSERT INTO fields (id, organization_id, name, location, total_area, status, crew_mode_enabled) VALUES
  ('dd0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Fundo Los Maitenes', 'Chillán, Ñuble', 18.0, 'active', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO blocks (id, organization_id, field_id, product_id, name, area, status) VALUES
  ('ee0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'dd0000ff-0000-0000-0000-000000000001', 'bb0000ff-0000-0000-0000-000000000001', 'Paño F1 - Frutillas', 9.0, 'active')
ON CONFLICT (id) DO NOTHING;

-- Cuadrilla del encargado Roberto Fuentes
INSERT INTO crews (id, organization_id, crew_lead_id, name, status) VALUES
  ('c50000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fe-0000-0000-0000-000000000001', 'Furgón Norte', 'active')
ON CONFLICT (id) DO NOTHING;

-- Asignar los trabajadores de sur-berries a la cuadrilla
UPDATE workers SET crew_id = 'c50000ff-0000-0000-0000-000000000001'
  WHERE id IN (
    'aa0000fd-0000-0000-0000-000000000001',
    'aa0000fc-0000-0000-0000-000000000001',
    'aa0000fb-0000-0000-0000-000000000001'
  );

-- Producción de muestra de la cuadrilla (registrada por el encargado)
INSERT INTO picking_records (organization_id, worker_id, block_id, quantity, rate_amount_snapshot, work_day, recorded_by) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fd-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001', 22, 1200, CURRENT_DATE, 'aa0000fe-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fc-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001', 19, 1200, CURRENT_DATE, 'aa0000fe-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fb-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001', 25, 1200, CURRENT_DATE, 'aa0000fe-0000-0000-0000-000000000001');

-- Workers (auth_user_id will be linked after API user creation)
INSERT INTO workers (id, organization_id, full_name, national_id, phone, role, status, qr_badge_url) VALUES
  ('aa000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Administrador Sistema', '11.111.111-1', '+56912345678', 'admin', 'active', 'badge-admin-001'),
  ('aa000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Carlos Muñoz', '12.345.678-9', '+56987654321', 'supervisor', 'active', 'badge-supervisor-001'),
  ('aa000010-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Juan Pérez', '13.456.789-0', '+56911111111', 'worker', 'active', 'badge-worker-001'),
  ('aa000011-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'María González', '14.567.890-1', '+56922222222', 'worker', 'active', 'badge-worker-002'),
  ('aa000012-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Pedro Soto', '15.678.901-2', '+56933333333', 'worker', 'active', 'badge-worker-003'),
  ('aa000013-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Ana Riquelme', '16.789.012-3', '+56944444444', 'worker', 'active', 'badge-worker-004'),
  ('aa000014-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Luis Contreras', '17.890.123-4', '+56955555555', 'worker', 'active', 'badge-worker-005');

-- Products
INSERT INTO products (id, organization_id, name, unit_measure, status) VALUES
  ('bb000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Arándano', 'box', 'active'),
  ('bb000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Cereza', 'kg', 'active'),
  ('bb000003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Frambuesa', 'box', 'active');

-- Rates (CLP per unit)
INSERT INTO rates (id, organization_id, product_id, amount, effective_from, status) VALUES
  ('cc000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'bb000001-0000-0000-0000-000000000001', 1500, now(), 'current'),
  ('cc000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'bb000002-0000-0000-0000-000000000001', 2000, now(), 'current'),
  ('cc000003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'bb000003-0000-0000-0000-000000000001', 1800, now(), 'current');

-- Fields
INSERT INTO fields (id, organization_id, name, location, total_area, status) VALUES
  ('dd000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Fundo El Aromo', 'Rancagua, VI Región', 25.5, 'active'),
  ('dd000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'Parcela Los Aromos', 'Rengo, VI Región', 12.0, 'active');

-- Blocks
INSERT INTO blocks (id, organization_id, field_id, product_id, name, area, status) VALUES
  ('ee000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'dd000001-0000-0000-0000-000000000001', 'bb000001-0000-0000-0000-000000000001', 'Paño A1 - Arándanos Norte', 5.0, 'active'),
  ('ee000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'dd000001-0000-0000-0000-000000000001', 'bb000001-0000-0000-0000-000000000001', 'Paño A2 - Arándanos Sur', 4.5, 'active'),
  ('ee000003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'dd000001-0000-0000-0000-000000000001', 'bb000002-0000-0000-0000-000000000001', 'Paño B1 - Cerezas', 8.0, 'active'),
  ('ee000004-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='default'), 'dd000002-0000-0000-0000-000000000001', 'bb000003-0000-0000-0000-000000000001', 'Paño C1 - Frambuesas', 6.0, 'active');

-- Supervisor assignments (worker)
INSERT INTO supervisor_assignments (organization_id, supervisor_id, worker_id) VALUES
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'aa000010-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'aa000011-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'aa000012-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'aa000013-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'aa000014-0000-0000-0000-000000000001');

-- Supervisor assignments (block)
INSERT INTO supervisor_assignments (organization_id, supervisor_id, block_id) VALUES
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'ee000001-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'ee000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000002-0000-0000-0000-000000000001', 'ee000003-0000-0000-0000-000000000001');

-- Sample picking records (today)
INSERT INTO picking_records (organization_id, worker_id, block_id, quantity, rate_amount_snapshot, work_day, recorded_by) VALUES
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000010-0000-0000-0000-000000000001', 'ee000001-0000-0000-0000-000000000001', 12, 1500, CURRENT_DATE, 'aa000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000010-0000-0000-0000-000000000001', 'ee000002-0000-0000-0000-000000000001', 8, 1500, CURRENT_DATE, 'aa000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000011-0000-0000-0000-000000000001', 'ee000001-0000-0000-0000-000000000001', 15, 1500, CURRENT_DATE, 'aa000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000012-0000-0000-0000-000000000001', 'ee000002-0000-0000-0000-000000000001', 10, 1500, CURRENT_DATE, 'aa000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000013-0000-0000-0000-000000000001', 'ee000003-0000-0000-0000-000000000001', 5, 2000, CURRENT_DATE, 'aa000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='default'), 'aa000014-0000-0000-0000-000000000001', 'ee000001-0000-0000-0000-000000000001', 18, 1500, CURRENT_DATE, 'aa000002-0000-0000-0000-000000000001');
