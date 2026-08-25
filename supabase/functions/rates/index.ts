import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Expected: /rates?product_id=X or /rates/current?product_id=X
  const subResource = pathParts[1] || null; // "current" or null

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  const productId = url.searchParams.get('product_id');

  switch (req.method) {
    case 'GET':
      if (subResource === 'current') return await handleGetCurrent(supabase, productId);
      return await handleGetHistory(supabase, url, productId);
    case 'POST':
      return await handlePost(req, supabase);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /rates?product_id=X — rate history */
async function handleGetHistory(supabase: any, url: URL, productId: string | null) {
  if (!productId) return error('VALIDATION_ERROR', 'product_id es requerido', 422);

  const { data, error: dbError } = await supabase
    .from('rates')
    .select('*')
    .eq('product_id', productId)
    .order('effective_from', { ascending: false });

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}

/** GET /rates/current?product_id=X — current active rate */
async function handleGetCurrent(supabase: any, productId: string | null) {
  if (!productId) return error('VALIDATION_ERROR', 'product_id es requerido', 422);

  const { data, error: dbError } = await supabase
    .from('rates')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'current')
    .single();

  if (dbError) return error('NOT_FOUND', 'No hay tarifa vigente para este producto', 404);
  return success(data);
}

/** POST /rates — create new rate (admin only), marks previous as historical */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.product_id) return error('VALIDATION_ERROR', 'product_id es requerido', 422);
  if (!body.amount || body.amount <= 0) return error('RATE_MUST_BE_POSITIVE', 'Tarifa debe ser mayor a 0', 422);

  // Mark current rate as historical
  await supabase
    .from('rates')
    .update({ status: 'historical' })
    .eq('product_id', body.product_id)
    .eq('status', 'current');

  // Insert new current rate
  const { data, error: dbError } = await supabase
    .from('rates')
    .insert({
      product_id: body.product_id,
      amount: body.amount,
      effective_from: body.effective_from || new Date().toISOString(),
      status: 'current',
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}
