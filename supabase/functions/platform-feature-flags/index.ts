import { handleCors } from '../_shared/cors.ts';
import { isPlatformAdmin, createServiceClient } from '../_shared/auth.ts';
import { logPlatformAction } from '../_shared/platform.ts';
import { success, error } from '../_shared/response.ts';

/**
 * Gestión de Feature Flags de plataforma (solo super-admin).
 *
 * Rutas:
 *   GET    /platform-feature-flags                       -> catálogo global (con conteo de overrides)
 *   POST   /platform-feature-flags                       -> crear flag
 *   PATCH  /platform-feature-flags/:key                  -> editar flag (name/description/category/strategy/enabled)
 *   DELETE /platform-feature-flags/:key                  -> borrar flag (y sus overrides por CASCADE)
 *   GET    /platform-feature-flags/:key/overrides        -> overrides por organización de un flag
 *   PUT    /platform-feature-flags/:key/overrides/:orgId -> set override { enabled }
 *   DELETE /platform-feature-flags/:key/overrides/:orgId -> quitar override (org vuelve a heredar el default global)
 *
 * Todo usa service client (bypass RLS) y registra auditoría en platform_audit_log.
 */

const KEY_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const STRATEGIES = ['global', 'org_override', 'kill_switch'];

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
    if (!key) {
      if (req.method === 'GET') return await listFlags(admin);
      if (req.method === 'POST') return await createFlag(req, admin);
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

/** POST /platform-feature-flags — crear flag */
async function createFlag(req: Request, admin: any) {
  const body = await req.json();

  if (!body.key || typeof body.key !== 'string' || !KEY_RE.test(body.key)) {
    return error('VALIDATION_ERROR', 'Key inválido (minúsculas, números y guion bajo)', 422);
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre del flag es requerido', 422);
  }
  if (body.strategy && !STRATEGIES.includes(body.strategy)) {
    return error('VALIDATION_ERROR', 'Estrategia inválida', 422);
  }

  const { data, error: dbError } = await admin
    .from('platform_feature_flags')
    .insert({
      key: body.key,
      name: body.name.trim(),
      description: body.description || null,
      category: (body.category && String(body.category).trim()) || 'general',
      strategy: body.strategy || 'org_override',
      enabled: body.enabled === true,
    })
    .select()
    .single();

  if (dbError) {
    if (dbError.code === '23505') return error('VALIDATION_ERROR', 'El key ya está en uso', 409);
    return error('VALIDATION_ERROR', dbError.message, 400);
  }

  await logPlatformAction(req, admin, null, 'create_feature_flag', `platform_feature_flags:${data.key}`, {
    key: data.key,
    enabled: data.enabled,
  });
  return success(data, 201);
}

/** PATCH /platform-feature-flags/:key — editar flag */
async function updateFlag(req: Request, admin: any, key: string) {
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return error('VALIDATION_ERROR', 'Nombre no puede estar vacío', 422);
    }
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.category !== undefined) updates.category = (String(body.category).trim()) || 'general';
  if (body.strategy !== undefined) {
    if (!STRATEGIES.includes(body.strategy)) return error('VALIDATION_ERROR', 'Estrategia inválida', 422);
    updates.strategy = body.strategy;
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled === true;

  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'No se proporcionaron campos para actualizar', 422);
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
