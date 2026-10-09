import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

// Perfiles de permisos (RBAC configurable). CRUD por organización, solo admin.
// El aislamiento entre clientes lo garantiza RLS; el organization_id de los
// registros nuevos se toma del token (nunca del cliente).
//
// Catálogo de capacidades válidas (debe mantenerse en sync con CAPABILITIES de
// @fundo360/shared; Deno no importa el paquete directamente).
const CAPABILITIES = [
  'workers.manage',
  'fields.manage',
  'products.manage',
  'rates.manage',
  'box_types.manage',
  'crews.manage',
  'supervisors.manage',
  'settlements.manage',
  'payments.manage',
  'metrics.view',
  'reports.export',
  'settings.manage',
];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ["permission-profiles"] or ["permission-profiles", ":id"]
  const profileId = pathParts[1] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  switch (req.method) {
    case 'GET':
      return await handleGet(supabase, url, profileId);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, profileId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /permission-profiles or GET /permission-profiles/:id */
async function handleGet(supabase: any, url: URL, profileId: string | null) {
  if (profileId) {
    const { data, error: dbError } = await supabase
      .from('permission_profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    if (dbError) return error('PERMISSION_PROFILE_NOT_FOUND', 'Perfil no encontrado', 404);
    return success(data);
  }

  const status = url.searchParams.get('status') || 'active';
  let query = supabase.from('permission_profiles').select('*', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  query = query.order('name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** Validate the payload. Returns an error message or null. */
function validateProfilePayload(body: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return 'Nombre del perfil es requerido';
    }
  }
  if (!partial || body.capabilities !== undefined) {
    if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) {
      return 'Selecciona al menos una capacidad';
    }
    const invalid = (body.capabilities as unknown[]).filter((c) => typeof c !== 'string' || !CAPABILITIES.includes(c));
    if (invalid.length > 0) return `Capacidad(es) inválida(s): ${invalid.join(', ')}`;
  }
  return null;
}

/** POST /permission-profiles (admin only) */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  const validationError = validateProfilePayload(body, false);
  if (validationError) return error('VALIDATION_ERROR', validationError, 422);

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data, error: dbError } = await supabase
    .from('permission_profiles')
    .insert({
      organization_id: orgId,
      name: (body.name as string).trim(),
      capabilities: body.capabilities,
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

/** PUT /permission-profiles/:id (admin only) */
async function handlePut(req: Request, supabase: any, profileId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!profileId) return error('VALIDATION_ERROR', 'ID de perfil requerido', 400);

  const body = await req.json();
  const validationError = validateProfilePayload(body, true);
  if (validationError) return error('VALIDATION_ERROR', validationError, 422);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = (body.name as string).trim();
  if (body.capabilities !== undefined) updates.capabilities = body.capabilities;
  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status as string)) {
      return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'No se proporcionaron campos para actualizar', 422);
  }

  const { data, error: dbError } = await supabase
    .from('permission_profiles')
    .update(updates)
    .eq('id', profileId)
    .select()
    .single();

  if (dbError) return error('PERMISSION_PROFILE_NOT_FOUND', 'Perfil no encontrado', 404);
  return success(data);
}
