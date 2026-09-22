import { handleCors } from '../_shared/cors.ts';
import { isPlatformAdmin, createServiceClient } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

/**
 * GET /platform-metrics
 * Métricas agregadas de toda la plataforma (cross-tenant), solo super-admin.
 * Calcula sobre datos reales: producción de los últimos 30 días, cosecheros
 * activos, liquidaciones pendientes y pagos recientes. Solo-lectura.
 *
 * NOTA: agrega en el servidor con el service client (bypass RLS). No expone
 * datos por-tenant, solo totales de plataforma.
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') return error('NOT_FOUND', 'Método no soportado', 405);
  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede ver las métricas', 403);
  }

  const admin = createServiceClient();

  // Ventana de 30 días (fecha simple; el work_day se guarda en la zona del tenant).
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceDay = since.toISOString().slice(0, 10);
  const sinceTs = since.toISOString();

  // --- Producción últimos 30 días (cantidad y valor) ---
  // Traemos solo las columnas necesarias y agregamos en memoria (los volúmenes
  // locales son chicos; para producción real se movería a una RPC/SQL agregada).
  let harvestQty = 0;
  let harvestValue = 0;
  let pickingCount = 0;
  {
    const { data, error: e } = await admin
      .from('picking_records')
      .select('quantity, rate_amount_snapshot')
      .gte('work_day', sinceDay);
    if (e) return error('VALIDATION_ERROR', e.message, 400);
    for (const r of data || []) {
      const q = Number(r.quantity) || 0;
      const rate = Number(r.rate_amount_snapshot) || 0;
      harvestQty += q;
      harvestValue += q * rate;
    }
    pickingCount = (data || []).length;
  }

  // --- Cosecheros activos (workers role=worker, status=active) ---
  const { count: activeWorkers } = await admin
    .from('workers')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'worker')
    .eq('status', 'active');

  // --- Liquidaciones: pendiente vs pagado (montos) ---
  let settlementsPending = 0;
  let settlementsPaid = 0;
  {
    const { data, error: e } = await admin
      .from('settlements')
      .select('total_amount, status');
    if (e) return error('VALIDATION_ERROR', e.message, 400);
    for (const s of data || []) {
      const amt = Number(s.total_amount) || 0;
      if (s.status === 'paid') settlementsPaid += amt;
      else settlementsPending += amt; // pending + partial
    }
  }

  // --- Pagos últimos 30 días (monto) ---
  let paymentsRecent = 0;
  {
    const { data, error: e } = await admin
      .from('payments')
      .select('amount')
      .gte('paid_at', sinceTs);
    if (e) return error('VALIDATION_ERROR', e.message, 400);
    for (const p of data || []) paymentsRecent += Number(p.amount) || 0;
  }

  return success({
    window_days: 30,
    harvest: {
      quantity: Math.round(harvestQty * 100) / 100,
      value: Math.round(harvestValue),
      records: pickingCount,
    },
    active_workers: activeWorkers ?? 0,
    settlements: {
      pending_amount: Math.round(settlementsPending),
      paid_amount: Math.round(settlementsPaid),
    },
    payments_30d_amount: Math.round(paymentsRecent),
  });
});
