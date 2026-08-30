import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const subResource = pathParts[1] || null; // "my" or "balance"

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // GET /payments/my (worker)
  if (req.method === 'GET' && subResource === 'my') {
    return await handleGetMy(supabase);
  }

  // GET /payments/balance?worker_id=X (admin) or own balance (worker)
  if (req.method === 'GET' && subResource === 'balance') {
    return await handleGetBalance(req, supabase, url);
  }

  switch (req.method) {
    case 'GET':
      return await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /payments — list (admin) */
async function handleGetList(supabase: any, url: URL) {
  let query = supabase.from('payments')
    .select('*, workers(full_name), settlements(period_start, period_end)', { count: 'exact' });

  const workerId = url.searchParams.get('worker_id');
  if (workerId) query = query.eq('worker_id', workerId);

  query = query.order('paid_at', { ascending: false });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** GET /payments/my — worker's own payments */
async function handleGetMy(supabase: any) {
  const { data, error: dbError } = await supabase
    .from('payments')
    .select('id, amount, paid_at, notes, settlements(period_start, period_end)')
    .order('paid_at', { ascending: false });

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data);
}

/** GET /payments/balance?worker_id=X — get pending balance */
async function handleGetBalance(req: Request, supabase: any, url: URL) {
  const workerId = url.searchParams.get('worker_id');

  // Get total from pending/partial settlements
  const { data: settlements } = await supabase
    .from('settlements')
    .select('id, total_amount, status')
    .in('status', ['pending', 'partial'])
    .modify((query: any) => workerId ? query.eq('worker_id', workerId) : query);

  if (!settlements || settlements.length === 0) {
    return success({ total_owed: 0, total_paid: 0, balance: 0 });
  }

  const settlementIds = settlements.map((s: any) => s.id);
  const totalOwed = settlements.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

  // Get payments already made for these settlements
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .in('settlement_id', settlementIds);

  const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  return success({
    total_owed: Math.round(totalOwed * 100) / 100,
    total_paid: Math.round(totalPaid * 100) / 100,
    balance: Math.round((totalOwed - totalPaid) * 100) / 100,
  });
}

/** POST /payments — register payment (admin) */
async function handlePost(req: Request, supabase: any) {
  // admin registra pagos de nivel 1/directos; crew_lead registra pagos de nivel 2
  // a los trabajadores de su cuadrilla (RLS acota a su cuadrilla).
  const roleError = requireRole(req, ['admin', 'crew_lead']);
  if (roleError) return roleError;

  const body = await req.json();
  if (!body.settlement_id) return error('VALIDATION_ERROR', 'settlement_id es requerido', 422);
  if (!body.worker_id) return error('VALIDATION_ERROR', 'worker_id es requerido', 422);
  if (!body.amount || body.amount <= 0) return error('VALIDATION_ERROR', 'Monto debe ser mayor a 0', 422);

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  // Get settlement and verify it's not already paid
  const { data: settlement, error: sErr } = await supabase
    .from('settlements')
    .select('*')
    .eq('id', body.settlement_id)
    .single();

  if (sErr || !settlement) return error('NOT_FOUND', 'Liquidación no encontrada', 404);
  if (settlement.status === 'paid') {
    return error('SETTLEMENT_IS_IMMUTABLE', 'Esta liquidación ya está completamente pagada', 409);
  }

  // Calculate remaining balance
  const { data: existingPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('settlement_id', body.settlement_id);

  const totalPaid = (existingPayments || []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const remaining = Number(settlement.total_amount) - totalPaid;

  if (body.amount > remaining + 0.01) { // Small tolerance for floating point
    return error('PAYMENT_EXCEEDS_BALANCE', `Monto excede el saldo pendiente ($${remaining.toFixed(2)})`, 409);
  }

  // Create payment
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .insert({
      organization_id: orgId,
      settlement_id: body.settlement_id,
      worker_id: body.worker_id,
      amount: body.amount,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (pErr) return error('VALIDATION_ERROR', pErr.message, 400);

  // Update settlement status
  const newTotalPaid = totalPaid + body.amount;
  const newStatus = newTotalPaid >= Number(settlement.total_amount) ? 'paid' : 'partial';

  await supabase
    .from('settlements')
    .update({ status: newStatus })
    .eq('id', body.settlement_id);

  return success({ ...payment, settlement_status: newStatus }, 201);
}
