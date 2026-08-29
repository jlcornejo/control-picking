import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts: ["products"] or ["products", ":id"]
  const productId = pathParts[1] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  switch (req.method) {
    case 'GET':
      return await handleGet(supabase, url, productId);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, productId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /products or GET /products/:id */
async function handleGet(supabase: any, url: URL, productId: string | null) {
  if (productId) {
    const { data, error: dbError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (dbError) return error('NOT_FOUND', 'Producto no encontrado', 404);
    return success(data);
  }

  // List with optional status filter
  const status = url.searchParams.get('status') || 'active';
  let query = supabase.from('products').select('*', { count: 'exact' });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = query.order('name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);

  return success(data, 200, { page, total: count ?? 0, limit });
}

/** POST /products (admin only) */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();

  // Validate
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre del producto es requerido', 422);
  }
  if (!body.unit_measure || !['box', 'kg'].includes(body.unit_measure)) {
    return error('VALIDATION_ERROR', 'Unidad de medida debe ser "box" o "kg"', 422);
  }

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data, error: dbError } = await supabase
    .from('products')
    .insert({
      organization_id: orgId,
      name: body.name.trim(),
      unit_measure: body.unit_measure,
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

/** PUT /products/:id (admin only) */
async function handlePut(req: Request, supabase: any, productId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  if (!productId) return error('VALIDATION_ERROR', 'ID de producto requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return error('VALIDATION_ERROR', 'Nombre no puede estar vacío', 422);
    }
    updates.name = body.name.trim();
  }

  if (body.unit_measure !== undefined) {
    if (!['box', 'kg'].includes(body.unit_measure)) {
      return error('VALIDATION_ERROR', 'Unidad de medida debe ser "box" o "kg"', 422);
    }
    updates.unit_measure = body.unit_measure;
  }

  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) {
      return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'No se proporcionaron campos para actualizar', 422);
  }

  const { data, error: dbError } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select()
    .single();

  if (dbError) return error('NOT_FOUND', 'Producto no encontrado', 404);
  return success(data);
}
