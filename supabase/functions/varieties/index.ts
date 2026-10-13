import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

// Variedades de producto (nivel jerárquico bajo el producto). CRUD admin-only
// (requireRole(['admin']), sin requirePermission — mismo patrón que products/blocks).
// El aislamiento entre clientes lo garantiza RLS; organization_id de los
// registros nuevos lo pone el trigger set_organization_id (nunca el cliente).
// Sin DELETE físico: las FKs son ON DELETE RESTRICT, la baja es soft vía status.

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ["varieties"] or ["varieties", ":id"]
  const varietyId = pathParts[1] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  switch (req.method) {
    case 'GET':
      return varietyId ? await handleGetOne(supabase, varietyId) : await handleGetList(req, supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, varietyId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /varieties?product_id=X[&status=active|all] — product_id OBLIGATORIO */
async function handleGetList(req: Request, supabase: any, url: URL) {
  const productId = url.searchParams.get('product_id');
  if (!productId) return error('VALIDATION_ERROR', 'product_id es requerido', 422);

  // status omitido => 'active'; 'all' solo lo honra un admin; valor inválido => 422.
  const statusParam = url.searchParams.get('status') || 'active';
  if (!['active', 'inactive', 'all'].includes(statusParam)) {
    return error('VALIDATION_ERROR', 'status debe ser "active", "inactive" o "all"', 422);
  }

  let effectiveStatus = statusParam;
  if (statusParam === 'all') {
    // 'all' solo para admin (platform_admin pasa el requireRole). Un no-admin cae a 'active'.
    const roleError = requireRole(req, ['admin']);
    if (roleError) effectiveStatus = 'active';
  }

  let query = supabase
    .from('product_varieties')
    .select('*', { count: 'exact' })
    .eq('product_id', productId);
  if (effectiveStatus !== 'all') query = query.eq('status', effectiveStatus);
  query = query.order('name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** GET /varieties/:id */
async function handleGetOne(supabase: any, varietyId: string) {
  const { data, error: dbError } = await supabase
    .from('product_varieties')
    .select('*')
    .eq('id', varietyId)
    .single();
  if (dbError) return error('VARIETY_NOT_FOUND', 'Variedad no encontrada', 404);
  return success(data);
}

/** POST /varieties (admin only) */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre de la variedad es requerido', 422);
  }
  if (!body.product_id) return error('VALIDATION_ERROR', 'product_id es requerido', 422);

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const name = (body.name as string).trim();

  // El producto debe existir en el tenant.
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id')
    .eq('id', body.product_id)
    .single();
  if (pErr || !product) return error('NOT_FOUND', 'Producto no encontrado', 404);

  // Chequeo previo de nombre activo duplicado (case-insensitive) para un 409 legible.
  // El índice único parcial es la barrera dura por si hay carrera.
  const { data: dup } = await supabase
    .from('product_varieties')
    .select('id')
    .eq('product_id', body.product_id)
    .eq('status', 'active')
    .ilike('name', name)
    .maybeSingle();
  if (dup) return error('VARIETY_NAME_TAKEN', 'Ya existe una variedad activa con ese nombre en el producto', 409);

  // organization_id lo pone el trigger set_organization_id desde el claim org_id.
  const { data, error: dbError } = await supabase
    .from('product_varieties')
    .insert({ product_id: body.product_id, name })
    .select()
    .single();
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

/** PUT /varieties/:id (admin only): name / status */
async function handlePut(req: Request, supabase: any, varietyId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!varietyId) return error('VALIDATION_ERROR', 'ID de variedad requerido', 400);

  const body = await req.json();

  // Leer el original para conocer product_id y status actual.
  const { data: original, error: origError } = await supabase
    .from('product_varieties')
    .select('id, product_id, name, status')
    .eq('id', varietyId)
    .single();
  if (origError || !original) return error('VARIETY_NOT_FOUND', 'Variedad no encontrada', 404);

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return error('VALIDATION_ERROR', 'Nombre no puede estar vacío', 422);
    }
    updates.name = (body.name as string).trim();
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

  // Estado final tras el update (para las validaciones de reactivación/desactivación).
  const nextStatus = (updates.status as string) ?? original.status;
  const nextName = (updates.name as string) ?? original.name;

  // Desactivar una variedad con paños activos -> 409 con conteo, salvo force
  // (patrón blocks.handlePatchStatus).
  if (body.status === 'inactive' && original.status === 'active') {
    const { count } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .eq('variety_id', varietyId)
      .eq('status', 'active');
    if (count && count > 0 && !body.force) {
      return error(
        'VALIDATION_ERROR',
        `Hay ${count} paños activos con esta variedad. Envíe force: true para confirmar.`,
        409,
      );
    }
  }

  // Reactivar (o renombrar) a un nombre ya activo del mismo producto -> VARIETY_NAME_TAKEN.
  if (nextStatus === 'active') {
    const { data: dup } = await supabase
      .from('product_varieties')
      .select('id')
      .eq('product_id', original.product_id)
      .eq('status', 'active')
      .ilike('name', nextName)
      .neq('id', varietyId)
      .maybeSingle();
    if (dup) return error('VARIETY_NAME_TAKEN', 'Ya existe una variedad activa con ese nombre en el producto', 409);
  }

  const { data, error: dbError } = await supabase
    .from('product_varieties')
    .update(updates)
    .eq('id', varietyId)
    .select()
    .single();
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}
