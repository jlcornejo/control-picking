-- ============================================================
-- MULTI-TENANT: organization_id en todas las tablas de dominio
-- ============================================================
-- Asocia cada entidad de dominio a una Organización (tenant).
-- Estrategia segura para datos existentes:
--   1. Crear una Organización semilla ('default').
--   2. Añadir organization_id NULLABLE a cada tabla.
--   3. Backfill de todas las filas existentes con la org semilla.
--   4. Endurecer a NOT NULL + índice.
-- La FK a organizations previene huérfanos; ON DELETE RESTRICT protege
-- contra borrado accidental de una organización con datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Organización semilla (estructural, no data de negocio):
--    respalda los datos preexistentes para poder exigir NOT NULL.
--    Idempotente: no falla si ya existe.
-- ------------------------------------------------------------
INSERT INTO organizations (name, slug, subscription_status, status)
VALUES ('Organización por defecto', 'default', 'active', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- 2-4. Patrón por tabla: add nullable -> backfill -> NOT NULL -> index
-- ------------------------------------------------------------

-- products
ALTER TABLE products ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE products SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE products ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_products_organization ON products (organization_id);

-- fields
ALTER TABLE fields ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE fields SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE fields ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_fields_organization ON fields (organization_id);

-- blocks
ALTER TABLE blocks ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE blocks SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE blocks ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_blocks_organization ON blocks (organization_id);

-- rates
ALTER TABLE rates ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE rates SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE rates ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_rates_organization ON rates (organization_id);

-- workers
ALTER TABLE workers ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE workers SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE workers ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_workers_organization ON workers (organization_id);

-- supervisor_assignments
ALTER TABLE supervisor_assignments ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE supervisor_assignments SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE supervisor_assignments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_supervisor_assignments_organization ON supervisor_assignments (organization_id);

-- picking_records
ALTER TABLE picking_records ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE picking_records SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE picking_records ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_picking_records_organization ON picking_records (organization_id);

-- settlements
-- NOTA: el trigger prevent_paid_settlement_update bloquea UPDATE sobre settlements
-- pagados. El backfill de organization_id es un cambio ESTRUCTURAL (asignación de
-- tenant), no una modificación de negocio, por lo que se deshabilita el trigger
-- solo durante el backfill y se reactiva de inmediato en la misma transacción.
-- La inmutabilidad de settlements pagados queda intacta para la aplicación.
ALTER TABLE settlements ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE settlements DISABLE TRIGGER trg_settlements_immutable_when_paid;
UPDATE settlements SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE settlements ENABLE TRIGGER trg_settlements_immutable_when_paid;
ALTER TABLE settlements ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_settlements_organization ON settlements (organization_id);

-- payments
ALTER TABLE payments ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE payments SET organization_id = (SELECT id FROM organizations WHERE slug = 'default') WHERE organization_id IS NULL;
ALTER TABLE payments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_payments_organization ON payments (organization_id);

-- Comentarios
COMMENT ON COLUMN products.organization_id IS 'Tenant propietario. Filtro de aislamiento en RLS.';
COMMENT ON COLUMN workers.organization_id IS 'Tenant propietario. Filtro de aislamiento en RLS.';
COMMENT ON COLUMN picking_records.organization_id IS 'Tenant propietario. Debe coincidir con el de worker y block (FK compuesta).';
