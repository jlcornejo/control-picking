-- ============================================================
-- PLATFORM_ADMINS (rol de plataforma, fuera de cualquier tenant)
-- ============================================================
-- Administradores del SaaS (dueño / soporte). Control total sobre todas
-- las Organizaciones. Deliberadamente separado del enum worker_role,
-- que es intra-tenant. El acceso cross-tenant se resuelve en RLS mediante
-- el helper is_platform_admin() (ver migración de auth/RLS).
-- ============================================================

CREATE TABLE platform_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     VARCHAR(150) NOT NULL,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para resolución rápida desde el JWT hook (auth_user_id ya es UNIQUE)
CREATE INDEX idx_platform_admins_status ON platform_admins (status);

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER trg_platform_admins_updated_at
  BEFORE UPDATE ON platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarios
COMMENT ON TABLE platform_admins IS 'Administradores de plataforma (dueño/soporte del SaaS). Fuera del aislamiento de tenant.';
COMMENT ON COLUMN platform_admins.auth_user_id IS 'Vínculo con Supabase Auth. Usado por custom_access_token_hook para el claim is_platform_admin.';
