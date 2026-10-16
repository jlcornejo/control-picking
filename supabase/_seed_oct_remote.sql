-- ============================================================
-- SEED OCTUBRE 2026 (remoto fundo360) — datos de prueba del mes en curso
-- ============================================================
-- Objetivo: poblar octubre (1 .. 16 oct 2026) para probar métricas,
-- tendencias, liquidaciones y pagos con datos del período actual.
--
-- Tenants: sur-berries (con melgas) y andes-fruit (sin melgas).
-- Idempotente: borra primero picking/settlements/payments de OCTUBRE 2026
-- de estos dos tenants y reinserta limpio (evita duplicados del seed de 30 días).
--
-- Ambiente de PRUEBAS. Ejecutar contra el remoto vía:
--   source scripts/.env.remote
--   npx supabase db query --db-url "$REMOTE_DB_CONN" < supabase/_seed_oct_remote.sql
-- ============================================================

BEGIN;

-- IDs de referencia (del _seed_remote.sql):
--   sur-berries: block ee0000ff..., melgas f0000001/2/3, crew c50000ff...,
--     capataz aa0000fe, workers Camila aa0000fd / Diego aa0000fc / Fernanda aa0000fb, rate 1200
--   andes-fruit: block ee0000ee..., crew c50000ee..., capataz ab0000fe,
--     workers Tomás ab0000fd / Valentina ab0000fc / Ignacio ab0000fb, rate 2100

-- ------------------------------------------------------------
-- 0) LIMPIEZA de octubre 2026 (solo estos dos tenants)
-- ------------------------------------------------------------
DELETE FROM payments p USING settlements s
  WHERE p.settlement_id = s.id
    AND s.organization_id IN (SELECT id FROM organizations WHERE slug IN ('sur-berries','andes-fruit'))
    AND s.period_start >= '2026-10-01' AND s.period_start <= '2026-10-31';

DELETE FROM settlements
  WHERE organization_id IN (SELECT id FROM organizations WHERE slug IN ('sur-berries','andes-fruit'))
    AND period_start >= '2026-10-01' AND period_start <= '2026-10-31';

DELETE FROM picking_records
  WHERE organization_id IN (SELECT id FROM organizations WHERE slug IN ('sur-berries','andes-fruit'))
    AND work_day >= '2026-10-01' AND work_day <= '2026-10-31';

-- ------------------------------------------------------------
-- 1) PICKING diario 1..16 oct — sur-berries (con melgas rotativas)
--    quantity > 0 siempre (15..35 cajas). payment_unit='box'.
-- ------------------------------------------------------------
INSERT INTO picking_records
  (organization_id, worker_id, block_id, row_id, quantity, rate_amount_snapshot,
   work_day, recorded_at, recorded_by, payment_unit, out_of_tolerance)
SELECT
  (SELECT id FROM organizations WHERE slug='sur-berries'),
  w.worker_id,
  'ee0000ff-0000-0000-0000-000000000001',
  w.row_id,
  (15 + (random()*20)::int)::numeric,
  1200,
  d::date,
  d::timestamptz + interval '15 hours',
  'aa0000fe-0000-0000-0000-000000000001',
  'box',
  false
FROM generate_series('2026-10-01'::date, '2026-10-16'::date, interval '1 day') d
CROSS JOIN (VALUES
  ('aa0000fd-0000-0000-0000-000000000001'::uuid, 'f0000001-0000-0000-0000-000000000001'::uuid),
  ('aa0000fc-0000-0000-0000-000000000001'::uuid, 'f0000002-0000-0000-0000-000000000001'::uuid),
  ('aa0000fb-0000-0000-0000-000000000001'::uuid, 'f0000003-0000-0000-0000-000000000001'::uuid)
) AS w(worker_id, row_id);

-- ------------------------------------------------------------
-- 2) PICKING diario 1..16 oct — andes-fruit (sin melgas: row_id NULL)
--    quantity > 0 (10..25 cajas). rate 2100.
-- ------------------------------------------------------------
INSERT INTO picking_records
  (organization_id, worker_id, block_id, quantity, rate_amount_snapshot,
   work_day, recorded_at, recorded_by, payment_unit, out_of_tolerance)
SELECT
  (SELECT id FROM organizations WHERE slug='andes-fruit'),
  w.worker_id,
  'ee0000ee-0000-0000-0000-000000000001',
  (10 + (random()*15)::int)::numeric,
  2100,
  d::date,
  d::timestamptz + interval '16 hours',
  'ab0000fe-0000-0000-0000-000000000001',
  'box',
  false
FROM generate_series('2026-10-01'::date, '2026-10-16'::date, interval '1 day') d
CROSS JOIN (VALUES
  ('ab0000fd-0000-0000-0000-000000000001'::uuid),
  ('ab0000fc-0000-0000-0000-000000000001'::uuid),
  ('ab0000fb-0000-0000-0000-000000000001'::uuid)
) AS w(worker_id);

-- ------------------------------------------------------------
-- 3) LIQUIDACIONES quincenales (período 1..15 oct) — sur-berries
--    total_amount = sum(quantity)*rate del período, por worker. Estados mixtos.
-- ------------------------------------------------------------
-- Nivel trabajador
INSERT INTO settlements (organization_id, payee_type, worker_id, period_start, period_end, total_amount, status)
SELECT
  (SELECT id FROM organizations WHERE slug='sur-berries'),
  'worker', pr.worker_id, '2026-10-01', '2026-10-15',
  SUM(pr.quantity * pr.rate_amount_snapshot),
  (ARRAY['paid','partial','pending'])[1 + (row_number() OVER (ORDER BY pr.worker_id) - 1) % 3]::settlement_status
FROM picking_records pr
WHERE pr.organization_id = (SELECT id FROM organizations WHERE slug='sur-berries')
  AND pr.work_day BETWEEN '2026-10-01' AND '2026-10-15'
GROUP BY pr.worker_id;

-- Nivel cuadrilla (campo -> encargado): suma de todo el equipo del período
INSERT INTO settlements (organization_id, payee_type, crew_id, period_start, period_end, total_amount, status)
SELECT
  (SELECT id FROM organizations WHERE slug='sur-berries'),
  'crew', 'c50000ff-0000-0000-0000-000000000001', '2026-10-01', '2026-10-15',
  SUM(pr.quantity * pr.rate_amount_snapshot), 'partial'::settlement_status
FROM picking_records pr
WHERE pr.organization_id = (SELECT id FROM organizations WHERE slug='sur-berries')
  AND pr.work_day BETWEEN '2026-10-01' AND '2026-10-15';

-- ------------------------------------------------------------
-- 4) LIQUIDACIONES quincenales — andes-fruit
-- ------------------------------------------------------------
INSERT INTO settlements (organization_id, payee_type, worker_id, period_start, period_end, total_amount, status)
SELECT
  (SELECT id FROM organizations WHERE slug='andes-fruit'),
  'worker', pr.worker_id, '2026-10-01', '2026-10-15',
  SUM(pr.quantity * pr.rate_amount_snapshot),
  (ARRAY['pending','paid','partial'])[1 + (row_number() OVER (ORDER BY pr.worker_id) - 1) % 3]::settlement_status
FROM picking_records pr
WHERE pr.organization_id = (SELECT id FROM organizations WHERE slug='andes-fruit')
  AND pr.work_day BETWEEN '2026-10-01' AND '2026-10-15'
GROUP BY pr.worker_id;

INSERT INTO settlements (organization_id, payee_type, crew_id, period_start, period_end, total_amount, status)
SELECT
  (SELECT id FROM organizations WHERE slug='andes-fruit'),
  'crew', 'c50000ee-0000-0000-0000-000000000001', '2026-10-01', '2026-10-15',
  SUM(pr.quantity * pr.rate_amount_snapshot), 'pending'::settlement_status
FROM picking_records pr
WHERE pr.organization_id = (SELECT id FROM organizations WHERE slug='andes-fruit')
  AND pr.work_day BETWEEN '2026-10-01' AND '2026-10-15';

-- ------------------------------------------------------------
-- 5) PAGOS: para liquidaciones 'paid' (pago total) y 'partial' (adelanto)
--    partial => adelanto < total (coherente con estado parcial).
-- ------------------------------------------------------------
-- Pagos a trabajadores (ambos tenants)
INSERT INTO payments (organization_id, settlement_id, worker_id, amount, notes)
SELECT s.organization_id, s.id, s.worker_id,
  CASE WHEN s.status = 'paid' THEN s.total_amount
       ELSE round(s.total_amount * 0.4) END,
  CASE WHEN s.status = 'paid' THEN 'Pago total quincena 1-15 oct'
       ELSE 'Adelanto parcial quincena 1-15 oct' END
FROM settlements s
WHERE s.organization_id IN (SELECT id FROM organizations WHERE slug IN ('sur-berries','andes-fruit'))
  AND s.period_start = '2026-10-01' AND s.payee_type = 'worker'
  AND s.status IN ('paid','partial');

-- Pago a cuadrilla sur-berries (partial -> adelanto al encargado)
INSERT INTO payments (organization_id, settlement_id, crew_id, amount, notes)
SELECT s.organization_id, s.id, s.crew_id, round(s.total_amount * 0.5),
  'Adelanto al encargado — quincena 1-15 oct'
FROM settlements s
WHERE s.organization_id = (SELECT id FROM organizations WHERE slug='sur-berries')
  AND s.period_start = '2026-10-01' AND s.payee_type = 'crew' AND s.status = 'partial';

COMMIT;
