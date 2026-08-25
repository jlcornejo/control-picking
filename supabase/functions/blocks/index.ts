import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Routes: /blocks/:id, /blocks/:id/status, or /fields/:fieldId/blocks
  const blockId = pathParts[1] || null;
  const subResource = pathParts[2] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // PATCH /blocks/:id/status
  if (req.method === 'PATCH' && blockId && subResource === 'status') {
    return await handlePatchStatus(req, supabase, blockId);
  }

  switch (req.method) {
    case 'GET':
      return blockId ? await handleGetOne(supabase, blockId) : await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase, url);
    case 'PUT':
      return await handlePut(req, supabase, blockId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

async function handleGetList(supabase: any, url: URL) {
  const fieldId = url.searchParams.get('field_id');
  const status = url.searchParams.get('status') || 'active';

  let query = supabase.from('blocks').select('*, products(name, unit_measure), fields(name)', { count: 'exact' });
  if (fieldId) query = query.eq('field_id', fieldId);
  if (status !== 'all') query = query.eq('status', status);
  query = query.order('name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

async function handleGetOne(supabase: any, blockId: string) {
  const { data, error: dbError } = await supabase
    .from('blocks')
    .select('*, products(name, unit_measure), fields(name)')
    .eq('id', blockId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Paño no encontrado', 404);
  return success(data);
}

async function handlePost(req: Request, supabase: any, url: URL) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.name || body.name.trim().length === 0) return error('VALIDATION_ERROR', 'Nombre del paño es requerido', 422);
  if (!body.field_id) return error('VALIDATION_ERROR', 'field_id es requerido', 422);
  if (!body.product_id) return error('VALIDATION_ERROR', 'product_id es requerido', 422);
  if (!body.area || body.area <= 0) return error('VALIDATION_ERROR', 'Superficie debe ser mayor a 0', 422);

  const { data, error: dbError } = await supabase
    .from('blocks')
    .insert({ name: body.name.trim(), field_id: body.field_id, product_id: body.product_id, area: body.area })
    .select('*, products(name, unit_measure), fields(name)')
    .single();
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

async function handlePut(req: Request, supabase: any, blockId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!blockId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.product_id !== undefined) updates.product_id = body.product_id;
  if (body.area !== undefined) {
    if (body.area <= 0) return error('VALIDATION_ERROR', 'Superficie debe ser mayor a 0', 422);
    updates.area = body.area;
  }
  if (Object.keys(updates).length === 0) return error('VALIDATION_ERROR', 'Sin campos para actualizar', 422);

  const { data, error: dbError } = await supabase.from('blocks').update(updates).eq('id', blockId).select('*, products(name, unit_measure)').single();
  if (dbError) return error('NOT_FOUND', 'Paño no encontrado', 404);
  return success(data);
}

async function handlePatchStatus(req: Request, supabase: any, blockId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!['active', 'inactive'].includes(body.status)) {
    return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
  }

  if (body.status === 'inactive') {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('picking_records')
      .select('*', { count: 'exact', head: true })
      .eq('block_id', blockId)
      .eq('work_day', today);
    if (count && count > 0 && !body.force) {
      return error('VALIDATION_ERROR', `Hay ${count} registros de picking activos hoy en este paño. Envíe force: true para confirmar.`, 409);
    }
  }

  const { data, error: dbError } = await supabase.from('blocks').update({ status: body.status }).eq('id', blockId).select().single();
  if (dbError) return error('NOT_FOUND', 'Paño no encontrado', 404);
  return success(data);
}
