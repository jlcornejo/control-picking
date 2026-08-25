import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { error } from './response.ts';

/** Create an authenticated Supabase client from request headers */
export function createSupabaseClient(req: Request) {
  const authHeader = req.headers.get('Authorization');
  
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader ?? '' } },
    },
  );
}

/** Create a service-role Supabase client (bypasses RLS) */
export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/** Get authenticated user or return error response */
export async function getUser(req: Request) {
  const supabase = createSupabaseClient(req);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { user: null, supabase, errorResponse: error('UNAUTHORIZED', 'No autenticado', 401) };
  }

  return { user, supabase, errorResponse: null };
}

/** Check if user has required role (from JWT claims) */
export function requireRole(req: Request, allowedRoles: string[]): Response | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return error('UNAUTHORIZED', 'No autenticado', 401);

  try {
    // Decode JWT payload (base64)
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]!));
    const role = payload.app_role;

    if (!role || !allowedRoles.includes(role)) {
      return error('FORBIDDEN', 'No tiene permisos para esta operación', 403);
    }
    return null;
  } catch {
    return error('UNAUTHORIZED', 'Token inválido', 401);
  }
}
