import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const subResource = pathParts[1] || null; // "scan", "my", or record ID

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // GET /picking-records/my or /picking-records/my/today
  if (req.method === 'GET' && subResource === 'my') {
    const todayOnly = pathParts[2] === 'today';
    return await handleGetMy(supabase, url, todayOnly);
  }

  // POST /picking-records/scan
  if (req.method === 'POST' && subResource === 'scan') {
    return await handleScan(req, supabase);
  }

  switch (req.method) {
    case 'GET':
      return await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, subResource);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /picking-records — list with filters (admin/supervisor) */
async function handleGetList(supabase: any, url: URL) {
  let query = supabase.from('picking_records')
    .select('*, workers!picking_records_worker_id_fkey(full_name), blocks(name, products(name))', { count: 'exact' });

  const workerId = url.searchParams.get('worker_id');
  const blockId = url.searchParams.get('block_id');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const workDay = url.searchParams.get('work_day');

  if (workerId) query = query.eq('worker_id', workerId);
  if (blockId) query = query.eq('block_id', blockId);
  if (workDay) query = query.eq('work_day', workDay);
  if (dateFrom) query = query.gte('work_day', dateFrom);
  if (dateTo) query = query.lte('work_day', dateTo);

  query = query.order('recorded_at', { ascending: false });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** GET /picking-records/my[/today] — worker's own records */
async function handleGetMy(supabase: any, url: URL, todayOnly: boolean) {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase.from('picking_records')
    .select('id, block_id, quantity, rate_amount_snapshot, recorded_at, work_day, blocks(name)');

  if (todayOnly) {
    query = query.eq('work_day', today);
  }

  query = query.order('recorded_at', { ascending: false });

  if (!todayOnly) {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);
  }

  const { data, error: dbError } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);

  // Calculate totals
  const totalUnits = (data || []).reduce((sum: number, r: any) => sum + Number(r.quantity), 0);
  const estimatedEarnings = (data || []).reduce(
    (sum: number, r: any) => sum + Number(r.quantity) * Number(r.rate_amount_snapshot), 0
  );

  return success({
    work_day: today,
    total_units: totalUnits,
    estimated_earnings: Math.round(estimatedEarnings * 100) / 100,
    records: (data || []).map((r: any) => ({
      id: r.id,
      block_name: r.blocks?.name || '',
      quantity: Number(r.quantity),
      rate: Number(r.rate_amount_snapshot),
      subtotal: Math.round(Number(r.quantity) * Number(r.rate_amount_snapshot) * 100) / 100,
      recorded_at: r.recorded_at,
    })),
  });
}

/** POST /picking-records — create record (supervisor/admin) */
async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;

  const body = await req.json();
  return await createPickingRecord(supabase, req, body.worker_id, body.block_id, body.quantity);
}

/** POST /picking-records/scan — create via QR scan */
async function handleScan(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.qr_code) return error('VALIDATION_ERROR', 'qr_code es requerido', 422);

  // Resolve worker from QR UUID
  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .select('id, full_name, status')
    .eq('qr_badge_url', body.qr_code)
    .single();

  if (workerError || !worker) return error('NOT_FOUND', 'Badge QR no reconocido', 404);
  if (worker.status !== 'active') return error('WORKER_NOT_ACTIVE', 'Trabajador no está activo', 409);

  return await createPickingRecord(supabase, req, worker.id, body.block_id, body.quantity);
}

/** PUT /picking-records/:id — correct record (same work_day only) */
async function handlePut(req: Request, supabase: any, recordId: string | null) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;
  if (!recordId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const body = await req.json();
  if (!body.quantity || body.quantity <= 0) {
    return error('QUANTITY_MUST_BE_POSITIVE', 'Cantidad debe ser mayor a 0', 422);
  }

  // Get original record
  const { data: original, error: origError } = await supabase
    .from('picking_records')
    .select('*')
    .eq('id', recordId)
    .single();

  if (origError) return error('NOT_FOUND', 'Registro no encontrado', 404);

  // Check same work_day
  const today = new Date().toISOString().split('T')[0];
  if (original.work_day !== today) {
    return error('CORRECTION_OUTSIDE_WORKDAY', 'Solo se puede corregir registros del día actual', 409);
  }

  // Get current rate for the block's product
  const { data: block } = await supabase.from('blocks').select('product_id').eq('id', original.block_id).single();
  const { data: rate } = await supabase.from('rates').select('amount').eq('product_id', block.product_id).eq('status', 'current').single();

  // Decode JWT for recorded_by
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
  const payload = JSON.parse(atob(token.split('.')[1]!));

  // Tenant: el organization_id se toma del token del usuario que registra (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // Create correction record pointing to original
  const { data, error: dbError } = await supabase
    .from('picking_records')
    .insert({
      organization_id: orgId,
      worker_id: original.worker_id,
      block_id: original.block_id,
      quantity: body.quantity,
      rate_amount_snapshot: rate?.amount || original.rate_amount_snapshot,
      work_day: today,
      recorded_by: payload.worker_id,
      original_record_id: recordId,
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}

/** Shared logic: create a picking record with validations */
async function createPickingRecord(supabase: any, req: Request, workerId: string, blockId: string, quantity: number) {
  if (!workerId) return error('VALIDATION_ERROR', 'worker_id es requerido', 422);
  if (!blockId) return error('VALIDATION_ERROR', 'block_id es requerido', 422);
  if (!quantity || quantity <= 0) return error('QUANTITY_MUST_BE_POSITIVE', 'Cantidad debe ser mayor a 0', 422);

  // Validate worker is active
  const { data: worker, error: wErr } = await supabase
    .from('workers')
    .select('id, status')
    .eq('id', workerId)
    .single();
  if (wErr || !worker) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  if (worker.status !== 'active') return error('WORKER_NOT_ACTIVE', 'Trabajador no está activo', 409);

  // Validate block is active and get product_id + campo (para resolver crew_mode)
  const { data: block, error: bErr } = await supabase
    .from('blocks')
    .select('id, status, product_id, name, field:fields(crew_mode_enabled, organization:organizations(crew_mode_enabled))')
    .eq('id', blockId)
    .single();
  if (bErr || !block) return error('NOT_FOUND', 'Paño no encontrado', 404);
  if (block.status !== 'active') return error('BLOCK_NOT_ACTIVE', 'Paño no está activo', 409);

  // Modo Capataz efectivo del campo: override del campo, o default de la organización.
  // Nota (Req. 8.5): el registro de producción NO cambia según crew_mode; este valor
  // es informativo y se usa en la liquidación (Fase 3), sin duplicar el picking_record.
  const fieldCrewMode = block.field?.crew_mode_enabled;
  const orgCrewMode = block.field?.organization?.crew_mode_enabled ?? false;
  const crewModeEffective = fieldCrewMode === null || fieldCrewMode === undefined ? orgCrewMode : fieldCrewMode;

  // Get current rate for the product
  const { data: rate, error: rErr } = await supabase
    .from('rates')
    .select('amount')
    .eq('product_id', block.product_id)
    .eq('status', 'current')
    .single();
  if (rErr || !rate) return error('NOT_FOUND', 'No hay tarifa vigente para este producto', 404);

  // Decode JWT for recorded_by
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
  const payload = JSON.parse(atob(token.split('.')[1]!));

  // Tenant: el organization_id se toma del token del usuario que registra (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const today = new Date().toISOString().split('T')[0];

  const { data, error: dbError } = await supabase
    .from('picking_records')
    .insert({
      organization_id: orgId,
      worker_id: workerId,
      block_id: blockId,
      quantity,
      rate_amount_snapshot: rate.amount,
      work_day: today,
      recorded_by: payload.worker_id,
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);

  return success({
    ...data,
    worker_name: worker.full_name || '',
    block_name: block.name || '',
    estimated_payment: Math.round(quantity * rate.amount * 100) / 100,
    crew_mode_effective: crewModeEffective,
  }, 201);
}
