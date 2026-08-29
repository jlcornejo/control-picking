import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ["crews"], ["crews", ":id"], ["crews", ":id", "members"]
  const crewId = pathParts[1] || null;
  const subResource = pathParts[2] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // POST /crews/:id/members  — asignar trabajador a la cuadrilla
  // DELETE /crews/:id/members — quitar trabajador de la cuadrilla
  if (crewId && subResource === 'members') {
    if (req.method === 'POST') return await handleAddMember(req, supabase, crewId);
    if (req.method === 'DELETE') return await handleRemoveMember(req, supabase, crewId);
    return error('NOT_FOUND', 'Método no soportado', 405);
  }

  switch (req.method) {
    case 'GET':
      return crewId ? await handleGetOne(supabase, crewId) : await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, crewId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /crews — listar cuadrillas (RLS restringe por org/rol) */
async function handleGetList(supabase: any, url: URL) {
  const status = url.searchParams.get('status') || 'active';
  let query = supabase
    .from('crews')
    .select('*, crew_lead:workers!crews_crew_lead_id_fkey(id, full_name)', { count: 'exact' });

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

/** GET /crews/:id */
async function handleGetOne(supabase: any, crewId: string) {
  const { data, error: dbError } = await supabase
    .from('crews')
    .select('*, crew_lead:workers!crews_crew_lead_id_fkey(id, full_name)')
    .eq('id', crewId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Cuadrilla no encontrada', 404);
  return success(data);
}

/** POST /crews — crear cuadrilla (admin) */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre de la cuadrilla es requerido', 422);
  }
  if (!body.crew_lead_id) {
    return error('VALIDATION_ERROR', 'crew_lead_id es requerido', 422);
  }

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // El crew_lead debe ser un worker de la org con rol crew_lead
  const { data: lead } = await supabase
    .from('workers')
    .select('id, role, status')
    .eq('id', body.crew_lead_id)
    .single();
  if (!lead || lead.status !== 'active') {
    return error('VALIDATION_ERROR', 'El encargado no existe o no está activo', 422);
  }
  if (lead.role !== 'crew_lead') {
    return error('CREW_LEAD_NOT_AUTHORIZED', 'El worker asignado debe tener rol crew_lead', 422);
  }

  const { data, error: dbError } = await supabase
    .from('crews')
    .insert({ organization_id: orgId, name: body.name.trim(), crew_lead_id: body.crew_lead_id })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

/** PUT /crews/:id — actualizar cuadrilla (admin) */
async function handlePut(req: Request, supabase: any, crewId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  if (!crewId) return error('VALIDATION_ERROR', 'ID de cuadrilla requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return error('VALIDATION_ERROR', 'Nombre no puede estar vacío', 422);
    }
    updates.name = body.name.trim();
  }
  if (body.crew_lead_id !== undefined) updates.crew_lead_id = body.crew_lead_id;
  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) {
      return error('VALIDATION_ERROR', 'Estado inválido', 422);
    }
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'No se proporcionaron campos para actualizar', 422);
  }

  const { data, error: dbError } = await supabase
    .from('crews')
    .update(updates)
    .eq('id', crewId)
    .select()
    .single();
  if (dbError) return error('NOT_FOUND', 'Cuadrilla no encontrada', 404);
  return success(data);
}

/** POST /crews/:id/members — asignar un trabajador a la cuadrilla (admin) */
async function handleAddMember(req: Request, supabase: any, crewId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.worker_id) return error('VALIDATION_ERROR', 'worker_id es requerido', 422);

  // RLS garantiza que solo se afecten workers de la misma organización.
  const { data, error: dbError } = await supabase
    .from('workers')
    .update({ crew_id: crewId })
    .eq('id', body.worker_id)
    .select('id, full_name, crew_id')
    .single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

/** DELETE /crews/:id/members — quitar un trabajador de la cuadrilla (admin) */
async function handleRemoveMember(req: Request, supabase: any, crewId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.worker_id) return error('VALIDATION_ERROR', 'worker_id es requerido', 422);

  const { data, error: dbError } = await supabase
    .from('workers')
    .update({ crew_id: null })
    .eq('id', body.worker_id)
    .eq('crew_id', crewId)
    .select('id, full_name, crew_id')
    .single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado en la cuadrilla', 404);
  return success(data);
}
