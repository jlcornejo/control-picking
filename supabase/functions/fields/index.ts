import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';
import { getOrgWorkday } from '../_shared/workday.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const fieldId = pathParts[1] || null;
  const subResource = pathParts[2] || null; // "status" or "blocks"

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // PATCH /fields/:id/status
  if (req.method === 'PATCH' && fieldId && subResource === 'status') {
    return await handlePatchStatus(req, supabase, fieldId);
  }

  switch (req.method) {
    case 'GET':
      return fieldId ? await handleGetOne(supabase, fieldId) : await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, fieldId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

async function handleGetList(supabase: any, url: URL) {
  const status = url.searchParams.get('status') || 'active';
  let query = supabase.from('fields').select('*', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  query = query.order('name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

async function handleGetOne(supabase: any, fieldId: string) {
  const { data, error: dbError } = await supabase
    .from('fields')
    .select('*, blocks(*)')
    .eq('id', fieldId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Campo no encontrado', 404);
  return success(data);
}

async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.name || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre del campo es requerido', 422);
  }
  if (!body.total_area || body.total_area <= 0) {
    return error('VALIDATION_ERROR', 'Superficie debe ser mayor a 0', 422);
  }

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data, error: dbError } = await supabase
    .from('fields')
    .insert({ organization_id: orgId, name: body.name.trim(), location: body.location || null, total_area: body.total_area })
    .select()
    .single();
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

async function handlePut(req: Request, supabase: any, fieldId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!fieldId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.location !== undefined) updates.location = body.location;
  if (body.total_area !== undefined) {
    if (body.total_area <= 0) return error('VALIDATION_ERROR', 'Superficie debe ser mayor a 0', 422);
    updates.total_area = body.total_area;
  }
  if (Object.keys(updates).length === 0) return error('VALIDATION_ERROR', 'Sin campos para actualizar', 422);

  const { data, error: dbError } = await supabase.from('fields').update(updates).eq('id', fieldId).select().single();
  if (dbError) return error('NOT_FOUND', 'Campo no encontrado', 404);
  return success(data);
}

async function handlePatchStatus(req: Request, supabase: any, fieldId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!['active', 'inactive'].includes(body.status)) {
    return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
  }

  // If deactivating, check for active picking records today (tz del tenant)
  if (body.status === 'inactive') {
    const today = await getOrgWorkday(supabase, orgId);
    const { count } = await supabase
      .from('picking_records')
      .select('*', { count: 'exact', head: true })
      .eq('work_day', today)
      .in('block_id', 
        (await supabase.from('blocks').select('id').eq('field_id', fieldId)).data?.map((b: any) => b.id) || []
      );
    if (count && count > 0 && !body.force) {
      return error('VALIDATION_ERROR', `Hay ${count} registros de picking activos hoy en este campo. Envíe force: true para confirmar.`, 409);
    }
  }

  const { data, error: dbError } = await supabase.from('fields').update({ status: body.status }).eq('id', fieldId).select().single();
  if (dbError) return error('NOT_FOUND', 'Campo no encontrado', 404);
  return success(data);
}
