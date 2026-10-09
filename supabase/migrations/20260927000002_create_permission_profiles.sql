-- ============================================================
-- RBAC CONFIGURABLE: PERFILES DE PERMISOS (KAN-5, Fase A)
-- ============================================================
-- Añade una capa OPCIONAL de perfiles de permisos por organización. Un perfil
-- RESTRINGE las capacidades de un usuario DENTRO de lo que su rol ya permite
-- (nunca amplía). Un worker sin perfil (permission_profile_id IS NULL) conserva
-- todas las capacidades de su rol → comportamiento actual intacto.
--
-- Decisiones de negocio:
--   - Los perfiles aplican a CUALQUIER rol (admin2/secretaria, supervisor,
--     encargado, etc.). Solo el rol `admin` gestiona los perfiles.
--   - El pago, las tarifas y las liquidaciones NO cambian.
--   - Gating: activable por organización con el feature flag `configurable_rbac`.
--   - Fase A: el claim `permissions` viaja en el JWT y se usa en Edge Functions
--     y UI. El endurecimiento en RLS con has_permission() queda para Fase B.
-- ============================================================

-- ============================================================
-- permission_profiles: catálogo de perfiles por organización
-- ============================================================
CREATE TABLE permission_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name             VARCHAR(100) NOT NULL,               -- ej. "Secretaría", "Admin sin pagos"
  -- Capacidades habilitadas. Array JSONB de keys del catálogo (ver @fundo360/shared CAPABILITIES).
  capabilities     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           entity_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- capabilities debe ser un array JSON.
  CONSTRAINT chk_permission_profiles_capabilities_is_array CHECK (jsonb_typeof(capabilities) = 'array'),
  -- Requisito para la FK compuesta de integridad de tenant desde workers.
  CONSTRAINT uq_permission_profiles_id_org UNIQUE (id, organization_id)
);

CREATE INDEX idx_permission_profiles_organization ON permission_profiles (organization_id);
CREATE INDEX idx_permission_profiles_status ON permission_profiles (status);

CREATE TRIGGER trg_permission_profiles_updated_at
  BEFORE UPDATE ON permission_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_set_org_id_permission_profiles
  BEFORE INSERT ON permission_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_organization_id();

COMMENT ON TABLE permission_profiles IS 'Perfiles de permisos por organización. Restringen las capacidades de un usuario dentro de su rol (nunca amplían). Gestionados por el admin del cliente.';
COMMENT ON COLUMN permission_profiles.capabilities IS 'Array JSONB de capacidades habilitadas (keys del catálogo CAPABILITIES en @fundo360/shared).';

-- ============================================================
-- permission_profiles: RLS
-- ============================================================
-- admin: control total sobre los perfiles de su organización.
-- otros roles: lectura (para que la UI conozca su propio perfil).
-- platform_admin: bypass.
ALTER TABLE permission_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_permission_profiles" ON permission_profiles
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = current_org_id())
  );

CREATE POLICY "member_read_permission_profiles" ON permission_profiles
  FOR SELECT USING (
    is_platform_admin()
    OR ((is_supervisor() OR is_crew_lead() OR is_worker()) AND organization_id = current_org_id())
  );

-- El hook de claims lee esta tabla → conceder SELECT al rol del hook.
GRANT SELECT ON public.permission_profiles TO supabase_auth_admin;

-- ============================================================
-- workers.permission_profile_id (perfil asignado, opcional)
-- ============================================================
ALTER TABLE workers ADD COLUMN permission_profile_id UUID;

-- FK compuesta: el perfil debe ser de la misma organización que el worker.
ALTER TABLE workers ADD CONSTRAINT fk_workers_permission_profile_org
  FOREIGN KEY (permission_profile_id, organization_id) REFERENCES permission_profiles (id, organization_id) ON DELETE SET NULL;

CREATE INDEX idx_workers_permission_profile_id ON workers (permission_profile_id) WHERE permission_profile_id IS NOT NULL;

COMMENT ON COLUMN workers.permission_profile_id IS 'Perfil de permisos que restringe las capacidades del worker dentro de su rol. NULL = capacidades completas del rol (comportamiento por defecto).';

-- ============================================================
-- JWT hook: inyectar el claim `permissions`
-- ============================================================
-- Reescribe custom_access_token_hook conservando app_role, worker_id, org_id,
-- is_platform_admin y subscription_active, y añadiendo `permissions`:
--   - Si el worker tiene permission_profile_id → array de capabilities del perfil.
--   - Si NO tiene perfil → no se inyecta el claim (ausencia = sin restricción).
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  worker_role_val TEXT;
  worker_id_val UUID;
  org_id_val UUID;
  user_id_val UUID;
  is_platform_admin_val BOOLEAN;
  subscription_active_val BOOLEAN := false;
  profile_caps JSONB;
BEGIN
  claims := event->'claims';
  user_id_val := (event->'claims'->>'sub')::UUID;

  -- ¿Es administrador de plataforma?
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE auth_user_id = user_id_val AND status = 'active'
  ) INTO is_platform_admin_val;

  -- Datos del worker + estado de suscripción + capacidades del perfil (si tiene).
  SELECT w.role::TEXT, w.id, w.organization_id,
         (o.subscription_status IN ('trial', 'active') AND o.status = 'active'),
         pp.capabilities
    INTO worker_role_val, worker_id_val, org_id_val, subscription_active_val, profile_caps
  FROM public.workers w
  JOIN public.organizations o ON o.id = w.organization_id
  LEFT JOIN public.permission_profiles pp
    ON pp.id = w.permission_profile_id AND pp.status = 'active'
  WHERE w.auth_user_id = user_id_val
    AND w.status = 'active';

  IF worker_role_val IS NOT NULL AND subscription_active_val THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(worker_role_val));
    claims := jsonb_set(claims, '{worker_id}', to_jsonb(worker_id_val::TEXT));
    claims := jsonb_set(claims, '{org_id}', to_jsonb(org_id_val::TEXT));
    claims := jsonb_set(claims, '{subscription_active}', 'true'::jsonb);
    -- Solo inyectar `permissions` cuando el worker tiene un perfil activo.
    -- Ausencia del claim = sin restricción (capacidades completas del rol).
    IF profile_caps IS NOT NULL THEN
      claims := jsonb_set(claims, '{permissions}', profile_caps);
    END IF;
  ELSE
    claims := jsonb_set(claims, '{app_role}', '"worker"'::jsonb);
    claims := jsonb_set(claims, '{subscription_active}', to_jsonb(COALESCE(subscription_active_val, false)));
  END IF;

  claims := jsonb_set(claims, '{is_platform_admin}', to_jsonb(is_platform_admin_val));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Inyecta app_role, worker_id, org_id, is_platform_admin, subscription_active y (si el worker tiene perfil de permisos activo) permissions. La ausencia de permissions = sin restricción.';

-- ============================================================
-- Helper SQL has_permission (disponible desde ya; se usará en RLS en Fase B)
-- ============================================================
-- true si el usuario NO tiene restricción de perfil (no hay claim permissions)
-- o si la capacidad está listada en el claim. platform_admin siempre pasa.
CREATE OR REPLACE FUNCTION public.has_permission(capability TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    is_platform_admin()
    OR (auth.jwt() -> 'permissions') IS NULL
    OR (auth.jwt() -> 'permissions') ? capability;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.has_permission IS 'True si el usuario tiene la capacidad: sin claim permissions = sin restricción (capacidades completas del rol); con claim, la capacidad debe estar listada. Platform admin siempre pasa.';

-- ============================================================
-- Feature flag: configurable_rbac
-- ============================================================
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('configurable_rbac', 'RBAC Configurable', 'Permite al administrador del cliente crear perfiles de permisos y asignarlos a usuarios para restringir capacidades dentro de su rol.', 'seguridad', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
