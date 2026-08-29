-- ============================================================
-- MULTI-TENANT: claims de JWT y helpers de autorización
-- ============================================================
-- Extiende custom_access_token_hook para inyectar:
--   - org_id: organización del worker (desde workers.organization_id)
--   - is_platform_admin: true si el usuario está en platform_admins
-- Añade helpers current_org_id() e is_platform_admin() usados por RLS.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: organización del usuario actual (desde el claim)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$
  SELECT NULLIF(auth.jwt() ->> 'org_id', '')::UUID;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- Helper: ¿es administrador de plataforma? (bypass de tenant)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_platform_admin')::BOOLEAN, false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- Reescritura del hook de claims: añade org_id e is_platform_admin
-- conservando app_role y worker_id existentes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  worker_role_val TEXT;
  worker_id_val UUID;
  org_id_val UUID;
  user_id_val UUID;
  is_platform_admin_val BOOLEAN;
BEGIN
  claims := event->'claims';
  user_id_val := (event->'claims'->>'sub')::UUID;

  -- ¿Es administrador de plataforma?
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE auth_user_id = user_id_val AND status = 'active'
  ) INTO is_platform_admin_val;

  -- Datos del worker (rol, id, organización)
  SELECT role::TEXT, id, organization_id
    INTO worker_role_val, worker_id_val, org_id_val
  FROM public.workers
  WHERE auth_user_id = user_id_val
    AND status = 'active';

  IF worker_role_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(worker_role_val));
    claims := jsonb_set(claims, '{worker_id}', to_jsonb(worker_id_val::TEXT));
    claims := jsonb_set(claims, '{org_id}', to_jsonb(org_id_val::TEXT));
  ELSE
    claims := jsonb_set(claims, '{app_role}', '"worker"'::jsonb);
  END IF;

  claims := jsonb_set(claims, '{is_platform_admin}', to_jsonb(is_platform_admin_val));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos para el hook sobre las tablas nuevas usadas en la resolución de claims
GRANT SELECT ON public.platform_admins TO supabase_auth_admin;

-- Comentarios
COMMENT ON FUNCTION public.current_org_id IS 'Organización del usuario autenticado (claim org_id). NULL si no tiene.';
COMMENT ON FUNCTION public.is_platform_admin IS 'True si el usuario es administrador de plataforma (bypass de aislamiento de tenant).';
COMMENT ON FUNCTION public.custom_access_token_hook IS 'Inyecta app_role, worker_id, org_id e is_platform_admin en el JWT.';
