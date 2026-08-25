import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const metricType = pathParts[1] || 'summary';
  const subType = pathParts[2] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  const roleError = requireRole(req, ['admin', 'supervisor']);
  if (roleError) return roleError;

  switch (`${metricType}/${subType || ''}`) {
    case 'summary/':
      return await handleSummary(supabase, url);
    case 'production/daily':
      return await handleProductionDaily(supabase, url);
    case 'production/by-block':
      return await handleProductionByBlock(supabase, url);
    case 'production/by-field':
      return await handleProductionByField(supabase, url);
    case 'workers/ranking':
      return await handleWorkersRanking(supabase, url);
    case 'costs/per-hectare':
      return await handleCostPerHectare(supabase, url);
    default:
      return error('NOT_FOUND', 'Métrica no encontrada', 404);
  }
});

async function handleSummary(supabase: any, url: URL) {
  const today = new Date().toISOString().split('T')[0];

  // Today's production
  const { data: todayRecords } = await supabase
    .from('picking_records')
    .select('quantity, rate_amount_snapshot, worker_id, block_id')
    .eq('work_day', today)
    .is('original_record_id', null);

  const totalUnits = (todayRecords || []).reduce((s: number, r: any) => s + Number(r.quantity), 0);
  const totalAmount = (todayRecords || []).reduce((s: number, r: any) => s + Number(r.quantity) * Number(r.rate_amount_snapshot), 0);
  const activeWorkers = new Set((todayRecords || []).map((r: any) => r.worker_id)).size;
  const activeBlocks = new Set((todayRecords || []).map((r: any) => r.block_id)).size;

  // Top workers today
  const workerTotals: Record<string, number> = {};
  for (const r of todayRecords || []) {
    workerTotals[r.worker_id] = (workerTotals[r.worker_id] || 0) + Number(r.quantity);
  }

  const topWorkerIds = Object.entries(workerTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let topWorkers: any[] = [];
  if (topWorkerIds.length > 0) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, full_name')
      .in('id', topWorkerIds);

    topWorkers = topWorkerIds.map((id) => ({
      worker_id: id,
      worker_name: workers?.find((w: any) => w.id === id)?.full_name || '',
      total_units: workerTotals[id],
    }));
  }

  return success({
    today: {
      total_units: totalUnits,
      total_amount: Math.round(totalAmount * 100) / 100,
      active_workers: activeWorkers,
      active_blocks: activeBlocks,
    },
    top_workers: topWorkers,
  });
}

async function handleProductionDaily(supabase: any, url: URL) {
  const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('picking_records')
    .select('work_day, quantity, rate_amount_snapshot')
    .gte('work_day', dateFrom)
    .lte('work_day', dateTo)
    .is('original_record_id', null);

  // Group by day
  const byDay: Record<string, { units: number; amount: number }> = {};
  for (const r of data || []) {
    if (!byDay[r.work_day]) byDay[r.work_day] = { units: 0, amount: 0 };
    byDay[r.work_day].units += Number(r.quantity);
    byDay[r.work_day].amount += Number(r.quantity) * Number(r.rate_amount_snapshot);
  }

  const result = Object.entries(byDay)
    .map(([day, vals]) => ({ date: day, total_units: vals.units, total_amount: Math.round(vals.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return success(result);
}

async function handleProductionByBlock(supabase: any, url: URL) {
  const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('picking_records')
    .select('block_id, quantity, blocks(name, fields(name))')
    .gte('work_day', dateFrom)
    .lte('work_day', dateTo)
    .is('original_record_id', null);

  const byBlock: Record<string, { name: string; field: string; units: number }> = {};
  for (const r of data || []) {
    if (!byBlock[r.block_id]) byBlock[r.block_id] = { name: r.blocks?.name || '', field: r.blocks?.fields?.name || '', units: 0 };
    byBlock[r.block_id].units += Number(r.quantity);
  }

  const result = Object.entries(byBlock)
    .map(([id, vals]) => ({ block_id: id, block_name: vals.name, field_name: vals.field, total_units: vals.units }))
    .sort((a, b) => b.total_units - a.total_units);

  return success(result);
}

async function handleProductionByField(supabase: any, url: URL) {
  const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('picking_records')
    .select('quantity, blocks(field_id, fields(name, total_area))')
    .gte('work_day', dateFrom)
    .lte('work_day', dateTo)
    .is('original_record_id', null);

  const byField: Record<string, { name: string; area: number; units: number }> = {};
  for (const r of data || []) {
    const fieldId = r.blocks?.field_id;
    if (!fieldId) continue;
    if (!byField[fieldId]) byField[fieldId] = { name: r.blocks?.fields?.name || '', area: Number(r.blocks?.fields?.total_area || 0), units: 0 };
    byField[fieldId].units += Number(r.quantity);
  }

  const result = Object.entries(byField)
    .map(([id, vals]) => ({ field_id: id, field_name: vals.name, total_area: vals.area, total_units: vals.units }))
    .sort((a, b) => b.total_units - a.total_units);

  return success(result);
}

async function handleWorkersRanking(supabase: any, url: URL) {
  const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('picking_records')
    .select('worker_id, quantity, workers(full_name)')
    .gte('work_day', dateFrom)
    .lte('work_day', dateTo)
    .is('original_record_id', null);

  const byWorker: Record<string, { name: string; units: number }> = {};
  for (const r of data || []) {
    if (!byWorker[r.worker_id]) byWorker[r.worker_id] = { name: r.workers?.full_name || '', units: 0 };
    byWorker[r.worker_id].units += Number(r.quantity);
  }

  const result = Object.entries(byWorker)
    .map(([id, vals]) => ({ worker_id: id, worker_name: vals.name, total_units: vals.units }))
    .sort((a, b) => b.total_units - a.total_units);

  return success(result);
}

async function handleCostPerHectare(supabase: any, url: URL) {
  const dateFrom = url.searchParams.get('date_from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('picking_records')
    .select('quantity, rate_amount_snapshot, blocks(field_id, fields(name, total_area))')
    .gte('work_day', dateFrom)
    .lte('work_day', dateTo)
    .is('original_record_id', null);

  const byField: Record<string, { name: string; area: number; cost: number }> = {};
  for (const r of data || []) {
    const fieldId = r.blocks?.field_id;
    if (!fieldId) continue;
    if (!byField[fieldId]) byField[fieldId] = { name: r.blocks?.fields?.name || '', area: Number(r.blocks?.fields?.total_area || 1), cost: 0 };
    byField[fieldId].cost += Number(r.quantity) * Number(r.rate_amount_snapshot);
  }

  const result = Object.entries(byField)
    .map(([id, vals]) => ({
      field_id: id,
      field_name: vals.name,
      total_area: vals.area,
      total_cost: Math.round(vals.cost),
      cost_per_hectare: Math.round(vals.cost / vals.area),
    }))
    .sort((a, b) => b.cost_per_hectare - a.cost_per_hectare);

  return success(result);
}
