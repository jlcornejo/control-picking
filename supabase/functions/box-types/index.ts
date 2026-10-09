import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

// Tipos de caja/envase (destare + tolerancia). CRUD por organización.
// El aislamiento entre clientes lo garantiza RLS; el organization_id de los
// registros nuevos se toma del token (nunca del cliente).

const TOLERANCE_UNITS = ['percent', 'kg'];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ["box-types"] or ["box-types", ":id"]
  const boxTypeId = pathParts[1] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  switch (req.method) {
    case 'GET':
      return await handleGet(supabase, url, boxTypeId);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, boxTypeId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /box-types or GET /box-types/:id */
async function handleGet(supabase: any, url: URL, boxTypeId: string | null) {
  if (boxTypeId) {
    const { data, error: dbError } = await supabase
      .from('box_types')
      .select('*')
      .eq('id', boxTypeId)
      .single();
    if (dbError) return error('BOX_TYPE_NOT_FOUND', 'Tipo de caja no encontrado', 404);
    return success(data);
  }

  const status = url.searchParams.get('status') || 'active';
  let query = supabase.from('box_types').select('*', { count: 'exact' });
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

/** Validate a box type payload. Returns an error message or null. */
function validateBoxTypePayload(body: Record<string, unknown>, partial: boolean): string | null {
  const has = (k: string) => body[k] !== undefined;
  const num = (k: string) => Number(body[k]);

  if (!partial || has('name')) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return 'Nombre del tipo de caja es requerido';
    }
  }
  if (!partial || has('tare_weight_kg')) {
    if (!Number.isFinite(num('tare_weight_kg')) || num('tare_weight_kg') < 0) {
      return 'La tara no puede ser negativa';
    }
  }
  if (!partial || has('target_net_weight_kg')) {
    if (!Number.isFinite(num('target_net_weight_kg')) || num('target_net_weight_kg') <= 0) {
      return 'El peso objetivo debe ser mayor a 0';
    }
  }
  if (has('tolerance_over') && (!Number.isFinite(num('tolerance_over')) || num('tolerance_over') < 0)) {
    return 'La tolerancia superior no puede ser negativa';
  }
  if (has('tolerance_under') && (!Number.isFinite(num('tolerance_under')) || num('tolerance_under') < 0)) {
    return 'La tolerancia inferior no puede ser negativa';
  }
  if (has('tolerance_unit') && !TOLERANCE_UNITS.includes(body.tolerance_unit as string)) {
    return 'Unidad de tolerancia debe ser "percent" o "kg"';
  }
  return null;
}

/** POST /box-types (admin only) */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  const validationError = validateBoxTypePayload(body, false);
  if (validationError) return error('VALIDATION_ERROR', validationError, 422);

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data, error: dbError } = await supabase
    .from('box_types')
    .insert({
      organization_id: orgId,
      name: (body.name as string).trim(),
      tare_weight_kg: Number(body.tare_weight_kg),
      target_net_weight_kg: Number(body.target_net_weight_kg),
      tolerance_over: body.tolerance_over !== undefined ? Number(body.tolerance_over) : 0,
      tolerance_under: body.tolerance_under !== undefined ? Number(body.tolerance_under) : 0,
      tolerance_unit: (body.tolerance_unit as string) ?? 'percent',
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

/** PUT /box-types/:id (admin only) */
async function handlePut(req: Request, supabase: any, boxTypeId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!boxTypeId) return error('VALIDATION_ERROR', 'ID de tipo de caja requerido', 400);

  const body = await req.json();
  const validationError = validateBoxTypePayload(body, true);
  if (validationError) return error('VALIDATION_ERROR', validationError, 422);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = (body.name as string).trim();
  if (body.tare_weight_kg !== undefined) updates.tare_weight_kg = Number(body.tare_weight_kg);
  if (body.target_net_weight_kg !== undefined) updates.target_net_weight_kg = Number(body.target_net_weight_kg);
  if (body.tolerance_over !== undefined) updates.tolerance_over = Number(body.tolerance_over);
  if (body.tolerance_under !== undefined) updates.tolerance_under = Number(body.tolerance_under);
  if (body.tolerance_unit !== undefined) updates.tolerance_unit = body.tolerance_unit;
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
    .from('box_types')
    .update(updates)
    .eq('id', boxTypeId)
    .select()
    .single();

  if (dbError) return error('BOX_TYPE_NOT_FOUND', 'Tipo de caja no encontrado', 404);
  return success(data);
}
