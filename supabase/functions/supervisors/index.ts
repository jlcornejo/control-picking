import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // /supervisors/:id/assignments, /supervisors/:id/workers, /supervisors/:id/blocks
  const supervisorId = pathParts[1] || null;
  const subResource = pathParts[2] || null; // "assignments", "workers", "blocks"
  const targetId = pathParts[3] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  if (!supervisorId) return error('VALIDATION_ERROR', 'supervisor_id requerido', 400);

  // GET /supervisors/:id/assignments
  if (req.method === 'GET' && subResource === 'assignments') {
    return await handleGetAssignments(supabase, supervisorId);
  }

  // POST /supervisors/:id/workers — assign worker
  if (req.method === 'POST' && subResource === 'workers') {
    return await handleAssignWorker(req, supabase, supervisorId);
  }

  // POST /supervisors/:id/blocks — assign block
  if (req.method === 'POST' && subResource === 'blocks') {
    return await handleAssignBlock(req, supabase, supervisorId);
  }

  // DELETE /supervisors/:id/workers/:wId — unassign worker
  if (req.method === 'DELETE' && subResource === 'workers' && targetId) {
    return await handleUnassignWorker(req, supabase, supervisorId, targetId);
  }

  // DELETE /supervisors/:id/blocks/:bId — unassign block
  if (req.method === 'DELETE' && subResource === 'blocks' && targetId) {
    return await handleUnassignBlock(req, supabase, supervisorId, targetId);
  }

  return error('NOT_FOUND', 'Ruta no encontrada', 404);
});

async function handleGetAssignments(supabase: any, supervisorId: string) {
  const { data: workerAssignments } = await supabase
    .from('supervisor_assignments')
    .select('id, worker_id, workers!supervisor_assignments_worker_id_fkey(full_name, role, status)')
    .eq('supervisor_id', supervisorId)
    .not('worker_id', 'is', null);

  const { data: blockAssignments } = await supabase
    .from('supervisor_assignments')
    .select('id, block_id, blocks(name, area, status, fields(name))')
    .eq('supervisor_id', supervisorId)
    .not('block_id', 'is', null);

  return success({
    workers: (workerAssignments || []).map((a: any) => ({
      assignment_id: a.id,
      worker_id: a.worker_id,
      ...a.workers,
    })),
    blocks: (blockAssignments || []).map((a: any) => ({
      assignment_id: a.id,
      block_id: a.block_id,
      ...a.blocks,
    })),
  });
}

async function handleAssignWorker(req: Request, supabase: any, supervisorId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.worker_id) return error('VALIDATION_ERROR', 'worker_id es requerido', 422);

  const { data, error: dbError } = await supabase
    .from('supervisor_assignments')
    .insert({ supervisor_id: supervisorId, worker_id: body.worker_id })
    .select()
    .single();

  if (dbError) {
    if (dbError.code === '23505') return error('VALIDATION_ERROR', 'Trabajador ya está asignado a este supervisor', 409);
    return error('VALIDATION_ERROR', dbError.message, 400);
  }
  return success(data, 201);
}

async function handleAssignBlock(req: Request, supabase: any, supervisorId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.block_id) return error('VALIDATION_ERROR', 'block_id es requerido', 422);

  const { data, error: dbError } = await supabase
    .from('supervisor_assignments')
    .insert({ supervisor_id: supervisorId, block_id: body.block_id })
    .select()
    .single();

  if (dbError) {
    if (dbError.code === '23505') return error('VALIDATION_ERROR', 'Paño ya está asignado a este supervisor', 409);
    return error('VALIDATION_ERROR', dbError.message, 400);
  }
  return success(data, 201);
}

async function handleUnassignWorker(req: Request, supabase: any, supervisorId: string, workerId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const { error: dbError } = await supabase
    .from('supervisor_assignments')
    .delete()
    .eq('supervisor_id', supervisorId)
    .eq('worker_id', workerId);

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success({ message: 'Trabajador desasignado' });
}

async function handleUnassignBlock(req: Request, supabase: any, supervisorId: string, blockId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const { error: dbError } = await supabase
    .from('supervisor_assignments')
    .delete()
    .eq('supervisor_id', supervisorId)
    .eq('block_id', blockId);

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success({ message: 'Paño desasignado' });
}
