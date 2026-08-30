-- ============================================================
-- ENFORCEMENT DE SUSCRIPCIÓN (Req. 2.3)
-- ============================================================
-- Un usuario de una Organización cuya suscripción no está activa
-- (suspended / cancelled) no debe acceder a las funcionalidades,
-- pero sus datos se preservan.
--
-- Implementación: el custom_access_token_hook solo inyecta app_role,
-- worker_id y org_id cuando la organización del worker tiene
-- subscription_status IN ('trial','active'). En caso contrario, no se
-- inyecta org_id (RLS deniega acceso a datos) y se añade el claim
-- subscription_active=false para que la app muestre un mensaje claro.
--
-- Los platform admins no se ven afectados (siguen con bypass).
-- ============================================================

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
BEGIN
  claims := event->'claims';
  user_id_val := (event->'claims'->>'sub')::UUID;

  -- ¿Es administrador de plataforma?
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE auth_user_id = user_id_val AND status = 'active'
  ) INTO is_platform_admin_val;

  -- Datos del worker + estado de suscripción de su organización.
  -- Solo se consideran activas las organizaciones con suscripción vigente.
  SELECT w.role::TEXT, w.id, w.organization_id,
         (o.subscription_status IN ('trial', 'active') AND o.status = 'active')
    INTO worker_role_val, worker_id_val, org_id_val, subscription_active_val
  FROM public.workers w
  JOIN public.organizations o ON o.id = w.organization_id
  WHERE w.auth_user_id = user_id_val
    AND w.status = 'active';

  IF worker_role_val IS NOT NULL AND subscription_active_val THEN
    -- Suscripción vigente: inyectar contexto de tenant completo
    claims := jsonb_set(claims, '{app_role}', to_jsonb(worker_role_val));
    claims := jsonb_set(claims, '{worker_id}', to_jsonb(worker_id_val::TEXT));
    claims := jsonb_set(claims, '{org_id}', to_jsonb(org_id_val::TEXT));
    claims := jsonb_set(claims, '{subscription_active}', 'true'::jsonb);
  ELSE
    -- Sin worker activo, o suscripción no vigente: sin org_id (RLS deniega datos)
    claims := jsonb_set(claims, '{app_role}', '"worker"'::jsonb);
    claims := jsonb_set(claims, '{subscription_active}', to_jsonb(COALESCE(subscription_active_val, false)));
  END IF;

  claims := jsonb_set(claims, '{is_platform_admin}', to_jsonb(is_platform_admin_val));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- El hook ahora lee organizations; conceder permiso al rol del hook.
GRANT SELECT ON public.organizations TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Inyecta app_role, worker_id, org_id, is_platform_admin y subscription_active. Solo entrega org_id si la suscripción de la organización está vigente (trial/active).';
