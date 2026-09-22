import { handleCors } from '../_shared/cors.ts';
import { isPlatformAdmin, createServiceClient } from '../_shared/auth.ts';
import { logPlatformAction } from '../_shared/platform.ts';
import { success, error } from '../_shared/response.ts';

/**
 * GET /platform-org-detail/:orgId/:resource
 * Vista de soporte de SOLO-LECTURA del detalle de una organización.
 * Exclusiva de platform admins. Lee cross-tenant con el service client (bypass
 * RLS) pero NUNCA escribe: es "modo soporte" para inspeccionar datos del cliente
 * sin poder modificarlos ni asumir su sesión. Cada acceso queda auditado.
 *
 * resource ∈ { workers, fields, settlements, recent-picking }
 * Query: page, limit (máx 100).
 */
const RESOURCES = ['workers', 'fields', 'settlements', 'recent-picking'];

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') return error('NOT_FOUND', 'Método no soportado', 405);
  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede usar la vista de soporte', 403);
  }

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // ["platform-org-detail", ":orgId", ":resource"]
  const orgId = parts[1] || null;
  const resource = parts[2] || null;

  if (!orgId) return error('VALIDATION_ERROR', 'organization_id es requerido', 422);
  if (!resource || !RESOURCES.includes(resource)) {
    return error('VALIDATION_ERROR', `Recurso inválido. Use: ${RESOURCES.join(', ')}`, 422);
  }

  const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createServiceClient();

  // Verificar que la organización existe (y obtener su nombre para la auditoría).
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();
  if (orgErr || !org) return error('NOT_FOUND', 'Organización no encontrada', 404);

  let rows: unknown[] = [];
  let total = 0;

  if (resource === 'workers') {
    const { data, count, error: e } = await admin
      .from('workers')
      .select('id, full_name, role, status, phone, created_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true })
      .range(from, to);
    if (e) return error('VALIDATION_ERROR', e.message, 400);
    rows = data || [];
    total = count ?? 0;
  } else if (resource === 'fields') {
    const { data, count, error: e } = await admin
      .from('fields')
      .select('id, name, location, total_area, status, created_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .range(from, to);
    if (e) return error('VALIDATION_ERROR', e.message, 400);
    rows = data || [];
    total = count ?? 0;
  } else if (resource === 'settlements') {
    const { data, count, error: e } = await admin
      .from('settlements')
      .select('id, period_start, period_end, total_amount, status, generated_at, worker:workers(full_name)', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('generated_at', { ascending: false })
      .range(from, to);
    if (e) return error('VALIDATION_ERROR', e.message, 400);
    rows = data || [];
    total = count ?? 0;
  } else if (resource === 'recent-picking') {
    // picking_records tiene dos FKs a workers (worker_id y recorded_by), lo que
    // hace ambiguo el embed de PostgREST. Resolvemos el nombre del trabajador
    // con una segunda consulta y unimos en memoria.
    const { data, count, error: e } = await admin
      .from('picking_records')
      .select('id, worker_id, quantity, rate_amount_snapshot, work_day, recorded_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('recorded_at', { ascending: false })
      .range(from, to);
    if (e) return error('VALIDATION_ERROR', e.message, 400);

    const workerIds = [...new Set((data || []).map((r) => r.worker_id).filter(Boolean))];
    const namesById: Record<string, string> = {};
    if (workerIds.length > 0) {
      const { data: ws } = await admin.from('workers').select('id, full_name').in('id', workerIds);
      for (const w of ws || []) namesById[w.id] = w.full_name;
    }
    rows = (data || []).map((r) => ({ ...r, worker: { full_name: namesById[r.worker_id] ?? '—' } }));
    total = count ?? 0;
  }

  // Auditoría: el super-admin inspeccionó datos del cliente (modo soporte).
  await logPlatformAction(req, admin, orgId, 'view_org_detail', `organizations:${orgId}:${resource}`, {
    resource,
    page,
    limit,
  });

  return success(rows, 200, { page, total, limit });
});
