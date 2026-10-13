-- ============================================================
-- VARIEDADES DE PRODUCTO (product_varieties)
-- ============================================================
-- Feature F-05 (extensión de "Pago por kilo"). Introduce un nivel jerárquico
-- bajo el producto: un producto puede tener 0..N variedades (ej. Frambuesa ->
-- Heritage). Las variedades se asignan a paños/cuarteles (blocks.variety_id) y
-- pueden tener tarifa propia (rates.variety_id).
--
-- Espeja el patrón de box_types (20260927000001): tabla por organización con
-- UNIQUE (id, organization_id) para habilitar FKs compuestas de tenant desde
-- otras tablas (blocks, rates), triggers set_organization_id + updated_at, y
-- RLS admin_all / member_read_active.
--
-- Reversibilidad (el proyecto no corre `down` automático; se documenta):
--   DROP TABLE product_varieties CASCADE;
-- ============================================================

-- ============================================================
-- product_varieties: catálogo de variedades por producto y organización
-- ============================================================
CREATE TABLE product_varieties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  product_id      UUID NOT NULL,
  name            VARCHAR(100) NOT NULL,
  status          entity_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- FK compuesta de tenant: la variedad y su producto son del mismo tenant.
  CONSTRAINT fk_variety_product_org
    FOREIGN KEY (product_id, organization_id)
    REFERENCES products (id, organization_id) ON DELETE RESTRICT,

  -- Requisito para que otras tablas (blocks, rates) referencien (id, organization_id).
  CONSTRAINT uq_product_varieties_id_org UNIQUE (id, organization_id)
);

-- Índices (FKs y filtros comunes)
CREATE INDEX idx_product_varieties_organization ON product_varieties (organization_id);
CREATE INDEX idx_product_varieties_product ON product_varieties (product_id);
CREATE INDEX idx_product_varieties_status ON product_varieties (status);

-- Nombre único de variedad por producto (dentro del tenant), case-insensitive,
-- SOLO entre variedades activas. Al desactivar una variedad su nombre queda
-- libre y puede reutilizarse; al reactivar, una colisión se rechaza (barrera dura).
CREATE UNIQUE INDEX uq_product_varieties_name_per_product
  ON product_varieties (product_id, lower(name)) WHERE status = 'active';

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER trg_product_varieties_updated_at
  BEFORE UPDATE ON product_varieties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger multi-tenant: autocompleta organization_id desde el claim org_id del JWT
CREATE TRIGGER trg_set_org_id_product_varieties
  BEFORE INSERT ON product_varieties
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_id();

COMMENT ON TABLE product_varieties IS 'Variedades de producto por organización (nivel jerárquico bajo el producto). Un producto puede tener 0..N variedades; cada variedad puede asignarse a paños y tener tarifa propia.';
COMMENT ON COLUMN product_varieties.product_id IS 'Producto al que pertenece la variedad (FK compuesta de tenant a products).';
COMMENT ON COLUMN product_varieties.name IS 'Nombre de la variedad, único (case-insensitive) entre variedades activas del mismo producto.';

-- ============================================================
-- product_varieties: Row Level Security
-- ============================================================
-- Espeja el modelo de acceso de box_types:
--   admin       -> control total dentro de su organización.
--   supervisor  -> lee variedades activas de su organización (para registrar).
--   crew_lead   -> lee variedades activas de su organización (para registrar).
--   worker      -> lee variedades activas de su organización (referencia).
-- platform_admin siempre pasa (bypass de tenant).
ALTER TABLE product_varieties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_product_varieties" ON product_varieties
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

CREATE POLICY "member_read_active_product_varieties" ON product_varieties
  FOR SELECT USING (
    is_platform_admin()
    OR (
      (is_supervisor() OR is_crew_lead() OR is_worker())
      AND status = 'active'
      AND organization_id = current_org_id()
    )
  );
