-- ============================================================
-- FASE 3b: Jerarquía supervisor→encargado y pago campo→encargado
-- ============================================================
-- Cambios de modelo:
--   1. crews.supervisor_id: cuando el Modo Capataz está activo, el Encargado
--      queda a cargo de un Supervisor (admin -> supervisor -> encargado ->
--      trabajadores). Un supervisor puede tener varias cuadrillas; una
--      cuadrilla pertenece a un solo supervisor.
--   2. payments ahora puede registrar el pago del campo al Encargado, es decir
--      un pago contra una liquidación de cuadrilla (payee_type='crew'). Para eso
--      worker_id pasa a ser opcional y se agrega crew_id (XOR con worker_id).
--
--      Con esto la responsabilidad del campo se cumple al pagar al Encargado.
--      El pago del Encargado a sus trabajadores (nivel 2) sigue disponible pero
--      es OPCIONAL: usa payments con worker_id (comportamiento previo).
-- ============================================================

-- ------------------------------------------------------------
-- 1. crews.supervisor_id
-- ------------------------------------------------------------
ALTER TABLE crews ADD COLUMN supervisor_id UUID;

-- Integridad de tenant: el supervisor debe pertenecer a la misma organización
ALTER TABLE crews ADD CONSTRAINT fk_crews_supervisor_org
  FOREIGN KEY (supervisor_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX idx_crews_supervisor ON crews (supervisor_id);

COMMENT ON COLUMN crews.supervisor_id IS 'Supervisor a cargo del Encargado de esta cuadrilla (jerarquía admin>supervisor>encargado>trabajador). NULL si aún no se asigna.';

-- ------------------------------------------------------------
-- 2. payments: soportar pago a cuadrilla (campo -> encargado)
-- ------------------------------------------------------------
-- worker_id deja de ser obligatorio: un pago puede ser a un trabajador
-- (worker_id) o a una cuadrilla/encargado (crew_id).
ALTER TABLE payments ALTER COLUMN worker_id DROP NOT NULL;

ALTER TABLE payments ADD COLUMN crew_id UUID;

-- FK compuesta de tenant para crew_id (la cuadrilla debe ser de la misma org)
ALTER TABLE payments ADD CONSTRAINT fk_payments_crew_org
  FOREIGN KEY (crew_id, organization_id) REFERENCES crews (id, organization_id) ON DELETE RESTRICT;

-- Consistencia: un pago es a worker XOR a crew (exactamente uno)
ALTER TABLE payments ADD CONSTRAINT chk_payment_payee CHECK (
  (worker_id IS NOT NULL AND crew_id IS NULL) OR
  (worker_id IS NULL AND crew_id IS NOT NULL)
);

CREATE INDEX idx_payments_crew ON payments (crew_id);

COMMENT ON COLUMN payments.crew_id IS 'Cuadrilla pagada cuando el pago es del campo al Encargado (contra una liquidación payee_type=crew). XOR con worker_id.';
COMMENT ON COLUMN payments.worker_id IS 'Trabajador pagado (pago individual). NULL cuando el pago es a una cuadrilla (crew_id set).';
