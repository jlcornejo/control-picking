-- ============================================================
-- DATOS DE DEMO (temporal) — sur-berries: historia de 7 días con
-- rosters diarios rotativos, 2 capataces, varios paños/campos.
-- Ejecutar contra la BD local. Idempotente (ON CONFLICT DO NOTHING).
-- IDs con prefijo 'de......' para identificarlos/limpiarlos fácil.
-- ============================================================
BEGIN;

-- ---- Producto y tarifa: Arándano (para variar "producción por paño") ----
INSERT INTO products (id, organization_id, name, unit_measure, status) VALUES
  ('de000001-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'Arándano', 'box', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rates (id, organization_id, product_id, amount, effective_from, status) VALUES
  ('de000002-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'de000001-0000-0000-0000-000000000001', 1500, now(), 'current')
ON CONFLICT (id) DO NOTHING;

-- ---- 2º campo + paños nuevos ----
INSERT INTO fields (id, organization_id, name, location, total_area, status, crew_mode_enabled) VALUES
  ('de000010-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'Fundo El Roble', 'Los Ángeles, Biobío', 22.0, 'active', NULL)
ON CONFLICT (id) DO NOTHING;

-- Paño extra de frutilla en Los Maitenes + paño de arándano en El Roble
INSERT INTO blocks (id, organization_id, field_id, product_id, name, area, status) VALUES
  ('de000020-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'dd0000ff-0000-0000-0000-000000000001', 'bb0000ff-0000-0000-0000-000000000001', 'Paño F2 - Frutillas', 7.5, 'active'),
  ('de000021-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'de000010-0000-0000-0000-000000000001', 'de000001-0000-0000-0000-000000000001', 'Paño R1 - Arándanos', 10.0, 'active')
ON CONFLICT (id) DO NOTHING;

-- ---- 2º capataz + su cuadrilla ----
INSERT INTO workers (id, organization_id, full_name, national_id, phone, role, status, qr_badge_url) VALUES
  ('de0000fe-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'Miguel Araya (Capataz)', '21.222.333-4', '+56977777771', 'crew_lead', 'active', 'badge-sur-lead-002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crews (id, organization_id, crew_lead_id, supervisor_id, name, status) VALUES
  ('de5000ff-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'de0000fe-0000-0000-0000-000000000001', 'aa0000fa-0000-0000-0000-000000000001', 'Furgón Sur', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---- 3 trabajadores nuevos (cuadrilla base = Furgón Sur) ----
INSERT INTO workers (id, organization_id, full_name, national_id, phone, role, status, qr_badge_url, crew_id) VALUES
  ('de0000d1-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'Aurora Vega', '21.333.444-5', '+56977777772', 'worker', 'active', 'badge-sur-worker-004', 'de5000ff-0000-0000-0000-000000000001'),
  ('de0000d2-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'Benito Cruz', '21.444.555-6', '+56977777773', 'worker', 'active', 'badge-sur-worker-005', 'de5000ff-0000-0000-0000-000000000001'),
  ('de0000d3-0000-0000-0000-000000000001', '0a000002-0000-0000-0000-000000000001', 'Catalina Díaz', '21.555.666-7', '+56977777774', 'worker', 'active', 'badge-sur-worker-006', 'de5000ff-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ROSTERS DIARIOS ROTATIVOS + PRODUCCIÓN (7 días: 09-06 a 09-12)
-- Roberto = aa0000fe (Furgón Norte c50000ff) | Miguel = de0000fe (Furgón Sur de5000ff)
-- Trabajadores:
--   Camila  aa0000fd | Diego   aa0000fc | Fernanda aa0000fb  (base Norte)
--   Aurora  de0000d1 | Benito  de0000d2 | Catalina de0000d3  (base Sur)
-- La gracia: rotan entre capataces según el día (mezcla real de terreno).
-- Cada picking congela su day_roster_id. Paños:
--   F1 ee0000ff (frutilla 1200) | F2 de000020 (frutilla 1200) | R1 de000021 (arándano 1500)
-- Se usa una función auxiliar local para insertar roster+picking de forma compacta.
-- ============================================================

-- Helper temporal: agrega (roster + un picking) para un día/worker/lead/crew/block/qty/rate
CREATE OR REPLACE FUNCTION pg_temp.demo_add(
  p_day date, p_worker uuid, p_lead uuid, p_crew uuid, p_block uuid, p_qty numeric, p_rate numeric
) RETURNS void AS $$
DECLARE v_roster uuid;
BEGIN
  INSERT INTO day_roster (organization_id, work_day, worker_id, lead_id, crew_id, added_by)
  VALUES ('0a000002-0000-0000-0000-000000000001', p_day, p_worker, p_lead, p_crew, p_lead)
  ON CONFLICT (organization_id, work_day, worker_id) DO UPDATE SET lead_id = EXCLUDED.lead_id
  RETURNING id INTO v_roster;

  IF v_roster IS NULL THEN
    SELECT id INTO v_roster FROM day_roster
    WHERE organization_id='0a000002-0000-0000-0000-000000000001' AND work_day=p_day AND worker_id=p_worker;
  END IF;

  INSERT INTO picking_records (organization_id, worker_id, block_id, quantity, rate_amount_snapshot, work_day, recorded_by, day_roster_id)
  VALUES ('0a000002-0000-0000-0000-000000000001', p_worker, p_block, p_qty, p_rate, p_day, p_lead, v_roster);
END;
$$ LANGUAGE plpgsql;

-- ---- Día 2026-09-06: Norte (Camila, Diego) frutilla F1 | Sur (Aurora, Benito) arándano R1 ----
SELECT pg_temp.demo_add('2026-09-06','aa0000fd-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',20,1200);
SELECT pg_temp.demo_add('2026-09-06','aa0000fc-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',18,1200);
SELECT pg_temp.demo_add('2026-09-06','de0000d1-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',12,1500);
SELECT pg_temp.demo_add('2026-09-06','de0000d2-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',15,1500);

-- ---- Día 2026-09-07: MEZCLA — Fernanda va con Miguel (Sur); Aurora va con Roberto (Norte) ----
SELECT pg_temp.demo_add('2026-09-07','aa0000fb-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',22,1500);
SELECT pg_temp.demo_add('2026-09-07','de0000d1-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','de000020-0000-0000-0000-000000000001',17,1200);
SELECT pg_temp.demo_add('2026-09-07','aa0000fd-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',21,1200);
SELECT pg_temp.demo_add('2026-09-07','de0000d3-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',19,1500);

-- ---- Día 2026-09-08: Norte grande (4 trabajadores) | Sur (Benito) ----
SELECT pg_temp.demo_add('2026-09-08','aa0000fd-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',24,1200);
SELECT pg_temp.demo_add('2026-09-08','aa0000fc-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','de000020-0000-0000-0000-000000000001',16,1200);
SELECT pg_temp.demo_add('2026-09-08','aa0000fb-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',23,1200);
SELECT pg_temp.demo_add('2026-09-08','de0000d3-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',14,1200);
SELECT pg_temp.demo_add('2026-09-08','de0000d2-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',20,1500);

-- ---- Día 2026-09-09: (ya existe producción Norte original del seed; agregamos Sur) ----
SELECT pg_temp.demo_add('2026-09-09','de0000d1-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',18,1500);
SELECT pg_temp.demo_add('2026-09-09','de0000d2-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',21,1500);

-- ---- Día 2026-09-10: MEZCLA — Diego con Miguel; Catalina con Roberto ----
SELECT pg_temp.demo_add('2026-09-10','aa0000fc-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',17,1500);
SELECT pg_temp.demo_add('2026-09-10','de0000d3-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',20,1200);
SELECT pg_temp.demo_add('2026-09-10','aa0000fd-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','de000020-0000-0000-0000-000000000001',22,1200);
SELECT pg_temp.demo_add('2026-09-10','de0000d1-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',16,1500);

-- ---- Día 2026-09-11: ambos equipos ----
SELECT pg_temp.demo_add('2026-09-11','aa0000fb-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',25,1200);
SELECT pg_temp.demo_add('2026-09-11','aa0000fc-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',19,1200);
SELECT pg_temp.demo_add('2026-09-11','de0000d2-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',23,1500);
SELECT pg_temp.demo_add('2026-09-11','de0000d3-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',18,1500);

-- ---- Día 2026-09-12 (HOY): equipo mezclado en ambos capataces ----
SELECT pg_temp.demo_add('2026-09-12','aa0000fd-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','ee0000ff-0000-0000-0000-000000000001',26,1200);
SELECT pg_temp.demo_add('2026-09-12','de0000d1-0000-0000-0000-000000000001','aa0000fe-0000-0000-0000-000000000001','c50000ff-0000-0000-0000-000000000001','de000020-0000-0000-0000-000000000001',15,1200);
SELECT pg_temp.demo_add('2026-09-12','aa0000fc-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',20,1500);
SELECT pg_temp.demo_add('2026-09-12','de0000d3-0000-0000-0000-000000000001','de0000fe-0000-0000-0000-000000000001','de5000ff-0000-0000-0000-000000000001','de000021-0000-0000-0000-000000000001',22,1500);

COMMIT;
