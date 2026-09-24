-- ============================================================
-- SEED REMOTO (fundo360) — datos de prueba completos
-- ============================================================
-- Ejecutar contra el proyecto remoto vinculado. Idempotente (ON CONFLICT).
-- Objetivo: data para probar TODO el aplicativo.
--   - 2 tenants, AMBOS con Modo Capataz (furgón) activo.
--   - sur-berries: además con HILERAS/MELGAS (rows_enabled = true).
--   - andes-fruit: sin melgas.
--   - Todos los roles: admin, supervisor, crew_lead (encargado), workers.
--   - HISTORIAL de 30 días de picking (generate_series) para métricas/tendencias.
--   - Liquidaciones y pagos (2 niveles: campo->encargado, encargado->trabajador).
--   - Feature flags globales + overrides por tenant.
--
-- Los usuarios de Auth se crean aparte con scripts/seed-users-remote.sh
-- (este seed solo crea las filas de dominio; el vínculo auth_user_id se hace
--  luego por el script).
-- ============================================================

BEGIN;

-- ============================================================
-- TENANT 1: Sur Berries SpA (capataz + MELGAS)
-- ============================================================
INSERT INTO organizations (id, name, slug, subscription_status, subscription_plan, status, crew_mode_enabled, rows_enabled, brand_primary_color, brand_secondary_color) VALUES
  ('0a000002-0000-0000-0000-000000000001', 'Sur Berries SpA', 'sur-berries', 'active', 'Enterprise', 'active', true, true, '#7c3aed', '#f59e0b')
ON CONFLICT (slug) DO UPDATE SET crew_mode_enabled = EXCLUDED.crew_mode_enabled, rows_enabled = EXCLUDED.rows_enabled;

INSERT INTO workers (id, organization_id, full_name, national_id, phone, role, status, qr_badge_url) VALUES
  ('aa0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Admin Sur Berries', '20.111.111-1', '+56966666661', 'admin', 'active', 'badge-sur-admin-001'),
  ('aa0000fa-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Patricia Núñez', '20.999.999-9', '+56966666669', 'supervisor', 'active', 'badge-sur-supervisor-001'),
  ('aa0000fe-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Roberto Fuentes (Capataz)', '20.222.222-2', '+56966666662', 'crew_lead', 'active', 'badge-sur-lead-001'),
  ('aa0000fd-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Camila Rojas', '20.333.333-3', '+56966666663', 'worker', 'active', 'badge-sur-worker-001'),
  ('aa0000fc-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Diego Torres', '20.444.444-4', '+56966666664', 'worker', 'active', 'badge-sur-worker-002'),
  ('aa0000fb-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Fernanda Silva', '20.555.555-5', '+56966666665', 'worker', 'active', 'badge-sur-worker-003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, organization_id, name, unit_measure, status) VALUES
  ('bb0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Frutilla', 'kg', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rates (id, organization_id, product_id, amount, effective_from, status) VALUES
  ('cc0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'bb0000ff-0000-0000-0000-000000000001', 1200, now(), 'current')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fields (id, organization_id, name, location, total_area, status, crew_mode_enabled, rows_enabled) VALUES
  ('dd0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'Fundo Los Maitenes', 'Chillán, Ñuble', 18.0, 'active', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO blocks (id, organization_id, field_id, product_id, name, area, status) VALUES
  ('ee0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'dd0000ff-0000-0000-0000-000000000001', 'bb0000ff-0000-0000-0000-000000000001', 'Paño F1 - Frutillas', 9.0, 'active')
ON CONFLICT (id) DO NOTHING;

-- MELGAS (hileras) del paño F1
INSERT INTO field_rows (id, organization_id, block_id, name, row_number, status) VALUES
  ('f0000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'ee0000ff-0000-0000-0000-000000000001', 'Melga 1', 1, 'active'),
  ('f0000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'ee0000ff-0000-0000-0000-000000000001', 'Melga 2', 2, 'active'),
  ('f0000003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'ee0000ff-0000-0000-0000-000000000001', 'Melga 3', 3, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crews (id, organization_id, crew_lead_id, supervisor_id, name, status) VALUES
  ('c50000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fe-0000-0000-0000-000000000001', 'aa0000fa-0000-0000-0000-000000000001', 'Furgón Norte', 'active')
ON CONFLICT (id) DO NOTHING;

UPDATE workers SET crew_id = 'c50000ff-0000-0000-0000-000000000001'
  WHERE id IN ('aa0000fd-0000-0000-0000-000000000001','aa0000fc-0000-0000-0000-000000000001','aa0000fb-0000-0000-0000-000000000001');

INSERT INTO supervisor_assignments (organization_id, supervisor_id, worker_id) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fa-0000-0000-0000-000000000001', 'aa0000fd-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fa-0000-0000-0000-000000000001', 'aa0000fc-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fa-0000-0000-0000-000000000001', 'aa0000fb-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
INSERT INTO supervisor_assignments (organization_id, supervisor_id, block_id) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fa-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Roster de HOY (encargado arma su equipo)
INSERT INTO day_roster (id, organization_id, work_day, worker_id, lead_id, crew_id, added_by) VALUES
  ('d5000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), org_workday((SELECT id FROM organizations WHERE slug='sur-berries')), 'aa0000fd-0000-0000-0000-000000000001', 'aa0000fe-0000-0000-0000-000000000001', 'c50000ff-0000-0000-0000-000000000001', 'aa0000fe-0000-0000-0000-000000000001'),
  ('d5000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), org_workday((SELECT id FROM organizations WHERE slug='sur-berries')), 'aa0000fc-0000-0000-0000-000000000001', 'aa0000fe-0000-0000-0000-000000000001', 'c50000ff-0000-0000-0000-000000000001', 'aa0000fe-0000-0000-0000-000000000001'),
  ('d5000003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), org_workday((SELECT id FROM organizations WHERE slug='sur-berries')), 'aa0000fb-0000-0000-0000-000000000001', 'aa0000fe-0000-0000-0000-000000000001', 'c50000ff-0000-0000-0000-000000000001', 'aa0000fe-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- HISTORIAL 30 días de picking (con melga rotativa). Sin day_roster_id histórico
-- (los rosters solo existen para hoy); block_id + row_id conservan la trazabilidad.
INSERT INTO picking_records (organization_id, worker_id, block_id, row_id, quantity, rate_amount_snapshot, work_day, recorded_at, recorded_by)
SELECT
  (SELECT id FROM organizations WHERE slug='sur-berries'),
  w.worker_id,
  'ee0000ff-0000-0000-0000-000000000001',
  w.row_id,
  (15 + (random()*20)::int)::numeric,
  1200,
  d::date,
  d::timestamptz + interval '15 hours',
  'aa0000fe-0000-0000-0000-000000000001'
FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, interval '1 day') d
CROSS JOIN (VALUES
  ('aa0000fd-0000-0000-0000-000000000001'::uuid, 'f0000001-0000-0000-0000-000000000001'::uuid),
  ('aa0000fc-0000-0000-0000-000000000001'::uuid, 'f0000002-0000-0000-0000-000000000001'::uuid),
  ('aa0000fb-0000-0000-0000-000000000001'::uuid, 'f0000003-0000-0000-0000-000000000001'::uuid)
) AS w(worker_id, row_id);

-- Picking de HOY (bajo el roster del día)
INSERT INTO picking_records (organization_id, worker_id, block_id, row_id, quantity, rate_amount_snapshot, work_day, recorded_by, day_roster_id) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fd-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000001', 22, 1200, org_workday((SELECT id FROM organizations WHERE slug='sur-berries')), 'aa0000fe-0000-0000-0000-000000000001', 'd5000001-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fc-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001', 'f0000002-0000-0000-0000-000000000001', 19, 1200, org_workday((SELECT id FROM organizations WHERE slug='sur-berries')), 'aa0000fe-0000-0000-0000-000000000001', 'd5000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'aa0000fb-0000-0000-0000-000000000001', 'ee0000ff-0000-0000-0000-000000000001', 'f0000003-0000-0000-0000-000000000001', 25, 1200, org_workday((SELECT id FROM organizations WHERE slug='sur-berries')), 'aa0000fe-0000-0000-0000-000000000001', 'd5000003-0000-0000-0000-000000000001');

-- Liquidaciones (2 niveles) + pagos
INSERT INTO settlements (id, organization_id, payee_type, crew_id, period_start, period_end, total_amount, status) VALUES
  ('55c00001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'crew', 'c50000ff-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 79200, 'pending')
ON CONFLICT (id) DO NOTHING;
INSERT INTO settlements (id, organization_id, payee_type, worker_id, period_start, period_end, total_amount, status) VALUES
  ('55a00001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'worker', 'aa0000fd-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 26400, 'paid'),
  ('55a00002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'worker', 'aa0000fc-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 22800, 'partial'),
  ('55a00003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='sur-berries'), 'worker', 'aa0000fb-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 30000, 'pending')
ON CONFLICT (id) DO NOTHING;
INSERT INTO payments (organization_id, settlement_id, worker_id, amount, notes) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), '55a00001-0000-0000-0000-000000000001', 'aa0000fd-0000-0000-0000-000000000001', 26400, 'Pago total temporada frutilla'),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), '55a00002-0000-0000-0000-000000000001', 'aa0000fc-0000-0000-0000-000000000001', 10000, 'Adelanto parcial')
ON CONFLICT DO NOTHING;
INSERT INTO payments (organization_id, settlement_id, crew_id, amount, notes) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), '55c00001-0000-0000-0000-000000000001', 'c50000ff-0000-0000-0000-000000000001', 50000, 'Pago al encargado Roberto Fuentes')
ON CONFLICT DO NOTHING;
UPDATE settlements SET status = 'partial' WHERE id = '55c00001-0000-0000-0000-000000000001';

-- ============================================================
-- TENANT 2: Andes Fruit SpA (capataz, SIN melgas)
-- ============================================================
INSERT INTO organizations (id, name, slug, subscription_status, subscription_plan, status, crew_mode_enabled, rows_enabled, brand_primary_color, brand_secondary_color) VALUES
  ('0a000003-0000-0000-0000-000000000001', 'Andes Fruit SpA', 'andes-fruit', 'active', 'Pro', 'active', true, false, '#0369a1', '#65a30d')
ON CONFLICT (slug) DO UPDATE SET crew_mode_enabled = EXCLUDED.crew_mode_enabled, rows_enabled = EXCLUDED.rows_enabled;

INSERT INTO workers (id, organization_id, full_name, national_id, phone, role, status, qr_badge_url) VALUES
  ('ab0000ff-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Admin Andes Fruit', '21.111.111-1', '+56977777771', 'admin', 'active', 'badge-and-admin-001'),
  ('ab0000fa-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Jorge Herrera', '21.999.999-9', '+56977777779', 'supervisor', 'active', 'badge-and-supervisor-001'),
  ('ab0000fe-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Marcela Díaz (Capataz)', '21.222.222-2', '+56977777772', 'crew_lead', 'active', 'badge-and-lead-001'),
  ('ab0000fd-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Tomás Vega', '21.333.333-3', '+56977777773', 'worker', 'active', 'badge-and-worker-001'),
  ('ab0000fc-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Valentina Muñoz', '21.444.444-4', '+56977777774', 'worker', 'active', 'badge-and-worker-002'),
  ('ab0000fb-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Ignacio Bravo', '21.555.555-5', '+56977777775', 'worker', 'active', 'badge-and-worker-003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, organization_id, name, unit_measure, status) VALUES
  ('bb0000ee-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Cereza', 'kg', 'active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO rates (id, organization_id, product_id, amount, effective_from, status) VALUES
  ('cc0000ee-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'bb0000ee-0000-0000-0000-000000000001', 2100, now(), 'current')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fields (id, organization_id, name, location, total_area, status, crew_mode_enabled, rows_enabled) VALUES
  ('dd0000ee-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'Fundo Cordillera', 'Los Andes, Valparaíso', 30.0, 'active', NULL, NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO blocks (id, organization_id, field_id, product_id, name, area, status) VALUES
  ('ee0000ee-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'dd0000ee-0000-0000-0000-000000000001', 'bb0000ee-0000-0000-0000-000000000001', 'Cuartel C1 - Cerezas', 15.0, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crews (id, organization_id, crew_lead_id, supervisor_id, name, status) VALUES
  ('c50000ee-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fe-0000-0000-0000-000000000001', 'ab0000fa-0000-0000-0000-000000000001', 'Furgón Cordillera', 'active')
ON CONFLICT (id) DO NOTHING;

UPDATE workers SET crew_id = 'c50000ee-0000-0000-0000-000000000001'
  WHERE id IN ('ab0000fd-0000-0000-0000-000000000001','ab0000fc-0000-0000-0000-000000000001','ab0000fb-0000-0000-0000-000000000001');

INSERT INTO supervisor_assignments (organization_id, supervisor_id, worker_id) VALUES
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fa-0000-0000-0000-000000000001', 'ab0000fd-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fa-0000-0000-0000-000000000001', 'ab0000fc-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fa-0000-0000-0000-000000000001', 'ab0000fb-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
INSERT INTO supervisor_assignments (organization_id, supervisor_id, block_id) VALUES
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fa-0000-0000-0000-000000000001', 'ee0000ee-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO day_roster (id, organization_id, work_day, worker_id, lead_id, crew_id, added_by) VALUES
  ('d6000001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), org_workday((SELECT id FROM organizations WHERE slug='andes-fruit')), 'ab0000fd-0000-0000-0000-000000000001', 'ab0000fe-0000-0000-0000-000000000001', 'c50000ee-0000-0000-0000-000000000001', 'ab0000fe-0000-0000-0000-000000000001'),
  ('d6000002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), org_workday((SELECT id FROM organizations WHERE slug='andes-fruit')), 'ab0000fc-0000-0000-0000-000000000001', 'ab0000fe-0000-0000-0000-000000000001', 'c50000ee-0000-0000-0000-000000000001', 'ab0000fe-0000-0000-0000-000000000001'),
  ('d6000003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), org_workday((SELECT id FROM organizations WHERE slug='andes-fruit')), 'ab0000fb-0000-0000-0000-000000000001', 'ab0000fe-0000-0000-0000-000000000001', 'c50000ee-0000-0000-0000-000000000001', 'ab0000fe-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- HISTORIAL 30 días (sin melgas: row_id NULL)
INSERT INTO picking_records (organization_id, worker_id, block_id, quantity, rate_amount_snapshot, work_day, recorded_at, recorded_by)
SELECT
  (SELECT id FROM organizations WHERE slug='andes-fruit'),
  w.worker_id,
  'ee0000ee-0000-0000-0000-000000000001',
  (10 + (random()*15)::int)::numeric,
  2100,
  d::date,
  d::timestamptz + interval '16 hours',
  'ab0000fe-0000-0000-0000-000000000001'
FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, interval '1 day') d
CROSS JOIN (VALUES
  ('ab0000fd-0000-0000-0000-000000000001'::uuid),
  ('ab0000fc-0000-0000-0000-000000000001'::uuid),
  ('ab0000fb-0000-0000-0000-000000000001'::uuid)
) AS w(worker_id);

-- Picking de HOY
INSERT INTO picking_records (organization_id, worker_id, block_id, quantity, rate_amount_snapshot, work_day, recorded_by, day_roster_id) VALUES
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fd-0000-0000-0000-000000000001', 'ee0000ee-0000-0000-0000-000000000001', 14, 2100, org_workday((SELECT id FROM organizations WHERE slug='andes-fruit')), 'ab0000fe-0000-0000-0000-000000000001', 'd6000001-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fc-0000-0000-0000-000000000001', 'ee0000ee-0000-0000-0000-000000000001', 17, 2100, org_workday((SELECT id FROM organizations WHERE slug='andes-fruit')), 'ab0000fe-0000-0000-0000-000000000001', 'd6000002-0000-0000-0000-000000000001'),
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'ab0000fb-0000-0000-0000-000000000001', 'ee0000ee-0000-0000-0000-000000000001', 12, 2100, org_workday((SELECT id FROM organizations WHERE slug='andes-fruit')), 'ab0000fe-0000-0000-0000-000000000001', 'd6000003-0000-0000-0000-000000000001');

-- Liquidaciones + pagos (Andes)
INSERT INTO settlements (id, organization_id, payee_type, crew_id, period_start, period_end, total_amount, status) VALUES
  ('56c00001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'crew', 'c50000ee-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 90300, 'pending')
ON CONFLICT (id) DO NOTHING;
INSERT INTO settlements (id, organization_id, payee_type, worker_id, period_start, period_end, total_amount, status) VALUES
  ('56a00001-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'worker', 'ab0000fd-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 29400, 'pending'),
  ('56a00002-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'worker', 'ab0000fc-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 35700, 'paid'),
  ('56a00003-0000-0000-0000-000000000001', (SELECT id FROM organizations WHERE slug='andes-fruit'), 'worker', 'ab0000fb-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_DATE, 25200, 'partial')
ON CONFLICT (id) DO NOTHING;
INSERT INTO payments (organization_id, settlement_id, worker_id, amount, notes) VALUES
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), '56a00002-0000-0000-0000-000000000001', 'ab0000fc-0000-0000-0000-000000000001', 35700, 'Pago total'),
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), '56a00003-0000-0000-0000-000000000001', 'ab0000fb-0000-0000-0000-000000000001', 12000, 'Adelanto')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FEATURE FLAGS (catálogo global) + overrides
-- ============================================================
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('bluetooth_scale', 'Báscula Bluetooth', 'Lectura de peso directa desde balanzas Bluetooth en faena, sin tipeo manual.', 'cosecha', 'org_override', false),
  ('offline_sync', 'Sincronización Offline', 'Cola de mutaciones persistida en el dispositivo con reconexión resiliente.', 'infraestructura', 'org_override', true),
  ('ai_yield_prediction', 'Predicción de Rendimiento (IA)', 'Proyección de recolección basada en datos históricos y curvas de maduración.', 'analitica', 'org_override', false),
  ('advanced_metrics', 'Métricas Avanzadas', 'Dashboard de analítica extendida y rankings de productividad.', 'analitica', 'org_override', false),
  ('disable_pdf_export', 'Kill-Switch: Exportación PDF', 'Interruptor de emergencia que detiene la generación de PDFs pesados en picos de carga.', 'infraestructura', 'kill_switch', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO organization_feature_flags (organization_id, flag_key, enabled) VALUES
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'bluetooth_scale', true),
  ((SELECT id FROM organizations WHERE slug='sur-berries'), 'ai_yield_prediction', true),
  ((SELECT id FROM organizations WHERE slug='andes-fruit'), 'advanced_metrics', true)
ON CONFLICT (organization_id, flag_key) DO NOTHING;

COMMIT;
