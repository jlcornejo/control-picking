import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

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

  // POST /settlements/generate (admin)
  if (req.method === 'POST' && subResource === 'generate') {
    return await handleGenerate(req, supabase);
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

  // Get breakdown: picking records in the period
  const { data: records } = await supabase
    .from('picking_records')
    .select('work_day, quantity, rate_amount_snapshot, blocks(name, products(name))')
    .eq('worker_id', settlement.worker_id)
    .gte('work_day', settlement.period_start)
    .lte('work_day', settlement.period_end)
    .is('original_record_id', null)
    .order('work_day', { ascending: true });

  const breakdown = (records || []).map((r: any) => ({
    work_day: r.work_day,
    block_name: r.blocks?.name || '',
    product_name: r.blocks?.products?.name || '',
    quantity: Number(r.quantity),
    rate: Number(r.rate_amount_snapshot),
    subtotal: Math.round(Number(r.quantity) * Number(r.rate_amount_snapshot) * 100) / 100,
  }));

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

/** POST /settlements/generate — calculate and create settlement (admin) */
async function handleGenerate(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.period_start || !body.period_end) {
    return error('VALIDATION_ERROR', 'period_start y period_end son requeridos', 422);
  }

  // Tenant: el organization_id se toma del token (nunca del cliente)
  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // Get workers to generate for
  let workerIds: string[] = [];
  if (body.worker_id) {
    workerIds = [body.worker_id];
  } else {
    const { data: workers } = await supabase
      .from('workers')
      .select('id')
      .eq('status', 'active')
      .eq('role', 'worker');
    workerIds = (workers || []).map((w: any) => w.id);
  }

  const results: any[] = [];

  for (const workerId of workerIds) {
    // Check for duplicates
    const { data: existing } = await supabase
      .from('settlements')
      .select('id')
      .eq('worker_id', workerId)
      .eq('period_start', body.period_start)
      .eq('period_end', body.period_end)
      .maybeSingle();

    if (existing) continue; // Skip duplicate

    // Calculate total from picking records (exclude corrections - use latest)
    const { data: records } = await supabase
      .from('picking_records')
      .select('quantity, rate_amount_snapshot')
      .eq('worker_id', workerId)
      .gte('work_day', body.period_start)
      .lte('work_day', body.period_end)
      .is('original_record_id', null); // Only originals, not corrections

    const totalAmount = (records || []).reduce(
      (sum: number, r: any) => sum + Number(r.quantity) * Number(r.rate_amount_snapshot), 0,
    );

    if (totalAmount <= 0) continue; // Skip workers with no production

    const { data: settlement, error: sErr } = await supabase
      .from('settlements')
      .insert({
        organization_id: orgId,
        worker_id: workerId,
        period_start: body.period_start,
        period_end: body.period_end,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: 'pending',
      })
      .select('*, workers(full_name)')
      .single();

    if (!sErr && settlement) results.push(settlement);
  }

  return success(results, 201);
}
