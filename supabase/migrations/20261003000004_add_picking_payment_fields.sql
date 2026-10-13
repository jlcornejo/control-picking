-- ============================================================
-- UNIDAD DE PAGO + KILOS PAGABLES EN PICKING (payment_unit, paid_quantity_kg)
-- ============================================================
-- Feature "Pago por kilo". Activa el camino de pago por kilo sin tocar el camino
-- por caja (regresión cero). Snapshots inmutables congelados al registrar:
--   - payment_unit: unidad de pago del registro (enum existente unit_measure).
--   - paid_quantity_kg: kilos pagables (base de pago cuando payment_unit='kg').
--
-- Orden OBLIGATORIO: ADD COLUMN -> backfill -> SET NOT NULL -> CHECK. Las filas
-- existentes (incluidas las de auditoría/corrección) se backfillean a 'box'; con
-- payment_unit='box' el CHECK exige paid_quantity_kg IS NULL, satisfecho porque la
-- columna nace NULL. No se toca el CHECK existente de quantity > 0.
--
-- unit_measure ya existe con ('box','kg') (sin ALTER TYPE).
--
-- Reversibilidad (documentada; sin `down` automático):
--   DROP INDEX idx_picking_payment_unit;
--   ALTER TABLE picking_records DROP CONSTRAINT chk_picking_paid_kg;
--   ALTER TABLE picking_records DROP COLUMN paid_quantity_kg;
--   ALTER TABLE picking_records DROP COLUMN payment_unit;
-- ============================================================

-- Snapshot de la unidad de pago (reutiliza el enum existente unit_measure).
ALTER TABLE picking_records ADD COLUMN payment_unit unit_measure;
-- Kilos pagables (base de pago cuando payment_unit='kg'); NULL para 'box'.
ALTER TABLE picking_records ADD COLUMN paid_quantity_kg NUMERIC(10, 3);

-- Backfill: todos los registros existentes son por caja.
UPDATE picking_records SET payment_unit = 'box' WHERE payment_unit IS NULL;

-- Ahora sí se puede exigir NOT NULL sin romper datos.
ALTER TABLE picking_records ALTER COLUMN payment_unit SET NOT NULL;

-- Reglas de consistencia por unidad:
-- box -> paid_quantity_kg debe ser NULL; kg -> paid_quantity_kg > 0 obligatorio.
ALTER TABLE picking_records ADD CONSTRAINT chk_picking_paid_kg CHECK (
  (payment_unit = 'box' AND paid_quantity_kg IS NULL)
  OR (payment_unit = 'kg'  AND paid_quantity_kg IS NOT NULL AND paid_quantity_kg > 0)
);

CREATE INDEX idx_picking_payment_unit ON picking_records (payment_unit);

COMMENT ON COLUMN picking_records.payment_unit IS 'Unidad de pago congelada al registrar (box|kg). box: pago por quantity; kg: pago por paid_quantity_kg.';
COMMENT ON COLUMN picking_records.paid_quantity_kg IS 'Kilos pagables (snapshot inmutable). Obligatorio y > 0 cuando payment_unit=kg; NULL cuando payment_unit=box.';
