import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';
import { getOrgWorkday } from '../_shared/workday.ts';

// Select embebido de blocks con variedad. Las FKs compuestas de tenant requieren
// el HINT del nombre de constraint en PostgREST (sin él arriesga PGRST200):
//   products!fk_blocks_product_org / product_varieties!fk_blocks_variety_org.
const BLOCK_SELECT =
  '*, products!fk_blocks_product_org(name, unit_measure), product_varieties!fk_blocks_variety_org(name), fields(name)';

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

  let query = supabase.from('blocks').select(BLOCK_SELECT, { count: 'exact' });
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
    .select(BLOCK_SELECT)
    .eq('id', blockId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Paño no encontrado', 404);
  return success(data);
}

/**
 * Validación espejo del trigger validate_block_variety para devolver un 422
 * legible antes de llegar a la DB. El trigger M3 es la barrera dura.
 *   - producto con variedades activas -> variety_id obligatorio y del producto.
 *   - producto sin variedades activas -> variety_id debe ser NULL.
 */
async function validateVariety(
  supabase: any,
  orgId: string,
  productId: string,
  varietyId: string | null,
): Promise<Response | null> {
  // ¿El producto tiene al menos una variedad activa?
  const { count } = await supabase
    .from('product_varieties')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('status', 'active');
  const hasActiveVarieties = (count ?? 0) > 0;

  if (varietyId) {
    const { data: variety, error: vErr } = await supabase
      .from('product_varieties')
      .select('product_id')
      .eq('id', varietyId)
      .single();
    if (vErr || !variety) return error('VARIETY_NOT_FOUND', 'Variedad no encontrada', 404);
    if (variety.product_id !== productId) {
      return error('VARIETY_PRODUCT_MISMATCH', 'La variedad no pertenece al producto del paño', 422);
    }
  } else if (hasActiveVarieties) {
    return error('VARIETY_REQUIRED', 'El producto tiene variedades; debe elegir una', 422);
  }
  return null;
}

async function handlePost(req: Request, supabase: any, url: URL) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.name || body.name.trim().length === 0) return error('VALIDATION_ERROR', 'Nombre del paño es requerido', 422);
  if (!body.field_id) return error('VALIDATION_ERROR', 'field_id es requerido', 422);
  if (!body.product_id) return error('VALIDATION_ERROR', 'product_id es requerido', 422);
  if (!body.area || body.area <= 0) return error('VALIDATION_ERROR', 'Superficie debe ser mayor a 0', 422);

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const varietyId: string | null = body.variety_id ?? null;
  const varietyError = await validateVariety(supabase, orgId, body.product_id, varietyId);
  if (varietyError) return varietyError;

  const { data, error: dbError } = await supabase
    .from('blocks')
    .insert({ organization_id: orgId, name: body.name.trim(), field_id: body.field_id, product_id: body.product_id, variety_id: varietyId, area: body.area })
    .select(BLOCK_SELECT)
    .single();
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

async function handlePut(req: Request, supabase: any, blockId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!blockId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.product_id !== undefined) updates.product_id = body.product_id;
  if (body.variety_id !== undefined) updates.variety_id = body.variety_id ?? null;
  if (body.area !== undefined) {
    if (body.area <= 0) return error('VALIDATION_ERROR', 'Superficie debe ser mayor a 0', 422);
    updates.area = body.area;
  }
  if (Object.keys(updates).length === 0) return error('VALIDATION_ERROR', 'Sin campos para actualizar', 422);

  // Si cambia product_id o variety_id, revalidar la pareja (espejo del trigger).
  if (body.product_id !== undefined || body.variety_id !== undefined) {
    const { data: current, error: cErr } = await supabase
      .from('blocks')
      .select('product_id, variety_id')
      .eq('id', blockId)
      .single();
    if (cErr || !current) return error('NOT_FOUND', 'Paño no encontrado', 404);

    const nextProduct = body.product_id !== undefined ? body.product_id : current.product_id;
    const nextVariety = body.variety_id !== undefined ? (body.variety_id ?? null) : current.variety_id;
    const varietyError = await validateVariety(supabase, orgId, nextProduct, nextVariety);
    if (varietyError) return varietyError;
  }

  const { data, error: dbError } = await supabase.from('blocks').update(updates).eq('id', blockId).select(BLOCK_SELECT).single();
  if (dbError) return error('NOT_FOUND', 'Paño no encontrado', 404);
  return success(data);
}

async function handlePatchStatus(req: Request, supabase: any, blockId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const body = await req.json();
  if (!['active', 'inactive'].includes(body.status)) {
    return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
  }

  if (body.status === 'inactive') {
    const today = await getOrgWorkday(supabase, orgId);
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
