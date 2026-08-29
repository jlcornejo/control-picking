import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, createServiceClient, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const workerId = pathParts[1] || null;
  const subResource = pathParts[2] || null; // "status" or "badge"

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // PATCH /workers/:id/status
  if (req.method === 'PATCH' && workerId && subResource === 'status') {
    return await handlePatchStatus(req, supabase, workerId);
  }

  // POST /workers/:id/badge
  if (req.method === 'POST' && workerId && subResource === 'badge') {
    return await handleRegenerateBadge(req, supabase, workerId);
  }

  switch (req.method) {
    case 'GET':
      return workerId ? await handleGetOne(supabase, workerId) : await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, workerId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

async function handleGetList(supabase: any, url: URL) {
  const status = url.searchParams.get('status') || 'active';
  const role = url.searchParams.get('role');

  let query = supabase.from('workers').select('id, full_name, phone, role, status, qr_badge_url, created_at', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (role) query = query.eq('role', role);
  query = query.order('full_name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

async function handleGetOne(supabase: any, workerId: string) {
  const { data, error: dbError } = await supabase
    .from('workers')
    .select('*')
    .eq('id', workerId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.full_name || body.full_name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre completo es requerido', 422);
  }
  if (!body.role || !['admin', 'supervisor', 'worker'].includes(body.role)) {
    return error('VALIDATION_ERROR', 'Rol debe ser admin, supervisor o worker', 422);
  }

  // Create auth user if email provided
  let authUserId: string | null = null;
  if (body.email && body.password) {
    const serviceClient = createServiceClient();
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (authError) return error('VALIDATION_ERROR', `Error creando usuario: ${authError.message}`, 400);
    authUserId = authData.user.id;
  }

  // Generate QR badge UUID
  const qrUuid = crypto.randomUUID();

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data, error: dbError } = await supabase
    .from('workers')
    .insert({
      organization_id: orgId,
      full_name: body.full_name.trim(),
      national_id: body.national_id || null,
      phone: body.phone || null,
      role: body.role,
      qr_badge_url: qrUuid, // Store QR UUID (image generation done client-side or separately)
      auth_user_id: authUserId,
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

async function handlePut(req: Request, supabase: any, workerId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!workerId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
  if (body.national_id !== undefined) updates.national_id = body.national_id;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.role !== undefined) {
    if (!['admin', 'supervisor', 'worker'].includes(body.role)) {
      return error('VALIDATION_ERROR', 'Rol inválido', 422);
    }
    updates.role = body.role;
  }
  if (Object.keys(updates).length === 0) return error('VALIDATION_ERROR', 'Sin campos para actualizar', 422);

  const { data, error: dbError } = await supabase.from('workers').update(updates).eq('id', workerId).select().single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

async function handlePatchStatus(req: Request, supabase: any, workerId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!['active', 'inactive'].includes(body.status)) {
    return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
  }

  // If deactivating, check for pending settlements
  if (body.status === 'inactive') {
    const { count } = await supabase
      .from('settlements')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .in('status', ['pending', 'partial']);

    if (count && count > 0) {
      return error('WORKER_HAS_PENDING_DEBT', `Trabajador tiene ${count} liquidación(es) pendiente(s) de pago. Resuelva antes de desactivar.`, 409);
    }
  }

  const { data, error: dbError } = await supabase.from('workers').update({ status: body.status }).eq('id', workerId).select().single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

async function handleRegenerateBadge(req: Request, supabase: any, workerId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const newQrUuid = crypto.randomUUID();
  const { data, error: dbError } = await supabase
    .from('workers')
    .update({ qr_badge_url: newQrUuid })
    .eq('id', workerId)
    .select()
    .single();

  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}
