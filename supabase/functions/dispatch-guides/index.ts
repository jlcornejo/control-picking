import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';
import { resolveFlagForOrg } from '../_shared/feature-flags.ts';

// ============================================================
// Dispatch guides (F-04) — logística: fruta que SALE del campo -> cliente.
// Agrega picking_records (bandejas + peso) por paño o por campo/día, permite
// registrar la recepción del cliente y comparar despachado vs recibido.
// NUNCA lee ni escribe settlements/payments ni modifica picking_records
// (solo los LEE para agregar el contenido logístico). Gating por el feature
// flag `dispatch_guides` (defensa en profundidad, además del gating web).
// ============================================================

const FLAG_KEY = 'dispatch_guides';

// Enum replica (keep in lockstep with @fundo360/shared DispatchWeightSource and
// the SQL CHECK on dispatch_guides.weight_source). Deno can't import shared.
const WEIGHT_SOURCE = { SCALE: 'scale', ESTIMATED: 'estimated', MIXED: 'mixed' } as const;

/** Minimal picking shape to aggregate the guide's logistic content. */
interface DispatchWeightInput {
  quantity: number;
  net_weight_kg: number | null;
  box_type_target_net_kg: number | null;
}

/**
 * Replica of @fundo360/shared `aggregateDispatchWeight`. KEEP IN SYNC with shared.
 * net_weight_kg present -> precise (scale); absent -> estimated =
 * quantity * box_type_target_net_kg (0 when no target).
 */
function aggregateDispatchWeight(records: DispatchWeightInput[]): {
  total_trays: number;
  total_weight_kg: number;
  weight_precise: boolean;
  weight_source: string;
} {
  let trays = 0;
  let weight = 0;
  let anyScale = false;
  let anyEstimated = false;
  for (const r of records) {
    trays += Number(r.quantity);
    if (r.net_weight_kg != null) {
      weight += Number(r.net_weight_kg);
      anyScale = true;
    } else {
      weight += Number(r.quantity) * Number(r.box_type_target_net_kg ?? 0);
      anyEstimated = true;
    }
  }
  const source: string = anyScale && anyEstimated
    ? WEIGHT_SOURCE.MIXED
    : anyScale
    ? WEIGHT_SOURCE.SCALE
    : WEIGHT_SOURCE.ESTIMATED;
  return {
    total_trays: Math.round(trays * 100) / 100,
    total_weight_kg: Math.round(weight * 1000) / 1000,
    weight_precise: source === WEIGHT_SOURCE.SCALE,
    weight_source: source,
  };
}

/**
 * Replica of @fundo360/shared `compareDispatch`. KEEP IN SYNC with shared.
 * received = sum of dispatch_receipts (0 when none). Positive diff = merma.
 */
function compareDispatch(
  dispatchedTrays: number,
  dispatchedWeightKg: number,
  receivedTrays: number | null,
  receivedWeightKg: number | null,
) {
  const rt = Number(receivedTrays ?? 0);
  const rw = Number(receivedWeightKg ?? 0);
  const traysDiff = Math.round((dispatchedTrays - rt) * 100) / 100;
  const weightDiff = Math.round((dispatchedWeightKg - rw) * 1000) / 1000;
  const pct = dispatchedWeightKg > 0
    ? Math.round((weightDiff / dispatchedWeightKg) * 10000) / 100
    : 0;
  return {
    dispatched_trays: dispatchedTrays,
    dispatched_weight_kg: dispatchedWeightKg,
    received_trays: rt,
    received_weight_kg: rw,
    trays_diff: traysDiff,
    weight_diff_kg: weightDiff,
    weight_shrinkage_pct: pct,
    has_receipt: receivedTrays != null || receivedWeightKg != null,
  };
}

/** Correlation id for structured logs (no secrets/PII). */
function correlationId(req: Request): string {
  return req.headers.get('x-request-id') || crypto.randomUUID();
}

/** worker_id claim from the JWT (write identity for created_by/recorded_by). */
function getWorkerId(req: Request): string | null {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!));
    const wid = payload.worker_id;
    return typeof wid === 'string' && wid.length > 0 ? wid : null;
  } catch {
    return null;
  }
}

/**
 * Map a PostgreSQL error to a structured API error. Disambiguates 23505 unique
 * violations by constraint name (design §5.3). `fallbackStatus` for generic DB
 * errors. `cid` used for structured logging on fatal/unexpected failures.
 */
// deno-lint-ignore no-explicit-any
function mapDbError(dbError: any, cid: string, fallbackStatus = 400): Response {
  if (dbError?.code === '23505') {
    const c = String(dbError.constraint || dbError.message || '');
    if (c.includes('uq_dispatch_guide_number')) {
      return error('DISPATCH_GUIDE_NUMBER_TAKEN', 'Ya existe una guía con ese número en la organización', 409);
    }
    if (c.includes('uq_dispatch_field_day')) {
      return error('DISPATCH_FIELD_GUIDE_EXISTS', 'Ya existe un cierre de campo para esa jornada', 409);
    }
    if (c.includes('uq_dispatch_receipt_one_per_guide')) {
      return error('DISPATCH_RECEIPT_ALREADY_EXISTS', 'La guía ya tiene una recepción registrada', 409);
    }
  }
  // The closed-guide immutability trigger raises a plpgsql exception.
  if (typeof dbError?.message === 'string' && dbError.message.includes('Closed dispatch guide')) {
    return error('DISPATCH_GUIDE_CLOSED', 'La guía está cerrada; reábrala antes de editar', 409);
  }
  console.error(JSON.stringify({ level: 'error', correlation_id: cid, msg: 'dispatch db error', code: dbError?.code ?? null }));
  return error('VALIDATION_ERROR', dbError?.message ?? 'Error de base de datos', fallbackStatus);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts = ["dispatch-guides", (:id | "suggestion")?, ("close"|"reopen"|"receipt")?]
  const seg1 = pathParts[1] || null;
  const seg2 = pathParts[2] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;
  if (!user) return error('UNAUTHORIZED', 'No autenticado', 401);

  const cid = correlationId(req);

  // 'suggestion' is a literal sub-path checked BEFORE treating seg1 as :id (NIT-3).
  if (seg1 === 'suggestion') {
    if (req.method !== 'GET') return error('NOT_FOUND', 'Método no soportado', 405);
    return await handleSuggestion(supabase, url, cid);
  }

  // Collection routes: /dispatch-guides
  if (!seg1) {
    if (req.method === 'GET') return await handleList(supabase, url, cid);
    if (req.method === 'POST') return await handleCreate(req, supabase, cid);
    return error('NOT_FOUND', 'Método no soportado', 405);
  }

  // Item + sub-action routes: /dispatch-guides/:id[/close|reopen|receipt]
  const guideId = seg1;

  if (seg2 === 'close' && req.method === 'POST') return await handleClose(req, supabase, guideId, cid);
  if (seg2 === 'reopen' && req.method === 'POST') return await handleReopen(req, supabase, guideId, cid);
  if (seg2 === 'receipt' && req.method === 'POST') return await handleCreateReceipt(req, supabase, guideId, cid);
  if (seg2 === 'receipt' && req.method === 'PUT') return await handleUpdateReceipt(req, supabase, guideId, cid);

  if (!seg2) {
    if (req.method === 'GET') return await handleGetOne(supabase, guideId, cid);
    if (req.method === 'PUT') return await handleUpdate(req, supabase, guideId, cid);
  }

  return error('NOT_FOUND', 'Ruta no encontrada', 404);
});

/** Shared backend flag gate for write operations. Returns Response if blocked. */
// deno-lint-ignore no-explicit-any
async function assertFlagEnabled(req: Request, supabase: any): Promise<Response | null> {
  const orgId = getOrgId(req);
  const enabled = await resolveFlagForOrg(supabase, orgId, FLAG_KEY);
  if (!enabled) {
    return error('DISPATCH_FEATURE_DISABLED', 'La función de guías de despacho no está habilitada para esta organización', 403);
  }
  return null;
}

/** Aggregate picking of a single block for a day (originals only). */
// deno-lint-ignore no-explicit-any
async function aggregateGroupByBlock(supabase: any, blockId: string, workDay: string) {
  const { data, error: dbError } = await supabase
    .from('picking_records')
    .select('quantity, net_weight_kg, box_type_id, box_types(target_net_weight_kg)')
    .eq('work_day', workDay)
    .eq('block_id', blockId)
    .is('original_record_id', null);
  if (dbError) return { records: null, dbError };
  // deno-lint-ignore no-explicit-any
  const records: DispatchWeightInput[] = (data || []).map((r: any) => ({
    quantity: Number(r.quantity),
    net_weight_kg: r.net_weight_kg == null ? null : Number(r.net_weight_kg),
    box_type_target_net_kg: r.box_types?.target_net_weight_kg == null ? null : Number(r.box_types.target_net_weight_kg),
  }));
  return { records, dbError: null };
}

/** Aggregate picking of a whole field for a day (originals only). */
// deno-lint-ignore no-explicit-any
async function aggregateFieldGroup(supabase: any, fieldId: string, workDay: string) {
  const { data: blocks, error: bErr } = await supabase
    .from('blocks').select('id').eq('field_id', fieldId);
  if (bErr) return { records: null, dbError: bErr };
  // deno-lint-ignore no-explicit-any
  const blockIds = (blocks || []).map((b: any) => b.id);
  if (blockIds.length === 0) return { records: [], dbError: null };

  const { data, error: dbError } = await supabase
    .from('picking_records')
    .select('quantity, net_weight_kg, box_type_id, box_types(target_net_weight_kg)')
    .eq('work_day', workDay)
    .is('original_record_id', null)
    .in('block_id', blockIds);
  if (dbError) return { records: null, dbError };
  // deno-lint-ignore no-explicit-any
  const records: DispatchWeightInput[] = (data || []).map((r: any) => ({
    quantity: Number(r.quantity),
    net_weight_kg: r.net_weight_kg == null ? null : Number(r.net_weight_kg),
    box_type_target_net_kg: r.box_types?.target_net_weight_kg == null ? null : Number(r.box_types.target_net_weight_kg),
  }));
  return { records, dbError: null };
}

/** GET /dispatch-guides — list with filters (paginated). */
// deno-lint-ignore no-explicit-any
async function handleList(supabase: any, url: URL, cid: string) {
  let query = supabase.from('dispatch_guides').select('*', { count: 'exact' });

  const scope = url.searchParams.get('scope');
  const fieldId = url.searchParams.get('field_id');
  const blockId = url.searchParams.get('block_id');
  const status = url.searchParams.get('status');
  const workDay = url.searchParams.get('work_day');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');

  if (scope) query = query.eq('scope', scope);
  if (fieldId) query = query.eq('field_id', fieldId);
  if (blockId) query = query.eq('block_id', blockId);
  if (status) query = query.eq('status', status);
  if (workDay) query = query.eq('work_day', workDay);
  if (dateFrom) query = query.gte('work_day', dateFrom);
  if (dateTo) query = query.lte('work_day', dateTo);

  query = query.order('work_day', { ascending: false }).order('created_at', { ascending: false });

  const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return mapDbError(dbError, cid);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** GET /dispatch-guides/suggestion — preview aggregate (no persist). */
// deno-lint-ignore no-explicit-any
async function handleSuggestion(supabase: any, url: URL, cid: string) {
  const scope = url.searchParams.get('scope');
  let fieldId = url.searchParams.get('field_id');
  const blockId = url.searchParams.get('block_id');
  const workDay = url.searchParams.get('work_day');

  if (scope !== 'block' && scope !== 'field') {
    return error('VALIDATION_ERROR', "scope debe ser 'block' o 'field'", 422);
  }
  if (!workDay || !/^\d{4}-\d{2}-\d{2}$/.test(workDay)) {
    return error('VALIDATION_ERROR', 'work_day requerido (YYYY-MM-DD)', 422);
  }

  if (scope === 'block') {
    if (!blockId) return error('DISPATCH_SCOPE_BLOCK_REQUIRED', 'scope=block requiere block_id', 400);
    // field_id derives from the block when not provided (NIT-3).
    if (!fieldId) {
      const { data: block, error: bErr } = await supabase
        .from('blocks').select('field_id').eq('id', blockId).maybeSingle();
      if (bErr) return mapDbError(bErr, cid);
      if (!block) return error('NOT_FOUND', 'Paño no encontrado', 404);
      fieldId = block.field_id;
    }
  } else {
    // field scope requires field_id (NIT-3).
    if (!fieldId) return error('VALIDATION_ERROR', 'scope=field requiere field_id', 422);
  }

  const agg = scope === 'block'
    ? await aggregateGroupByBlock(supabase, blockId!, workDay)
    : await aggregateFieldGroup(supabase, fieldId!, workDay);
  if (agg.dbError) return mapDbError(agg.dbError, cid);
  if (!agg.records || agg.records.length === 0) {
    return error('DISPATCH_NO_PICKING_FOR_GROUP', 'No hay cosecha registrada para ese paño/campo en la jornada', 404);
  }

  const totals = aggregateDispatchWeight(agg.records);
  return success({
    scope,
    field_id: fieldId,
    block_id: scope === 'block' ? blockId : null,
    work_day: workDay,
    total_trays: totals.total_trays,
    total_weight_kg: totals.total_weight_kg,
    weight_precise: totals.weight_precise,
    weight_source: totals.weight_source,
    record_count: agg.records.length,
  });
}

/** POST /dispatch-guides — create (auto-suggested). admin/supervisor. */
// deno-lint-ignore no-explicit-any
async function handleCreate(req: Request, supabase: any, cid: string) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;

  const flagError = await assertFlagEnabled(req, supabase);
  if (flagError) return flagError;

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const body = await req.json().catch(() => null);
  if (!body) return error('VALIDATION_ERROR', 'Cuerpo JSON inválido', 422);

  const scope = body.scope;
  let fieldId = body.field_id;
  const blockId = body.block_id ?? null;
  const workDay = body.work_day;
  const guideNumber = body.guide_number;

  // Mirror createDispatchGuideSchema (shared). Keep in sync.
  if (scope !== 'block' && scope !== 'field') {
    return error('VALIDATION_ERROR', "scope debe ser 'block' o 'field'", 422);
  }
  if (!workDay || !/^\d{4}-\d{2}-\d{2}$/.test(workDay)) {
    return error('VALIDATION_ERROR', 'work_day requerido (YYYY-MM-DD)', 422);
  }
  if (!guideNumber || typeof guideNumber !== 'string' || guideNumber.length < 1 || guideNumber.length > 60) {
    return error('VALIDATION_ERROR', 'guide_number requerido (1..60)', 422);
  }
  if (scope === 'field' && blockId) {
    return error('DISPATCH_SCOPE_FIELD_CONFLICT', 'scope=field no lleva block_id', 400);
  }
  if (scope === 'block' && !blockId) {
    return error('DISPATCH_SCOPE_BLOCK_REQUIRED', 'scope=block requiere block_id', 400);
  }

  // Resolve field_id for block scope (derive from the block; tenant validated via RLS/FK).
  if (scope === 'block') {
    const { data: block, error: bErr } = await supabase
      .from('blocks').select('id, field_id').eq('id', blockId).maybeSingle();
    if (bErr) return mapDbError(bErr, cid);
    if (!block) return error('NOT_FOUND', 'Paño no encontrado', 404);
    if (!fieldId) fieldId = block.field_id;
    if (fieldId !== block.field_id) {
      return error('DISPATCH_SCOPE_FIELD_CONFLICT', 'El paño no pertenece al campo indicado', 400);
    }
  }
  if (!fieldId) return error('VALIDATION_ERROR', 'field_id requerido', 422);

  // Write identity: worker_id claim (design §5.1). Platform-admin without a
  // worker row cannot create guides -> 403 before insert.
  const workerId = getWorkerId(req);
  if (!workerId) {
    return error('FORBIDDEN', 'Esta operación requiere una identidad de trabajador de la organización', 403);
  }

  // Aggregate picking of the group for suggested totals.
  const agg = scope === 'block'
    ? await aggregateGroupByBlock(supabase, blockId, workDay)
    : await aggregateFieldGroup(supabase, fieldId, workDay);
  if (agg.dbError) return mapDbError(agg.dbError, cid);
  if (!agg.records || agg.records.length === 0) {
    return error('DISPATCH_NO_PICKING_FOR_GROUP', 'No hay cosecha registrada para ese paño/campo en la jornada', 404);
  }
  const totals = aggregateDispatchWeight(agg.records);

  // organization_id is auto-set by trigger set_organization_id; set it anyway to
  // keep the composite tenant FK consistent with the token org.
  const { data, error: dbError } = await supabase
    .from('dispatch_guides')
    .insert({
      organization_id: orgId,
      scope,
      field_id: fieldId,
      block_id: scope === 'block' ? blockId : null,
      work_day: workDay,
      status: 'open',
      guide_number: guideNumber,
      total_trays: totals.total_trays,
      total_weight_kg: totals.total_weight_kg,
      weight_precise: totals.weight_precise,
      weight_source: totals.weight_source,
      carrier: body.carrier ?? null,
      notes: body.notes ?? null,
      created_by: workerId,
    })
    .select()
    .single();

  if (dbError) return mapDbError(dbError, cid);
  return success(data, 201);
}

/** GET /dispatch-guides/:id — detail (guide + receipt + comparison). */
// deno-lint-ignore no-explicit-any
async function handleGetOne(supabase: any, guideId: string, cid: string) {
  const { data: guide, error: gErr } = await supabase
    .from('dispatch_guides').select('*').eq('id', guideId).maybeSingle();
  if (gErr) return mapDbError(gErr, cid);
  if (!guide) return error('DISPATCH_GUIDE_NOT_FOUND', 'Guía no encontrada', 404);

  const { data: receipt, error: rErr } = await supabase
    .from('dispatch_receipts').select('*').eq('guide_id', guideId).maybeSingle();
  if (rErr) return mapDbError(rErr, cid);

  const comparison = compareDispatch(
    Number(guide.total_trays),
    Number(guide.total_weight_kg),
    receipt ? Number(receipt.received_trays) : null,
    receipt ? Number(receipt.received_weight_kg) : null,
  );

  return success({ guide, receipt: receipt ?? null, comparison });
}

/** PUT /dispatch-guides/:id — edit content (open only). admin/supervisor. */
// deno-lint-ignore no-explicit-any
async function handleUpdate(req: Request, supabase: any, guideId: string, cid: string) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;
  const flagError = await assertFlagEnabled(req, supabase);
  if (flagError) return flagError;

  const { data: guide, error: gErr } = await supabase
    .from('dispatch_guides').select('status').eq('id', guideId).maybeSingle();
  if (gErr) return mapDbError(gErr, cid);
  if (!guide) return error('DISPATCH_GUIDE_NOT_FOUND', 'Guía no encontrada', 404);
  if (guide.status === 'closed') {
    return error('DISPATCH_GUIDE_CLOSED', 'La guía está cerrada; reábrala antes de editar', 409);
  }

  const body = await req.json().catch(() => null);
  if (!body) return error('VALIDATION_ERROR', 'Cuerpo JSON inválido', 422);

  // Mirror updateDispatchGuideSchema (shared). Keep in sync.
  const updates: Record<string, unknown> = {};
  let weightEdited = false;
  if (body.total_trays !== undefined) {
    if (typeof body.total_trays !== 'number' || body.total_trays < 0) {
      return error('VALIDATION_ERROR', 'total_trays debe ser numérico >= 0', 422);
    }
    updates.total_trays = body.total_trays;
  }
  if (body.total_weight_kg !== undefined) {
    if (typeof body.total_weight_kg !== 'number' || body.total_weight_kg < 0) {
      return error('VALIDATION_ERROR', 'total_weight_kg debe ser numérico >= 0', 422);
    }
    updates.total_weight_kg = body.total_weight_kg;
    weightEdited = true;
  }
  if (body.guide_number !== undefined) {
    if (typeof body.guide_number !== 'string' || body.guide_number.length < 1 || body.guide_number.length > 60) {
      return error('VALIDATION_ERROR', 'guide_number debe tener 1..60 caracteres', 422);
    }
    updates.guide_number = body.guide_number;
  }
  if (body.carrier !== undefined) updates.carrier = body.carrier;
  if (body.notes !== undefined) updates.notes = body.notes;

  // Editing the weight by hand marks it as non-precise (manual, not scale).
  if (weightEdited) {
    updates.weight_precise = false;
    updates.weight_source = WEIGHT_SOURCE.ESTIMATED;
  }

  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'Nada que actualizar', 422);
  }

  const { data, error: dbError } = await supabase
    .from('dispatch_guides').update(updates).eq('id', guideId).select().single();
  if (dbError) return mapDbError(dbError, cid);
  return success(data);
}

/** POST /dispatch-guides/:id/close — open->closed, set closed_at. Idempotent. */
// deno-lint-ignore no-explicit-any
async function handleClose(req: Request, supabase: any, guideId: string, cid: string) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;
  const flagError = await assertFlagEnabled(req, supabase);
  if (flagError) return flagError;

  const { data: guide, error: gErr } = await supabase
    .from('dispatch_guides').select('*').eq('id', guideId).maybeSingle();
  if (gErr) return mapDbError(gErr, cid);
  if (!guide) return error('DISPATCH_GUIDE_NOT_FOUND', 'Guía no encontrada', 404);

  // Idempotent: closing an already-closed guide returns it unchanged.
  if (guide.status === 'closed') return success(guide);

  // NIT-1: closing requires total_weight_kg > 0.
  if (Number(guide.total_weight_kg) <= 0) {
    return error('DISPATCH_WEIGHT_REQUIRED', 'El peso despachado debe ser mayor a 0 para cerrar la guía', 422);
  }

  const { data, error: dbError } = await supabase
    .from('dispatch_guides')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', guideId)
    .select()
    .single();
  if (dbError) return mapDbError(dbError, cid);
  return success(data);
}

/** POST /dispatch-guides/:id/reopen — closed->open (status only). admin only. */
// deno-lint-ignore no-explicit-any
async function handleReopen(req: Request, supabase: any, guideId: string, cid: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const flagError = await assertFlagEnabled(req, supabase);
  if (flagError) return flagError;

  const { data: guide, error: gErr } = await supabase
    .from('dispatch_guides').select('status').eq('id', guideId).maybeSingle();
  if (gErr) return mapDbError(gErr, cid);
  if (!guide) return error('DISPATCH_GUIDE_NOT_FOUND', 'Guía no encontrada', 404);
  if (guide.status === 'open') {
    return error('DISPATCH_GUIDE_ALREADY_OPEN', 'La guía ya está abierta', 409);
  }

  // Pure reopen: status + closed_at only (trigger prevent_closed_guide_update
  // rejects any content mutation in the same UPDATE).
  const { data, error: dbError } = await supabase
    .from('dispatch_guides')
    .update({ status: 'open', closed_at: null })
    .eq('id', guideId)
    .select()
    .single();
  if (dbError) return mapDbError(dbError, cid);
  return success(data);
}

/** POST /dispatch-guides/:id/receipt — register receipt (1:1). admin/supervisor. */
// deno-lint-ignore no-explicit-any
async function handleCreateReceipt(req: Request, supabase: any, guideId: string, cid: string) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;
  const flagError = await assertFlagEnabled(req, supabase);
  if (flagError) return flagError;

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data: guide, error: gErr } = await supabase
    .from('dispatch_guides').select('*').eq('id', guideId).maybeSingle();
  if (gErr) return mapDbError(gErr, cid);
  if (!guide) return error('DISPATCH_GUIDE_NOT_FOUND', 'Guía no encontrada', 404);

  const body = await req.json().catch(() => null);
  if (!body) return error('VALIDATION_ERROR', 'Cuerpo JSON inválido', 422);

  const validation = validateReceiptBody(body);
  if (validation) return validation;

  const workerId = getWorkerId(req);
  if (!workerId) {
    return error('FORBIDDEN', 'Esta operación requiere una identidad de trabajador de la organización', 403);
  }

  const { data: receipt, error: dbError } = await supabase
    .from('dispatch_receipts')
    .insert({
      organization_id: orgId,
      guide_id: guideId,
      received_trays: body.received_trays,
      received_weight_kg: body.received_weight_kg,
      received_at: body.received_at ?? undefined,
      notes: body.notes ?? null,
      recorded_by: workerId,
    })
    .select()
    .single();
  if (dbError) return mapDbError(dbError, cid);

  const comparison = compareDispatch(
    Number(guide.total_trays),
    Number(guide.total_weight_kg),
    Number(receipt.received_trays),
    Number(receipt.received_weight_kg),
  );
  return success({ guide, receipt, comparison }, 201);
}

/** PUT /dispatch-guides/:id/receipt — correct receipt (allowed when closed). */
// deno-lint-ignore no-explicit-any
async function handleUpdateReceipt(req: Request, supabase: any, guideId: string, cid: string) {
  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;
  const flagError = await assertFlagEnabled(req, supabase);
  if (flagError) return flagError;

  const { data: guide, error: gErr } = await supabase
    .from('dispatch_guides').select('*').eq('id', guideId).maybeSingle();
  if (gErr) return mapDbError(gErr, cid);
  if (!guide) return error('DISPATCH_GUIDE_NOT_FOUND', 'Guía no encontrada', 404);

  const { data: existing, error: exErr } = await supabase
    .from('dispatch_receipts').select('id').eq('guide_id', guideId).maybeSingle();
  if (exErr) return mapDbError(exErr, cid);
  if (!existing) return error('DISPATCH_RECEIPT_NOT_FOUND', 'La guía no tiene recepción registrada', 404);

  const body = await req.json().catch(() => null);
  if (!body) return error('VALIDATION_ERROR', 'Cuerpo JSON inválido', 422);
  const validation = validateReceiptBody(body);
  if (validation) return validation;

  const updates: Record<string, unknown> = {
    received_trays: body.received_trays,
    received_weight_kg: body.received_weight_kg,
    notes: body.notes ?? null,
  };
  if (body.received_at !== undefined) updates.received_at = body.received_at;

  const { data: receipt, error: dbError } = await supabase
    .from('dispatch_receipts').update(updates).eq('id', existing.id).select().single();
  if (dbError) return mapDbError(dbError, cid);

  const comparison = compareDispatch(
    Number(guide.total_trays),
    Number(guide.total_weight_kg),
    Number(receipt.received_trays),
    Number(receipt.received_weight_kg),
  );
  return success({ guide, receipt, comparison });
}

/** Mirror createDispatchReceiptSchema (shared). Keep in sync. */
// deno-lint-ignore no-explicit-any
function validateReceiptBody(body: any): Response | null {
  if (typeof body.received_trays !== 'number' || body.received_trays < 0) {
    return error('VALIDATION_ERROR', 'received_trays requerido >= 0', 422);
  }
  if (typeof body.received_weight_kg !== 'number' || body.received_weight_kg < 0) {
    return error('VALIDATION_ERROR', 'received_weight_kg requerido >= 0', 422);
  }
  if (body.received_at !== undefined && body.received_at !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.received_at)) {
    return error('VALIDATION_ERROR', 'received_at inválido (YYYY-MM-DD)', 422);
  }
  if (body.notes !== undefined && body.notes !== null && String(body.notes).length > 500) {
    return error('VALIDATION_ERROR', 'notes excede 500 caracteres', 422);
  }
  return null;
}
