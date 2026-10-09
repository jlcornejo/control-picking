import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';
import { getOrgWorkday } from '../_shared/workday.ts';

/**
 * Evalúa el peso neto contra la banda de tolerancia de un tipo de caja.
 * Réplica de `evaluateBoxTolerance` de @fundo360/shared (Deno no importa el
 * paquete directamente). Mantener ambas en sincronía. net = max(bruto - tara, 0).
 */
function evaluateTolerance(
  grossWeightKg: number,
  box: { tare_weight_kg: number; target_net_weight_kg: number; tolerance_over: number; tolerance_under: number; tolerance_unit: string },
) {
  const tare = Number(box.tare_weight_kg);
  const target = Number(box.target_net_weight_kg);
  const net = Math.max(Math.round((grossWeightKg - tare) * 1000) / 1000, 0);

  const overMargin = box.tolerance_unit === 'percent' ? (target * Number(box.tolerance_over)) / 100 : Number(box.tolerance_over);
  const underMargin = box.tolerance_unit === 'percent' ? (target * Number(box.tolerance_under)) / 100 : Number(box.tolerance_under);
  const maxNet = target + overMargin;
  const minNet = Math.max(target - underMargin, 0);

  const over = net > maxNet;
  const under = net < minNet;
  return { net, tare, over, under, out_of_tolerance: over || under };
}

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
    return await handleGetMy(req, supabase, url, todayOnly);
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
    .select('*, workers!picking_records_worker_id_fkey(full_name), blocks(name, products(name)), field_rows(name, row_number)', { count: 'exact' });

  const workerId = url.searchParams.get('worker_id');
  const blockId = url.searchParams.get('block_id');
  const rowId = url.searchParams.get('row_id');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const workDay = url.searchParams.get('work_day');

  if (workerId) query = query.eq('worker_id', workerId);
  if (blockId) query = query.eq('block_id', blockId);
  if (rowId) query = query.eq('row_id', rowId);
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
async function handleGetMy(req: Request, supabase: any, url: URL, todayOnly: boolean) {
  // work_day "hoy" en la zona horaria del tenant (no UTC)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);
  const today = await getOrgWorkday(supabase, orgId);

  let query = supabase.from('picking_records')
    .select('id, block_id, row_id, quantity, rate_amount_snapshot, recorded_at, work_day, blocks(name), field_rows(name, row_number)');

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
      row_name: r.field_rows?.name || null,
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
  return await createPickingRecord(supabase, req, body.worker_id, body.block_id, body.quantity, body.row_id ?? null, {
    boxTypeId: body.box_type_id ?? null,
    grossWeightKg: body.gross_weight_kg ?? null,
  });
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

  return await createPickingRecord(supabase, req, worker.id, body.block_id, body.quantity, body.row_id ?? null, {
    boxTypeId: body.box_type_id ?? null,
    grossWeightKg: body.gross_weight_kg ?? null,
  });
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

  // Tenant: el organization_id se toma del token del usuario que registra (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // Check same work_day (en la zona horaria del tenant, no UTC)
  const today = await getOrgWorkday(supabase, orgId);
  if (original.work_day !== today) {
    return error('CORRECTION_OUTSIDE_WORKDAY', 'Solo se puede corregir registros del día actual', 409);
  }

  // Ignorar correcciones sobre un registro que ya es una corrección/auditoría.
  if (original.original_record_id) {
    return error('VALIDATION_ERROR', 'No se puede corregir un registro de auditoría', 409);
  }

  // Decode JWT for recorded_by
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
  const payload = JSON.parse(atob(token.split('.')[1]!));

  // Modelo de corrección (soft-update, regla de dominio 11):
  //   1) Se conserva un SNAPSHOT de auditoría con los valores VIEJOS, apuntando
  //      al original (original_record_id = recordId). Este snapshot queda EXCLUIDO
  //      de los totales (todas las consultas filtran original_record_id IS NULL)
  //      y visible solo en el historial de Registros como "Corrección".
  //   2) Se EDITA el original in-place con la nueva cantidad. El original mantiene
  //      su id y original_record_id=NULL, por lo que sigue contando con el valor
  //      corregido. Se conserva la tarifa original (regla 14: la tarifa aplicada es
  //      la vigente al momento del registro, no la actual).
  const { error: snapErr } = await supabase
    .from('picking_records')
    .insert({
      organization_id: orgId,
      worker_id: original.worker_id,
      block_id: original.block_id,
      row_id: original.row_id,
      quantity: original.quantity,
      rate_amount_snapshot: original.rate_amount_snapshot,
      work_day: original.work_day,
      recorded_by: payload.worker_id,
      original_record_id: recordId,
      // Copiar el snapshot de destare del original para preservar la auditoría del pesaje.
      box_type_id: original.box_type_id ?? null,
      gross_weight_kg: original.gross_weight_kg ?? null,
      tare_snapshot_kg: original.tare_snapshot_kg ?? null,
      net_weight_kg: original.net_weight_kg ?? null,
      out_of_tolerance: original.out_of_tolerance ?? false,
    });
  if (snapErr) return error('VALIDATION_ERROR', snapErr.message, 400);

  const { data, error: dbError } = await supabase
    .from('picking_records')
    .update({ quantity: body.quantity })
    .eq('id', recordId)
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}

/** Shared logic: create a picking record with validations */
async function createPickingRecord(
  supabase: any,
  req: Request,
  workerId: string,
  blockId: string,
  quantity: number,
  rowId: string | null = null,
  box: { boxTypeId: string | null; grossWeightKg: number | null } = { boxTypeId: null, grossWeightKg: null },
) {
  if (!workerId) return error('VALIDATION_ERROR', 'worker_id es requerido', 422);
  if (!blockId) return error('VALIDATION_ERROR', 'block_id es requerido', 422);
  if (!quantity || quantity <= 0) return error('QUANTITY_MUST_BE_POSITIVE', 'Cantidad debe ser mayor a 0', 422);

  // Control de destare (opcional): box_type_id y gross_weight_kg van juntos.
  const usesTare = box.boxTypeId != null || box.grossWeightKg != null;
  if (usesTare && (box.boxTypeId == null || box.grossWeightKg == null)) {
    return error('VALIDATION_ERROR', 'box_type_id y gross_weight_kg deben ir juntos', 422);
  }
  if (usesTare && (!Number.isFinite(Number(box.grossWeightKg)) || Number(box.grossWeightKg) <= 0)) {
    return error('WEIGHT_MUST_BE_POSITIVE', 'Peso bruto debe ser mayor a 0', 422);
  }

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

  // Melga (opcional): si viene, debe existir, estar activa y pertenecer a ESTE block.
  if (rowId) {
    const { data: row, error: rowErr } = await supabase
      .from('field_rows')
      .select('id, status, block_id')
      .eq('id', rowId)
      .single();
    if (rowErr || !row) return error('NOT_FOUND', 'Melga no encontrada', 404);
    if (row.status !== 'active') return error('ROW_NOT_ACTIVE', 'Melga no está activa', 409);
    if (row.block_id !== blockId) return error('ROW_BLOCK_MISMATCH', 'La melga no pertenece a este paño', 409);
  }

  // Tipo de caja (opcional): si viene, debe existir, estar activa y pertenecer
  // al mismo tenant/block-product. Se congela la tara y se evalúa la tolerancia.
  let boxSnapshot: { box_type_id: string; gross_weight_kg: number; tare_snapshot_kg: number; net_weight_kg: number; out_of_tolerance: boolean } | null = null;
  if (usesTare) {
    const { data: boxType, error: boxErr } = await supabase
      .from('box_types')
      .select('id, status, tare_weight_kg, target_net_weight_kg, tolerance_over, tolerance_under, tolerance_unit')
      .eq('id', box.boxTypeId)
      .single();
    if (boxErr || !boxType) return error('BOX_TYPE_NOT_FOUND', 'Tipo de caja no encontrado', 404);
    if (boxType.status !== 'active') return error('BOX_TYPE_NOT_ACTIVE', 'Tipo de caja no está activo', 409);

    const gross = Number(box.grossWeightKg);
    const evalResult = evaluateTolerance(gross, boxType);
    boxSnapshot = {
      box_type_id: boxType.id,
      gross_weight_kg: gross,
      tare_snapshot_kg: evalResult.tare,
      net_weight_kg: evalResult.net,
      out_of_tolerance: evalResult.out_of_tolerance,
    };
  }

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

  // work_day NO se calcula aquí en UTC: lo fija el trigger set_picking_work_day
  // en la zona horaria de la organización (autoridad del servidor/DB).
  const { data, error: dbError } = await supabase
    .from('picking_records')
    .insert({
      organization_id: orgId,
      worker_id: workerId,
      block_id: blockId,
      row_id: rowId,
      quantity,
      rate_amount_snapshot: rate.amount,
      recorded_by: payload.worker_id,
      // Snapshot de destare (null si el tenant/producto no usa control de peso).
      box_type_id: boxSnapshot?.box_type_id ?? null,
      gross_weight_kg: boxSnapshot?.gross_weight_kg ?? null,
      tare_snapshot_kg: boxSnapshot?.tare_snapshot_kg ?? null,
      net_weight_kg: boxSnapshot?.net_weight_kg ?? null,
      out_of_tolerance: boxSnapshot?.out_of_tolerance ?? false,
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
    // Alerta de merma: true si el peso neto quedó fuera de tolerancia (no bloqueante).
    out_of_tolerance: boxSnapshot?.out_of_tolerance ?? false,
  }, 201);
}
