-- ============================================================
-- VARIEDAD EN PAÑO/CUARTEL (blocks.variety_id) + VALIDACIÓN CRUZADA
-- ============================================================
-- Feature "Variedades". Un paño/cuartel puede tener una sola variedad (no se
-- mezclan). Añade variety_id nullable a blocks + FK compuesta de tenant.
--
-- La invariante (si el producto tiene variedades activas, variety_id es
-- obligatorio y debe pertenecer al producto; si no tiene, debe ser NULL) cruza
-- tablas, así que un CHECK no basta: se enforza con un trigger BEFORE
-- INSERT OR UPDATE OF variety_id, product_id. La resolución de organization_id es
-- robusta al orden de triggers BEFORE (COALESCE(NEW.organization_id, current_org_id())).
--
-- Reversibilidad (documentada; sin `down` automático):
--   DROP TRIGGER trg_validate_block_variety ON blocks;
--   DROP FUNCTION validate_block_variety();
--   DROP INDEX idx_blocks_variety;
--   ALTER TABLE blocks DROP CONSTRAINT fk_blocks_variety_org;
--   ALTER TABLE blocks DROP COLUMN variety_id;
-- ============================================================

ALTER TABLE blocks ADD COLUMN variety_id UUID; -- nullable; NULL para todos los blocks existentes

ALTER TABLE blocks ADD CONSTRAINT fk_blocks_variety_org
  FOREIGN KEY (variety_id, organization_id)
  REFERENCES product_varieties (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX idx_blocks_variety ON blocks (variety_id) WHERE variety_id IS NOT NULL;

-- ------------------------------------------------------------
-- Trigger de validación cruzada block.variety_id <-> producto
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_block_variety()
RETURNS TRIGGER AS $$
DECLARE
  v_org UUID;
  v_has_active_varieties BOOLEAN;
  v_variety_product UUID;
BEGIN
  -- Resolver el tenant de forma robusta al ORDEN de triggers BEFORE: en un INSERT
  -- desde el cliente, NEW.organization_id llega NULL y lo completa set_organization_id
  -- (trigger BEFORE INSERT). No dependemos de ese orden: si NEW.organization_id es
  -- NULL usamos current_org_id() (el mismo valor que escribiría el otro trigger).
  v_org := COALESCE(NEW.organization_id, current_org_id());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ORG_CONTEXT_REQUIRED: no se pudo resolver organization_id del paño';
  END IF;

  -- ¿El producto del block tiene al menos una variedad activa?
  SELECT EXISTS (
    SELECT 1 FROM product_varieties pv
    WHERE pv.product_id = NEW.product_id
      AND pv.organization_id = v_org
      AND pv.status = 'active'
  ) INTO v_has_active_varieties;

  IF NEW.variety_id IS NOT NULL THEN
    -- La variedad debe existir, ser del mismo producto y del mismo tenant.
    SELECT pv.product_id INTO v_variety_product
    FROM product_varieties pv
    WHERE pv.id = NEW.variety_id AND pv.organization_id = v_org;
    IF v_variety_product IS NULL THEN
      RAISE EXCEPTION 'VARIETY_NOT_FOUND: variety % no existe en el tenant', NEW.variety_id;
    END IF;
    IF v_variety_product <> NEW.product_id THEN
      RAISE EXCEPTION 'VARIETY_PRODUCT_MISMATCH: la variedad no pertenece al producto del paño';
    END IF;
  ELSE
    -- Sin variedad: solo válido si el producto NO tiene variedades activas.
    IF v_has_active_varieties THEN
      RAISE EXCEPTION 'VARIETY_REQUIRED: el producto tiene variedades; debe elegir una';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_block_variety
  BEFORE INSERT OR UPDATE OF variety_id, product_id ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION validate_block_variety();

COMMENT ON COLUMN blocks.variety_id IS 'Variedad única del paño/cuartel (FK compuesta de tenant a product_varieties). Obligatoria cuando el producto tiene variedades activas; NULL cuando no.';
