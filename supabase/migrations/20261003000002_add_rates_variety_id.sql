-- ============================================================
-- TARIFA POR VARIEDAD (rates.variety_id)
-- ============================================================
-- Feature "Pago por kilo" / "Variedades". Añade variety_id nullable a rates
-- reutilizando la tabla existente (sin tabla variety_rates). NULL = tarifa a
-- nivel de producto; NOT NULL = tarifa específica de la variedad.
--
-- Reemplaza el índice único "una current por producto" por dos índices únicos
-- parciales que permiten coexistir una tarifa current de producto (sin variedad)
-- y una tarifa current por cada (producto, variedad).
--
-- No hay backfill: las filas existentes quedan con variety_id IS NULL (tarifa de
-- producto), manteniendo compatibilidad total. No se toca el CHECK amount > 0.
--
-- Reversibilidad (documentada; sin `down` automático):
--   DROP INDEX uq_rates_product_variety_current;
--   DROP INDEX uq_rates_product_current_no_variety;
--   CREATE UNIQUE INDEX idx_rates_product_current ON rates(product_id) WHERE status='current';
--   DROP INDEX idx_rates_variety;
--   ALTER TABLE rates DROP CONSTRAINT fk_rates_variety_org;
--   ALTER TABLE rates DROP COLUMN variety_id;
-- ============================================================

ALTER TABLE rates ADD COLUMN variety_id UUID;

-- FK compuesta de tenant (nullable: NULL = tarifa a nivel de producto).
ALTER TABLE rates ADD CONSTRAINT fk_rates_variety_org
  FOREIGN KEY (variety_id, organization_id)
  REFERENCES product_varieties (id, organization_id) ON DELETE RESTRICT;

-- Índice en la FK (regla database-migrations: índice en toda FK).
CREATE INDEX idx_rates_variety ON rates (variety_id) WHERE variety_id IS NOT NULL;

-- Reemplazo del índice único de "una current por producto":
DROP INDEX idx_rates_product_current;

-- (a) una tarifa current por producto SIN variedad
CREATE UNIQUE INDEX uq_rates_product_current_no_variety
  ON rates (product_id) WHERE status = 'current' AND variety_id IS NULL;

-- (b) una tarifa current por (producto, variedad)
CREATE UNIQUE INDEX uq_rates_product_variety_current
  ON rates (product_id, variety_id) WHERE status = 'current' AND variety_id IS NOT NULL;

COMMENT ON COLUMN rates.variety_id IS 'Variedad a la que aplica la tarifa (FK compuesta de tenant a product_varieties). NULL = tarifa a nivel de producto.';
