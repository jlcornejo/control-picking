import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, requirePermission, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

/**
 * Base pagable de un registro de picking. Réplica de `pickingPayableBase` de
 * @fundo360/shared (Deno no importa el paquete). Mantener en sincronía con shared.
 * kg => paid_quantity_kg; box => quantity.
 */
function pickingPayableBase(record: { payment_unit: string; quantity: number; paid_quantity_kg: number | null }): number {
  return record.payment_unit === 'kg' ? Number(record.paid_quantity_kg ?? 0) : Number(record.quantity);
}

/**
 * Subtotal pagable = base * tarifa, redondeado a 2 decimales. Réplica de
 * `pickingSubtotal` de @fundo360/shared. Mantener en sincronía con shared.
 * Para box reproduce EXACTO quantity * rate_amount_snapshot (regresión cero).
 */
function pickingSubtotal(record: { payment_unit: string; quantity: number; paid_quantity_kg: number | null; rate_amount_snapshot: number }): number {
  return Math.round(pickingPayableBase(record) * Number(record.rate_amount_snapshot) * 100) / 100;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const subResource = pathParts[1] || null; // "generate", "my", or settlement ID

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // GET /settlements/my (worker)
  if (req.method === 'GET' && subResource === 'my') {
    return await handleGetMy(supabase, url);
  }

  // POST /settlements/generate (admin) — nivel 1
  if (req.method === 'POST' && subResource === 'generate') {
    return await handleGenerate(req, supabase);
  }

  // POST /settlements/crew-generate (crew_lead) — nivel 2: liquidaciones a los
  // trabajadores de su cuadrilla.
  if (req.method === 'POST' && subResource === 'crew-generate') {
    return await handleCrewGenerate(req, supabase);
  }

  switch (req.method) {
    case 'GET':
      return subResource ? await handleGetOne(supabase, subResource) : await handleGetList(supabase, url);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /settlements — list (admin) */
async function handleGetList(supabase: any, url: URL) {
  let query = supabase.from('settlements')
    .select('*, workers(full_name)', { count: 'exact' });

  const workerId = url.searchParams.get('worker_id');
  const status = url.searchParams.get('status');
  if (workerId) query = query.eq('worker_id', workerId);
  if (status) query = query.eq('status', status);

  query = query.order('generated_at', { ascending: false });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** GET /settlements/:id — detail with breakdown */
async function handleGetOne(supabase: any, settlementId: string) {
  const { data: settlement, error: sErr } = await supabase
    .from('settlements')
    .select('*, workers(full_name)')
    .eq('id', settlementId)
    .single();

  if (sErr) return error('NOT_FOUND', 'Liquidación no encontrada', 404);

  // Get breakdown: picking records in the period. Se embebe la variedad del block
  // vía el HINT de la FK compuesta (product_varieties!fk_blocks_variety_org) para
  // evitar PGRST200.
  const { data: records } = await supabase
    .from('picking_records')
    .select('work_day, quantity, payment_unit, paid_quantity_kg, rate_amount_snapshot, blocks(name, variety_id, products!fk_blocks_product_org(name), product_varieties!fk_blocks_variety_org(name)), field_rows(name)')
    .eq('worker_id', settlement.worker_id)
    .gte('work_day', settlement.period_start)
    .lte('work_day', settlement.period_end)
    .is('original_record_id', null)
    .order('work_day', { ascending: true });

  const unitsByUnit = { box: 0, kg: 0 };
  const breakdown = (records || []).map((r: any) => {
    const base = pickingPayableBase(r);
    if (r.payment_unit === 'kg') unitsByUnit.kg += Number(r.paid_quantity_kg ?? 0);
    else unitsByUnit.box += Number(r.quantity);
    return {
      work_day: r.work_day,
      block_name: r.blocks?.name || '',
      row_name: r.field_rows?.name || null,
      product_name: r.blocks?.products?.name || '',
      variety_name: r.blocks?.product_varieties?.name || null,
      payment_unit: r.payment_unit,
      base,
      rate: Number(r.rate_amount_snapshot),
      subtotal: pickingSubtotal(r),
    };
  });

  // Get payments made
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('settlement_id', settlementId)
    .order('paid_at', { ascending: false });

  const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  return success({
    ...settlement,
    breakdown,
    units_by_unit: { box: unitsByUnit.box, kg: Math.round(unitsByUnit.kg * 1000) / 1000 },
    payments: payments || [],
    total_paid: totalPaid,
    balance: Math.round((Number(settlement.total_amount) - totalPaid) * 100) / 100,
  });
}

/** GET /settlements/my — worker's own settlements */
async function handleGetMy(supabase: any, url: URL) {
  const { data, error: dbError } = await supabase
    .from('settlements')
    .select('id, period_start, period_end, total_amount, status, generated_at')
    .order('generated_at', { ascending: false });

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}

/**
 * POST /settlements/generate — genera las liquidaciones de NIVEL 1 (admin).
 *
 * Opción A (modo por campo): cada picking_record se clasifica según el
 * crew_mode efectivo de SU campo (field.crew_mode_enabled ?? org.crew_mode_enabled):
 *   - Campo SIN modo capataz -> liquidación individual del trabajador (payee_type='worker').
 *   - Campo CON modo capataz  -> se agrega a la liquidación de la CUADRILLA del
 *     trabajador (payee_type='crew', a nombre del encargado). [nivel 1: cliente->encargado]
 *
 * El pago del encargado a sus trabajadores (nivel 2) NO se genera aquí; lo
 * gestiona el propio encargado desde su cuenta.
 */
async function handleGenerate(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const permError = requirePermission(req, 'settlements.manage');
  if (permError) return permError;

  const body = await req.json();
  if (!body.period_start || !body.period_end) {
    return error('VALIDATION_ERROR', 'period_start y period_end son requeridos', 422);
  }

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // Traer los registros del período con el contexto necesario para clasificar.
  // El worker se embebe con el HINT de la FK compuesta correcta
  // (workers!fk_picking_worker_org); picking_records tiene 2 FKs a workers
  // (worker_id y recorded_by), por eso el hint es obligatorio para desambiguar.
  // El crew_mode efectivo se resuelve con queries separadas y confiables (abajo)
  // para no depender de un embed anidado frágil de 3 niveles.
  const { data: records, error: recErr } = await supabase
    .from('picking_records')
    .select(`
      quantity,
      payment_unit,
      paid_quantity_kg,
      rate_amount_snapshot,
      worker:workers!fk_picking_worker_org(id, crew_id),
      block:blocks!fk_picking_block_org(field_id)
    `)
    .gte('work_day', body.period_start)
    .lte('work_day', body.period_end)
    .is('original_record_id', null);
  if (recErr) return error('VALIDATION_ERROR', recErr.message, 400);

  // crew_mode efectivo = field.crew_mode_enabled ?? org.crew_mode_enabled.
  // Default de la organización (del JWT) en una sola query simple.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('crew_mode_enabled')
    .eq('id', orgId)
    .single();
  if (orgErr) return error('VALIDATION_ERROR', orgErr.message, 400);
  const orgDefaultCrewMode = org?.crew_mode_enabled ?? false;

  // Override por campo, resuelto con una query simple sobre fields.
  const fieldIds = [...new Set((records ?? []).map((r: any) => r.block?.field_id).filter(Boolean))];
  const fieldModeById = new Map<string, boolean | null>();
  if (fieldIds.length) {
    const { data: fields, error: fErr } = await supabase
      .from('fields')
      .select('id, crew_mode_enabled')
      .in('id', fieldIds);
    if (fErr) return error('VALIDATION_ERROR', fErr.message, 400);
    for (const f of fields ?? []) fieldModeById.set(f.id, f.crew_mode_enabled);
  }

  // Agregar montos por sujeto de pago + totales segmentados por unidad.
  const workerTotals = new Map<string, number>();
  const crewTotals = new Map<string, number>();
  const unitsByUnit = { box: 0, kg: 0 };
  let totalAmountGlobal = 0;

  for (const r of records || []) {
    const amount = pickingSubtotal(r);
    if (r.payment_unit === 'kg') unitsByUnit.kg += Number(r.paid_quantity_kg ?? 0);
    else unitsByUnit.box += Number(r.quantity);
    if (amount <= 0) continue;
    totalAmountGlobal += amount;

    const fieldMode = fieldModeById.get(r.block?.field_id) ?? null;
    const crewModeEffective = fieldMode === null || fieldMode === undefined ? orgDefaultCrewMode : fieldMode;

    const crewId = r.worker?.crew_id ?? null;

    if (crewModeEffective && crewId) {
      // Producción en campo con modo capataz y trabajador con cuadrilla -> nivel 1 (cuadrilla)
      crewTotals.set(crewId, (crewTotals.get(crewId) ?? 0) + amount);
    } else {
      // Producción directa -> liquidación individual del trabajador
      const wId = r.worker?.id;
      if (wId) workerTotals.set(wId, (workerTotals.get(wId) ?? 0) + amount);
    }
  }

  const results: any[] = [];

  // Liquidaciones individuales (payee_type='worker')
  for (const [workerId, total] of workerTotals) {
    if (total <= 0) continue;
    const { data: existing } = await supabase
      .from('settlements')
      .select('id')
      .eq('worker_id', workerId)
      .eq('payee_type', 'worker')
      .eq('period_start', body.period_start)
      .eq('period_end', body.period_end)
      .maybeSingle();
    if (existing) continue;

    const { data: settlement, error: sErr } = await supabase
      .from('settlements')
      .insert({
        organization_id: orgId,
        payee_type: 'worker',
        worker_id: workerId,
        period_start: body.period_start,
        period_end: body.period_end,
        total_amount: Math.round(total * 100) / 100,
        status: 'pending',
      })
      .select('*, workers(full_name)')
      .single();
    if (!sErr && settlement) results.push(settlement);
  }

  // Liquidaciones de cuadrilla nivel 1 (payee_type='crew')
  for (const [crewId, total] of crewTotals) {
    if (total <= 0) continue;
    const { data: existing } = await supabase
      .from('settlements')
      .select('id')
      .eq('crew_id', crewId)
      .eq('payee_type', 'crew')
      .eq('period_start', body.period_start)
      .eq('period_end', body.period_end)
      .maybeSingle();
    if (existing) continue;

    const { data: settlement, error: sErr } = await supabase
      .from('settlements')
      .insert({
        organization_id: orgId,
        payee_type: 'crew',
        crew_id: crewId,
        period_start: body.period_start,
        period_end: body.period_end,
        total_amount: Math.round(total * 100) / 100,
        status: 'pending',
      })
      // settlements tiene 2 FKs a crews (fk_settlements_crew_org y
      // settlements_crew_id_fkey); el HINT desambigua el embed (evita PGRST201).
      .select('*, crews!fk_settlements_crew_org(name, crew_lead_id)')
      .single();
    if (!sErr && settlement) results.push(settlement);
  }

  return success({
    settlements: results,
    total_amount: Math.round(totalAmountGlobal * 100) / 100,
    units_by_unit: { box: unitsByUnit.box, kg: Math.round(unitsByUnit.kg * 1000) / 1000 },
  }, 201);
}

/**
 * POST /settlements/crew-generate — NIVEL 2 (crew_lead).
 *
 * El Encargado genera las liquidaciones individuales de los trabajadores de SU
 * cuadrilla, agregando la producción de cada uno en campos con modo capataz
 * activo (la producción que él debe repartir). Estas liquidaciones son
 * payee_type='worker'; RLS las restringe a los miembros de su cuadrilla.
 */
async function handleCrewGenerate(req: Request, supabase: any) {
  const roleError = requireRole(req, ['crew_lead']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.period_start || !body.period_end) {
    return error('VALIDATION_ERROR', 'period_start y period_end son requeridos', 422);
  }

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // Producción del período de los trabajadores de la cuadrilla del encargado.
  // RLS (crew_lead_read_crew_picking) ya limita a la cuadrilla actual; se filtra
  // además por campos con modo capataz efectivo, que es lo que el encargado reparte.
  // Mismo fix que handleGenerate: hint de FK correcto + manejo de error + crew_mode
  // resuelto con queries separadas (evita el embed anidado de 3 niveles roto).
  const { data: records, error: recErr } = await supabase
    .from('picking_records')
    .select(`
      quantity,
      payment_unit,
      paid_quantity_kg,
      rate_amount_snapshot,
      worker:workers!fk_picking_worker_org(id, crew_id),
      block:blocks!fk_picking_block_org(field_id)
    `)
    .gte('work_day', body.period_start)
    .lte('work_day', body.period_end)
    .is('original_record_id', null);
  if (recErr) return error('VALIDATION_ERROR', recErr.message, 400);

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('crew_mode_enabled')
    .eq('id', orgId)
    .single();
  if (orgErr) return error('VALIDATION_ERROR', orgErr.message, 400);
  const orgDefaultCrewMode = org?.crew_mode_enabled ?? false;

  const fieldIds = [...new Set((records ?? []).map((r: any) => r.block?.field_id).filter(Boolean))];
  const fieldModeById = new Map<string, boolean | null>();
  if (fieldIds.length) {
    const { data: fields, error: fErr } = await supabase
      .from('fields')
      .select('id, crew_mode_enabled')
      .in('id', fieldIds);
    if (fErr) return error('VALIDATION_ERROR', fErr.message, 400);
    for (const f of fields ?? []) fieldModeById.set(f.id, f.crew_mode_enabled);
  }

  const workerTotals = new Map<string, number>();
  const unitsByUnit = { box: 0, kg: 0 };
  let totalAmountGlobal = 0;

  for (const r of records || []) {
    const fieldMode = fieldModeById.get(r.block?.field_id) ?? null;
    const crewModeEffective = fieldMode === null || fieldMode === undefined ? orgDefaultCrewMode : fieldMode;
    if (!crewModeEffective) continue; // solo producción en modo capataz

    const amount = pickingSubtotal(r);
    if (r.payment_unit === 'kg') unitsByUnit.kg += Number(r.paid_quantity_kg ?? 0);
    else unitsByUnit.box += Number(r.quantity);
    if (amount <= 0) continue;
    totalAmountGlobal += amount;

    const wId = r.worker?.id;
    if (wId) workerTotals.set(wId, (workerTotals.get(wId) ?? 0) + amount);
  }

  const results: any[] = [];
  for (const [workerId, total] of workerTotals) {
    if (total <= 0) continue;
    const { data: existing } = await supabase
      .from('settlements')
      .select('id')
      .eq('worker_id', workerId)
      .eq('payee_type', 'worker')
      .eq('period_start', body.period_start)
      .eq('period_end', body.period_end)
      .maybeSingle();
    if (existing) continue;

    // RLS crew_lead_insert_member_settlements valida que el worker sea de su cuadrilla.
    const { data: settlement, error: sErr } = await supabase
      .from('settlements')
      .insert({
        organization_id: orgId,
        payee_type: 'worker',
        worker_id: workerId,
        period_start: body.period_start,
        period_end: body.period_end,
        total_amount: Math.round(total * 100) / 100,
        status: 'pending',
      })
      .select('*, workers(full_name)')
      .single();
    if (!sErr && settlement) results.push(settlement);
  }

  return success({
    settlements: results,
    total_amount: Math.round(totalAmountGlobal * 100) / 100,
    units_by_unit: { box: unitsByUnit.box, kg: Math.round(unitsByUnit.kg * 1000) / 1000 },
  }, 201);
}
