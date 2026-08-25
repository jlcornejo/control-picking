-- Setup custom claims for roles in JWT
-- This function sets the worker role as a custom claim in the JWT token

-- Function to get worker role from workers table
CREATE OR REPLACE FUNCTION public.get_worker_role(user_id UUID)
RETURNS worker_role AS $$
  SELECT role FROM public.workers WHERE auth_user_id = user_id AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to get worker_id from auth user
CREATE OR REPLACE FUNCTION public.get_worker_id(user_id UUID)
RETURNS UUID AS $$
  SELECT id FROM public.workers WHERE auth_user_id = user_id AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Custom JWT claims hook: injects role and worker_id into the token
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  worker_role_val TEXT;
  worker_id_val UUID;
  user_id_val UUID;
BEGIN
  claims := event->'claims';
  user_id_val := (event->'claims'->>'sub')::UUID;

  SELECT role::TEXT, id INTO worker_role_val, worker_id_val
  FROM public.workers
  WHERE auth_user_id = user_id_val
    AND status = 'active';

  IF worker_role_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(worker_role_val));
    claims := jsonb_set(claims, '{worker_id}', to_jsonb(worker_id_val::TEXT));
  ELSE
    claims := jsonb_set(claims, '{app_role}', '"worker"'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions for the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.workers TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from public for security
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM public;

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() ->> 'app_role') = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is supervisor
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() ->> 'app_role') = 'supervisor';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is worker
CREATE OR REPLACE FUNCTION public.is_worker()
RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() ->> 'app_role') = 'worker';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current worker_id from JWT
CREATE OR REPLACE FUNCTION public.current_worker_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'worker_id')::UUID;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Comments
COMMENT ON FUNCTION public.custom_access_token_hook IS 'Injects app_role and worker_id into JWT claims on token refresh.';
COMMENT ON FUNCTION public.is_admin IS 'Returns true if the authenticated user has admin role.';
COMMENT ON FUNCTION public.is_supervisor IS 'Returns true if the authenticated user has supervisor role.';
COMMENT ON FUNCTION public.current_worker_id IS 'Returns the worker UUID of the authenticated user.';
