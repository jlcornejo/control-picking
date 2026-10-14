import { handleCors } from '../_shared/cors.ts';
import { isPlatformAdmin, createServiceClient } from '../_shared/auth.ts';
import { logPlatformAction } from '../_shared/platform.ts';
import { success, error } from '../_shared/response.ts';

/**
 * Gestión de Feature Flags de plataforma (solo super-admin).
 *
 * El catálogo de flags (key/name/category/strategy) lo define el equipo de desarrollo por
 * migración, atado al código que consume cada flag. Desde la consola NO se crean flags
 * (serían "flags muertos" sin efecto) ni se edita su identidad; solo se ajusta la
 * descripción, se activa/desactiva el default global y se gestionan overrides por tenant.
 *
 * Rutas:
 *   GET    /platform-feature-flags                       -> catálogo global (con conteo de overrides)
 *   PATCH  /platform-feature-flags/:key                  -> editar flag (solo description/enabled)
 *   DELETE /platform-feature-flags/:key                  -> borrar flag (y sus overrides por CASCADE)
 *   GET    /platform-feature-flags/:key/overrides        -> overrides por organización de un flag
 *   PUT    /platform-feature-flags/:key/overrides/:orgId -> set override { enabled }
 *   DELETE /platform-feature-flags/:key/overrides/:orgId -> quitar override (org vuelve a heredar el default global)
 *
 * Todo usa service client (bypass RLS) y registra auditoría en platform_audit_log.
 */

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede gestionar feature flags', 403);
  }

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // ["platform-feature-flags", ":key"?, "overrides"?, ":orgId"?]
  const key = parts[1] || null;
  const sub = parts[2] || null;
  const orgId = parts[3] || null;

  const admin = createServiceClient();

  try {
    // ----- Overrides por organización -----
    if (key && sub === 'overrides') {
      if (req.method === 'GET' && !orgId) return await listOverrides(admin, key);
      if (req.method === 'PUT' && orgId) return await setOverride(req, admin, key, orgId);
      if (req.method === 'DELETE' && orgId) return await deleteOverride(req, admin, key, orgId);
      return error('NOT_FOUND', 'Ruta de overrides no soportada', 405);
    }

    // ----- Catálogo global -----
    // El catálogo de flags lo define el equipo de desarrollo por migración/seed,
    // atado al código que consume cada flag. No se permite crear flags desde la
    // consola: un flag sin código que lo lea sería un "flag muerto" sin efecto.
    if (!key) {
      if (req.method === 'GET') return await listFlags(admin);
      if (req.method === 'POST') {
        return error('FORBIDDEN', 'Los feature flags los define el equipo de desarrollo (por migración), no se crean desde la consola. Desde aquí solo se activan/desactivan y se gestionan overrides por organización.', 403);
      }
      return error('NOT_FOUND', 'Método no soportado', 405);
    }

    if (req.method === 'PATCH') return await updateFlag(req, admin, key);
    if (req.method === 'DELETE') return await deleteFlag(req, admin, key);

    return error('NOT_FOUND', 'Ruta no soportada', 405);
  } catch (e) {
    return error('INTERNAL_ERROR', e instanceof Error ? e.message : 'Error interno', 500);
  }
});

/** GET /platform-feature-flags — catálogo con conteo de overrides por flag */
async function listFlags(admin: any) {
  const { data: flags, error: dbError } = await admin
    .from('platform_feature_flags')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);

  // Conteo de overrides por flag (cuántas organizaciones sobreescriben cada flag).
  const { data: overrides } = await admin
    .from('organization_feature_flags')
    .select('flag_key, enabled');
  const overrideCounts: Record<string, { total: number; enabled: number }> = {};
  for (const o of overrides || []) {
    const c = overrideCounts[o.flag_key] ?? { total: 0, enabled: 0 };
    c.total += 1;
    if (o.enabled) c.enabled += 1;
    overrideCounts[o.flag_key] = c;
  }

  const enriched = (flags || []).map((f: any) => ({
    ...f,
    override_count: overrideCounts[f.key]?.total ?? 0,
    override_enabled_count: overrideCounts[f.key]?.enabled ?? 0,
  }));

  return success(enriched);
}

/**
 * PATCH /platform-feature-flags/:key — editar flag.
 *
 * La identidad del flag (key, name, category, strategy) la define el equipo de
 * desarrollo por migración, atada al código que lo consume; NO es editable desde la
 * consola. El super-admin solo puede ajustar la `description` (texto de ayuda) y el
 * `enabled` (default global on/off). Cualquier otro campo se ignora.
 */
async function updateFlag(req: Request, admin: any, key: string) {
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.description !== undefined) updates.description = body.description || null;
  if (body.enabled !== undefined) updates.enabled = body.enabled === true;

  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'Solo se pueden actualizar la descripción y el estado (enabled) del flag', 422);
  }

  const { data, error: dbError } = await admin
    .from('platform_feature_flags')
    .update(updates)
    .eq('key', key)
    .select()
    .single();

  if (dbError) return error('NOT_FOUND', 'Flag no encontrado', 404);

  await logPlatformAction(req, admin, null, 'update_feature_flag', `platform_feature_flags:${key}`, updates);
  return success(data);
}

/** DELETE /platform-feature-flags/:key — borrar flag (overrides caen por CASCADE) */
async function deleteFlag(req: Request, admin: any, key: string) {
  const { data, error: dbError } = await admin
    .from('platform_feature_flags')
    .delete()
    .eq('key', key)
    .select()
    .maybeSingle();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  if (!data) return error('NOT_FOUND', 'Flag no encontrado', 404);

  await logPlatformAction(req, admin, null, 'delete_feature_flag', `platform_feature_flags:${key}`, { key });
  return success({ deleted: true, key });
}

/** GET /platform-feature-flags/:key/overrides — overrides por organización */
async function listOverrides(admin: any, key: string) {
  const { data, error: dbError } = await admin
    .from('organization_feature_flags')
    .select('id, organization_id, enabled, updated_at, organization:organizations(name, slug)')
    .eq('flag_key', key)
    .order('updated_at', { ascending: false });

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data || []);
}

/** PUT /platform-feature-flags/:key/overrides/:orgId — set override (upsert) */
async function setOverride(req: Request, admin: any, key: string, orgId: string) {
  const body = await req.json();
  if (typeof body.enabled !== 'boolean') {
    return error('VALIDATION_ERROR', 'enabled (boolean) es requerido', 422);
  }

  const { data, error: dbError } = await admin
    .from('organization_feature_flags')
    .upsert(
      { organization_id: orgId, flag_key: key, enabled: body.enabled },
      { onConflict: 'organization_id,flag_key' },
    )
    .select()
    .single();

  if (dbError) {
    if (dbError.code === '23503') return error('VALIDATION_ERROR', 'Organización o flag inexistente', 404);
    return error('VALIDATION_ERROR', dbError.message, 400);
  }

  await logPlatformAction(req, admin, orgId, 'set_feature_flag_override', `organization_feature_flags:${orgId}:${key}`, {
    flag_key: key,
    enabled: body.enabled,
  });
  return success(data);
}

/** DELETE /platform-feature-flags/:key/overrides/:orgId — quitar override */
async function deleteOverride(req: Request, admin: any, key: string, orgId: string) {
  const { error: dbError } = await admin
    .from('organization_feature_flags')
    .delete()
    .eq('flag_key', key)
    .eq('organization_id', orgId);

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);

  await logPlatformAction(req, admin, orgId, 'clear_feature_flag_override', `organization_feature_flags:${orgId}:${key}`, {
    flag_key: key,
  });
  return success({ cleared: true, flag_key: key, organization_id: orgId });
}
