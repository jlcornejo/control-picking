-- ============================================================
-- FASE 3: Liquidación en dos niveles (payee: worker | crew)
-- ============================================================
-- settlements ahora puede liquidar a:
--   - un trabajador individual (payee_type='worker', worker_id set)  [comportamiento actual]
--   - una cuadrilla, a nombre del encargado (payee_type='crew', crew_id set) [nivel 1: cliente->encargado]
-- El pago del encargado a sus trabajadores (nivel 2) usa settlements
-- payee_type='worker' de los miembros de su cuadrilla.
-- ============================================================

CREATE TYPE settlement_payee_type AS ENUM ('worker', 'crew');

-- Nuevas columnas
ALTER TABLE settlements ADD COLUMN payee_type settlement_payee_type NOT NULL DEFAULT 'worker';
ALTER TABLE settlements ADD COLUMN crew_id UUID REFERENCES crews(id) ON DELETE RESTRICT;

-- FK compuesta de tenant para crew_id (la cuadrilla debe ser de la misma org)
ALTER TABLE settlements ADD CONSTRAINT fk_settlements_crew_org
  FOREIGN KEY (crew_id, organization_id) REFERENCES crews (id, organization_id) ON DELETE RESTRICT;

-- worker_id pasa a ser opcional (NULL cuando payee_type='crew')
ALTER TABLE settlements ALTER COLUMN worker_id DROP NOT NULL;

-- Consistencia payee: worker XOR crew
ALTER TABLE settlements ADD CONSTRAINT chk_settlement_payee CHECK (
  (payee_type = 'worker' AND worker_id IS NOT NULL AND crew_id IS NULL) OR
  (payee_type = 'crew'   AND crew_id  IS NOT NULL AND worker_id IS NULL)
);

-- La antigua unique (worker_id, period_start, period_end) ya no cubre el caso crew
-- y worker_id nullable la vuelve inconsistente. Se reemplaza por dos índices
-- únicos parciales, uno por tipo de payee.
ALTER TABLE settlements DROP CONSTRAINT uq_settlement_worker_period;

CREATE UNIQUE INDEX uq_settlement_worker_period
  ON settlements (worker_id, period_start, period_end)
  WHERE payee_type = 'worker';

CREATE UNIQUE INDEX uq_settlement_crew_period
  ON settlements (crew_id, period_start, period_end)
  WHERE payee_type = 'crew';

CREATE INDEX idx_settlements_crew ON settlements (crew_id);

COMMENT ON COLUMN settlements.payee_type IS 'Sujeto de pago: worker (individual) o crew (cuadrilla, a nombre del encargado).';
COMMENT ON COLUMN settlements.crew_id IS 'Cuadrilla liquidada cuando payee_type=crew (nivel 1: cliente->encargado).';
