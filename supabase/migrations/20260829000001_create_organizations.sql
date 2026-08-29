-- ============================================================
-- ORGANIZATIONS (tenant raíz del modelo multi-cliente)
-- ============================================================
-- Cada Organización es un cliente del SaaS (ej. "Campos del Sur").
-- Unidad de aislamiento: todo dato de dominio pertenece a una Organización.
-- Contiene branding, estado de suscripción, default de Modo Capataz y
-- etiquetas de rol configurables para la UI.
-- ============================================================

-- Estado comercial de la suscripción de una Organización
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');

CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(150) NOT NULL,
  slug                  VARCHAR(80) NOT NULL,
  logo_url              TEXT,
  brand_primary_color   VARCHAR(9),  -- formato #RRGGBB o #RRGGBBAA
  brand_secondary_color VARCHAR(9),
  subscription_status   subscription_status NOT NULL DEFAULT 'trial',
  subscription_plan     VARCHAR(50),
  crew_mode_enabled     BOOLEAN NOT NULL DEFAULT false,          -- default de Modo Capataz
  role_labels           JSONB NOT NULL DEFAULT '{}'::jsonb,      -- ej. {"crew_lead":"Capataz"}
  status                entity_status NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- slug único, url-safe (minúsculas, números y guiones)
  CONSTRAINT uq_organizations_slug UNIQUE (slug),
  CONSTRAINT chk_organizations_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- role_labels debe ser un objeto JSON (no array ni escalar)
  CONSTRAINT chk_organizations_role_labels CHECK (jsonb_typeof(role_labels) = 'object')
);

-- Índices
CREATE INDEX idx_organizations_status ON organizations (status);
CREATE INDEX idx_organizations_subscription_status ON organizations (subscription_status);

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarios
COMMENT ON TABLE organizations IS 'Cliente/tenant del SaaS. Unidad de aislamiento de datos.';
COMMENT ON COLUMN organizations.slug IS 'Identificador url-safe único de la organización.';
COMMENT ON COLUMN organizations.crew_mode_enabled IS 'Default de Modo Capataz; cada campo puede sobreescribirlo.';
COMMENT ON COLUMN organizations.role_labels IS 'Etiquetas de rol configurables para la UI (no altera jerarquía ni seguridad).';
