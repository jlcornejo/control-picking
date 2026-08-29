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

/** Decode the JWT claims payload from the Authorization header (unverified). */
export function decodeClaims(req: Request): Record<string, unknown> | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    return JSON.parse(atob(token.split('.')[1]!));
  } catch {
    return null;
  }
}

/** Check if user has required role (from JWT claims) */
export function requireRole(req: Request, allowedRoles: string[]): Response | null {
  const claims = decodeClaims(req);
  if (!claims) return error('UNAUTHORIZED', 'Token inválido', 401);

  // Platform admins bypass role checks (control total sobre la plataforma)
  if (claims.is_platform_admin === true) return null;

  const role = claims.app_role as string | undefined;
  if (!role || !allowedRoles.includes(role)) {
    return error('FORBIDDEN', 'No tiene permisos para esta operación', 403);
  }
  return null;
}

/** Organization id of the current user (org_id claim). Null if none. */
export function getOrgId(req: Request): string | null {
  const claims = decodeClaims(req);
  const orgId = claims?.org_id;
  return typeof orgId === 'string' && orgId.length > 0 ? orgId : null;
}

/** True if the current user is a platform admin (bypasses tenant isolation). */
export function isPlatformAdmin(req: Request): boolean {
  return decodeClaims(req)?.is_platform_admin === true;
}

/**
 * Ensure the requested resource belongs to the caller's organization.
 * Platform admins bypass the check. Returns an error Response if the
 * resource org does not match, otherwise null.
 */
export function requireOrg(req: Request, resourceOrgId: string | null | undefined): Response | null {
  if (isPlatformAdmin(req)) return null;

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);
  if (!resourceOrgId || resourceOrgId !== orgId) {
    return error('CROSS_TENANT_FORBIDDEN', 'Acceso a datos de otra organización denegado', 403);
  }
  return null;
}
