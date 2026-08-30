import { handleCors } from '../_shared/cors.ts';
import { isPlatformAdmin, createServiceClient } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

/**
 * GET /platform-audit-log
 * Lista los eventos del registro de auditoría de plataforma (platform_audit_log).
 * Exclusiva de platform admins. Usa el service client para leer todos los eventos.
 *
 * Query params opcionales:
 *   - organization_id: filtra por organización
 *   - page, limit: paginación (limit máx 100)
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') return error('NOT_FOUND', 'Método no soportado', 405);

  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede ver la auditoría', 403);
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organization_id');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
  const from = (page - 1) * limit;

  const admin = createServiceClient();

  let query = admin
    .from('platform_audit_log')
    .select(
      'id, action, resource, detail, created_at, ' +
      'platform_admin:platform_admins(full_name), ' +
      'organization:organizations(name, slug)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);

  return success(data, 200, { page, total: count ?? 0, limit });
});
