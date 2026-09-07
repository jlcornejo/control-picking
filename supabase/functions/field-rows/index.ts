import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';
import { getOrgWorkday } from '../_shared/workday.ts';

// Melgas (field_rows): tercer nivel de la jerarquía física del campo.
// fields (campo) -> blocks (cuartel/paño) -> field_rows (melga).
// La melga hereda producto y tarifa del block; solo lleva name + row_number + status.
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Routes: /field-rows, /field-rows/:id, /field-rows/:id/status
  const rowId = pathParts[1] || null;
  const subResource = pathParts[2] || null;

  const { errorResponse, supabase } = await getUser(req);
  if (errorResponse) return errorResponse;

  // PATCH /field-rows/:id/status
  if (req.method === 'PATCH' && rowId && subResource === 'status') {
    return await handlePatchStatus(req, supabase, rowId);
  }

  switch (req.method) {
    case 'GET':
      return rowId ? await handleGetOne(supabase, rowId) : await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, rowId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

async function handleGetList(supabase: any, url: URL) {
  const blockId = url.searchParams.get('block_id');
  const status = url.searchParams.get('status') || 'active';

  let query = supabase.from('field_rows').select('*, blocks(name, product_id)', { count: 'exact' });
  if (blockId) query = query.eq('block_id', blockId);
  if (status !== 'all') query = query.eq('status', status);
  // Ordena por número de melga cuando existe, luego por nombre.
  query = query.order('row_number', { ascending: true, nullsFirst: false }).order('name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

async function handleGetOne(supabase: any, rowId: string) {
  const { data, error: dbError } = await supabase
    .from('field_rows')
    .select('*, blocks(name, product_id)')
    .eq('id', rowId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Melga no encontrada', 404);
  return success(data);
}

async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.name || body.name.trim().length === 0) return error('VALIDATION_ERROR', 'Nombre de la melga es requerido', 422);
  if (!body.block_id) return error('VALIDATION_ERROR', 'block_id es requerido', 422);

  let rowNumber: number | null = null;
  if (body.row_number !== undefined && body.row_number !== null) {
    if (!Number.isInteger(body.row_number) || body.row_number <= 0) {
      return error('VALIDATION_ERROR', 'Número de melga debe ser un entero mayor a 0', 422);
    }
    rowNumber = body.row_number;
  }

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // El block debe existir y pertenecer a la misma organización (la FK compuesta
  // igual lo garantiza, pero devolvemos un error de negocio más claro).
  const { data: block, error: bErr } = await supabase
    .from('blocks')
    .select('id, organization_id')
    .eq('id', body.block_id)
    .single();
  if (bErr || !block) return error('NOT_FOUND', 'Paño no encontrado', 404);

  const { data, error: dbError } = await supabase
    .from('field_rows')
    .insert({ organization_id: orgId, name: body.name.trim(), block_id: body.block_id, row_number: rowNumber })
    .select('*, blocks(name, product_id)')
    .single();
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

async function handlePut(req: Request, supabase: any, rowId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!rowId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.row_number !== undefined) {
    if (body.row_number === null) {
      updates.row_number = null;
    } else if (!Number.isInteger(body.row_number) || body.row_number <= 0) {
      return error('VALIDATION_ERROR', 'Número de melga debe ser un entero mayor a 0', 422);
    } else {
      updates.row_number = body.row_number;
    }
  }
  if (Object.keys(updates).length === 0) return error('VALIDATION_ERROR', 'Sin campos para actualizar', 422);

  const { data, error: dbError } = await supabase
    .from('field_rows')
    .update(updates)
    .eq('id', rowId)
    .select('*, blocks(name, product_id)')
    .single();
  if (dbError) return error('NOT_FOUND', 'Melga no encontrada', 404);
  return success(data);
}

async function handlePatchStatus(req: Request, supabase: any, rowId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const body = await req.json();
  if (!['active', 'inactive'].includes(body.status)) {
    return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
  }

  // Al desactivar, advierte si hay producción registrada hoy en esta melga
  // (en la zona horaria del tenant). Se puede forzar con force: true.
  if (body.status === 'inactive') {
    const today = await getOrgWorkday(supabase, orgId);
    const { count } = await supabase
      .from('picking_records')
      .select('*', { count: 'exact', head: true })
      .eq('row_id', rowId)
      .eq('work_day', today);
    if (count && count > 0 && !body.force) {
      return error('VALIDATION_ERROR', `Hay ${count} registros de picking activos hoy en esta melga. Envíe force: true para confirmar.`, 409);
    }
  }

  const { data, error: dbError } = await supabase.from('field_rows').update({ status: body.status }).eq('id', rowId).select().single();
  if (dbError) return error('NOT_FOUND', 'Melga no encontrada', 404);
  return success(data);
}
