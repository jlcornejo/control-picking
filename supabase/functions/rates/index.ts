import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, requirePermission, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Expected: /rates?product_id=X[&variety_id=Y] or /rates/current?product_id=X[&variety_id=Y]
  const subResource = pathParts[1] || null; // "current" or null

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  const productId = url.searchParams.get('product_id');
  const varietyId = url.searchParams.get('variety_id');

  switch (req.method) {
    case 'GET':
      if (subResource === 'current') return await handleGetCurrent(supabase, productId, varietyId);
      return await handleGetHistory(supabase, productId, varietyId);
    case 'POST':
      return await handlePost(req, supabase);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/**
 * Aplica el filtro de sujeto de tarifa (producto o variedad) a un query de rates.
 * Sin variety_id => tarifa a nivel de producto (variety_id IS NULL). Con
 * variety_id => tarifa específica de esa variedad.
 */
function applySubjectFilter(query: any, productId: string, varietyId: string | null) {
  query = query.eq('product_id', productId);
  return varietyId ? query.eq('variety_id', varietyId) : query.is('variety_id', null);
}

/** GET /rates?product_id=X[&variety_id=Y] — rate history for the subject */
async function handleGetHistory(supabase: any, productId: string | null, varietyId: string | null) {
  if (!productId) return error('VALIDATION_ERROR', 'product_id es requerido', 422);

  let query = supabase.from('rates').select('*');
  query = applySubjectFilter(query, productId, varietyId);
  query = query.order('effective_from', { ascending: false });

  const { data, error: dbError } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}

/** GET /rates/current?product_id=X[&variety_id=Y] — current active rate for the subject */
async function handleGetCurrent(supabase: any, productId: string | null, varietyId: string | null) {
  if (!productId) return error('VALIDATION_ERROR', 'product_id es requerido', 422);

  let query = supabase.from('rates').select('*').eq('status', 'current');
  query = applySubjectFilter(query, productId, varietyId);

  const { data, error: dbError } = await query.single();
  if (dbError) return error('NOT_FOUND', 'No hay tarifa vigente para este sujeto', 404);
  return success(data);
}

/** POST /rates — create new rate (admin only), marks previous (same subject) as historical */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const permError = requirePermission(req, 'rates.manage');
  if (permError) return permError;

  const body = await req.json();
  if (!body.product_id) return error('VALIDATION_ERROR', 'product_id es requerido', 422);
  if (!body.amount || body.amount <= 0) return error('RATE_MUST_BE_POSITIVE', 'Tarifa debe ser mayor a 0', 422);

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // variety_id opcional: si viene, debe existir en el tenant y pertenecer al producto.
  const varietyId: string | null = body.variety_id ?? null;
  if (varietyId) {
    const { data: variety, error: vErr } = await supabase
      .from('product_varieties')
      .select('product_id')
      .eq('id', varietyId)
      .single();
    if (vErr || !variety) return error('VARIETY_NOT_FOUND', 'Variedad no encontrada', 404);
    if (variety.product_id !== body.product_id) {
      return error('VARIETY_PRODUCT_MISMATCH', 'La variedad no pertenece al producto indicado', 422);
    }
  }

  // Marcar como histórica la tarifa current del MISMO sujeto (producto o variedad):
  //   con variety_id   -> product_id=X AND variety_id=Y AND status=current
  //   sin variety_id   -> product_id=X AND variety_id IS NULL AND status=current
  let historicalQuery = supabase.from('rates').update({ status: 'historical' }).eq('status', 'current');
  historicalQuery = applySubjectFilter(historicalQuery, body.product_id, varietyId);
  await historicalQuery;

  // Insert new current rate (variety_id NULL = tarifa de producto)
  const { data, error: dbError } = await supabase
    .from('rates')
    .insert({
      organization_id: orgId,
      product_id: body.product_id,
      variety_id: varietyId,
      amount: body.amount,
      effective_from: body.effective_from || new Date().toISOString(),
      status: 'current',
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}
