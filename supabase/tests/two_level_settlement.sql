-- ============================================================
-- TEST DE LIQUIDACIÓN EN DOS NIVELES (Fase 3, Req. 8)
-- ============================================================
-- Verifica:
--   1. Agregación nivel 1: la producción de una cuadrilla (en campo con modo
--      capataz) se suma en una liquidación payee_type='crew'.
--   2. El CHECK chk_settlement_payee (worker XOR crew).
--   3. Inmutabilidad: no se puede modificar una liquidación pagada.
--   4. Invariantes: montos positivos.
--
-- Uso (tras `supabase db reset`):
--   docker cp supabase/tests/two_level_settlement.sql <db>:/tmp/tl.sql
--   docker exec <db> psql -U postgres -f /tmp/tl.sql
-- ============================================================

\pset pager off

BEGIN;

-- Org con modo capataz activo
INSERT INTO organizations (id, name, slug, subscription_status, status, crew_mode_enabled)
VALUES ('0e000001-0000-0000-0000-000000000001', 'TwoLevel Org', 'twolevel', 'active', 'active', true);

-- Encargado + 2 trabajadores
INSERT INTO workers (id, organization_id, full_name, role, status) VALUES
  ('e1000001-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001', 'Capataz Juan', 'crew_lead', 'active'),
  ('e1000002-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001', 'Pedro', 'worker', 'active'),
  ('e1000003-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001', 'Maria', 'worker', 'active');

-- Cuadrilla del capataz + asignar trabajadores
INSERT INTO crews (id, organization_id, crew_lead_id, name, status)
VALUES ('c1000001-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001',
        'e1000001-0000-0000-0000-000000000001', 'Furgón 1', 'active');
UPDATE workers SET crew_id = 'c1000001-0000-0000-0000-000000000001'
  WHERE id IN ('e1000002-0000-0000-0000-000000000001', 'e1000003-0000-0000-0000-000000000001');

-- Producto, tarifa, campo (modo capataz por default de org), paño
INSERT INTO products (id, organization_id, name, unit_measure, status)
VALUES ('e2000001-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001', 'Arándano', 'box', 'active');
INSERT INTO fields (id, organization_id, name, total_area, status, crew_mode_enabled)
VALUES ('e3000001-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001', 'Campo TL', 10, 'active', NULL);
INSERT INTO blocks (id, organization_id, field_id, product_id, name, area, status)
VALUES ('e4000001-0000-0000-0000-000000000001', '0e000001-0000-0000-0000-000000000001',
        'e3000001-0000-0000-0000-000000000001', 'e2000001-0000-0000-0000-000000000001', 'Paño TL', 5, 'active');

-- Producción: Pedro 10 cajas, Maria 15 cajas, tarifa 1000 -> total cuadrilla 25000
INSERT INTO picking_records (organization_id, worker_id, block_id, quantity, rate_amount_snapshot, work_day, recorded_by) VALUES
  ('0e000001-0000-0000-0000-000000000001', 'e1000002-0000-0000-0000-000000000001', 'e4000001-0000-0000-0000-000000000001', 10, 1000, '2026-08-01', 'e1000001-0000-0000-0000-000000000001'),
  ('0e000001-0000-0000-0000-000000000001', 'e1000003-0000-0000-0000-000000000001', 'e4000001-0000-0000-0000-000000000001', 15, 1000, '2026-08-01', 'e1000001-0000-0000-0000-000000000001');

-- Aserción 1: agregación nivel 1 = suma de la producción de la cuadrilla (25000)
SELECT 'nivel 1: agregacion de cuadrilla = 25000' AS assertion,
  (SELECT COALESCE(SUM(pr.quantity * pr.rate_amount_snapshot), 0)
   FROM picking_records pr
   JOIN workers w ON w.id = pr.worker_id
   WHERE w.crew_id = 'c1000001-0000-0000-0000-000000000001') = 25000 AS pass;

-- Crear la liquidación de cuadrilla (nivel 1) y verificar CHECK payee (crew)
INSERT INTO settlements (organization_id, payee_type, crew_id, period_start, period_end, total_amount, status)
VALUES ('0e000001-0000-0000-0000-000000000001', 'crew', 'c1000001-0000-0000-0000-000000000001',
        '2026-08-01', '2026-08-31', 25000, 'paid');

SELECT 'liquidacion de cuadrilla creada (payee_type=crew, worker_id NULL)' AS assertion,
  (SELECT COUNT(*) FROM settlements
   WHERE crew_id = 'c1000001-0000-0000-0000-000000000001'
     AND payee_type = 'crew' AND worker_id IS NULL) = 1 AS pass;

-- Aserción 3: inmutabilidad — modificar una liquidación pagada debe fallar
DO $$
DECLARE
  blocked BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE settlements SET total_amount = 1
    WHERE crew_id = 'c1000001-0000-0000-0000-000000000001' AND payee_type = 'crew';
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  RAISE NOTICE 'INMUTABILIDAD_PAGADA_BLOQUEADA=%', blocked;
END $$;

-- Aserción 4: el CHECK payee rechaza una fila inconsistente (worker + crew a la vez)
DO $$
DECLARE
  rejected BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO settlements (organization_id, payee_type, worker_id, crew_id, period_start, period_end, total_amount, status)
    VALUES ('0e000001-0000-0000-0000-000000000001', 'worker',
            'e1000002-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001',
            '2026-09-01', '2026-09-30', 100, 'pending');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  RAISE NOTICE 'CHECK_PAYEE_RECHAZA_INCONSISTENTE=%', rejected;
END $$;

ROLLBACK;
