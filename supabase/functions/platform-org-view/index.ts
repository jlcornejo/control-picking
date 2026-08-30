import { handleCors } from '../_shared/cors.ts';
import { isPlatformAdmin, createServiceClient } from '../_shared/auth.ts';
import { logPlatformAction } from '../_shared/platform.ts';
import { success, error } from '../_shared/response.ts';

/**
 * GET /platform-org-view/:orgId
 * Vista de soporte (solo-lectura) del ambiente de una organización.
 * Exclusiva de platform admins. Usa el service client (bypass RLS) para leer
 * cross-tenant y registra el acceso en platform_audit_log (impersonación de soporte).
 *
 * Devuelve un resumen agregado, NO permite escritura: reduce la superficie de
 * riesgo de tocar datos del cliente equivocado.
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET') return error('NOT_FOUND', 'Método no soportado', 405);

  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede usar esta vista', 403);
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ["platform-org-view", ":orgId"]
  const orgId = pathParts[1] || null;
  if (!orgId) return error('VALIDATION_ERROR', 'organization_id es requerido', 422);

  const admin = createServiceClient();

  // Organización
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();
  if (orgErr || !org) return error('NOT_FOUND', 'Organización no encontrada', 404);

  // Conteos por entidad (head + count, sin traer filas)
  const countFor = async (table: string) => {
    const { count } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    return count ?? 0;
  };

  const [workers, fields, products, crews, pickingRecords, settlements, payments] = await Promise.all([
    countFor('workers'),
    countFor('fields'),
    countFor('products'),
    countFor('crews'),
    countFor('picking_records'),
    countFor('settlements'),
    countFor('payments'),
  ]);

  // Distribución de roles (para ver la jerarquía del cliente)
  const { data: roleRows } = await admin
    .from('workers')
    .select('role')
    .eq('organization_id', orgId);
  const roleCounts: Record<string, number> = {};
  for (const r of roleRows || []) roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1;

  // Auditoría: registrar que el platform admin vio el ambiente de esta org.
  await logPlatformAction(req, admin, orgId, 'view_org', `organizations:${orgId}`, {
    counts: { workers, fields, products, crews, pickingRecords, settlements, payments },
  });

  return success({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      subscription_status: org.subscription_status,
      subscription_plan: org.subscription_plan,
      crew_mode_enabled: org.crew_mode_enabled,
      status: org.status,
      created_at: org.created_at,
    },
    counts: { workers, fields, products, crews, picking_records: pickingRecords, settlements, payments },
    role_counts: roleCounts,
  });
});
