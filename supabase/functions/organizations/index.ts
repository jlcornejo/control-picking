import { handleCors } from '../_shared/cors.ts';
import {
  getUser,
  requireRole,
  getOrgId,
  isPlatformAdmin,
  createServiceClient,
} from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';

const SUBSCRIPTION_STATUSES = ['trial', 'active', 'suspended', 'cancelled'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ["organizations"], ["organizations", ":id"], ["organizations", ":id", "subscription"|"branding"]
  const orgId = pathParts[1] || null;
  const subResource = pathParts[2] || null;

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // PATCH /organizations/:id/subscription  (solo platform admin)
  if (req.method === 'PATCH' && orgId && subResource === 'subscription') {
    return await handlePatchSubscription(req, orgId);
  }

  // PATCH /organizations/:id/branding  (admin de la propia org o platform admin)
  if (req.method === 'PATCH' && orgId && subResource === 'branding') {
    return await handlePatchBranding(req, supabase, orgId);
  }

  switch (req.method) {
    case 'GET':
      return orgId ? await handleGetOne(req, supabase, orgId) : await handleGetList(req);
    case 'POST':
      return await handleCreate(req);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

/** GET /organizations — listar todas (solo platform admin) */
async function handleGetList(req: Request) {
  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede listar organizaciones', 403);
  }
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const from = (page - 1) * limit;

  const admin = createServiceClient();
  const { data, error: dbError, count } = await admin
    .from('organizations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

/** GET /organizations/:id — la propia org (miembro) o cualquiera (platform admin) */
async function handleGetOne(req: Request, supabase: any, orgId: string) {
  // RLS ya restringe: un miembro solo puede leer su propia org; platform admin, cualquiera.
  // Para platform admin usamos service client (bypassa RLS) para poder leer cross-tenant.
  const client = isPlatformAdmin(req) ? createServiceClient() : supabase;
  const { data, error: dbError } = await client
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (dbError) return error('NOT_FOUND', 'Organización no encontrada', 404);
  return success(data);
}

/** POST /organizations — crear cliente (solo platform admin) */
async function handleCreate(req: Request) {
  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede crear organizaciones', 403);
  }

  const body = await req.json();
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre de la organización es requerido', 422);
  }
  if (!body.slug || typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) {
    return error('VALIDATION_ERROR', 'Slug inválido (usar minúsculas, números y guiones)', 422);
  }
  if (body.subscription_status && !SUBSCRIPTION_STATUSES.includes(body.subscription_status)) {
    return error('VALIDATION_ERROR', 'Estado de suscripción inválido', 422);
  }

  const admin = createServiceClient();
  const { data, error: dbError } = await admin
    .from('organizations')
    .insert({
      name: body.name.trim(),
      slug: body.slug,
      subscription_status: body.subscription_status || 'trial',
      subscription_plan: body.subscription_plan || null,
    })
    .select()
    .single();

  if (dbError) {
    if (dbError.code === '23505') return error('VALIDATION_ERROR', 'El slug ya está en uso', 409);
    return error('VALIDATION_ERROR', dbError.message, 400);
  }
  return success(data, 201);
}

/** PATCH /organizations/:id/subscription — cambiar estado de suscripción (solo platform admin) */
async function handlePatchSubscription(req: Request, orgId: string) {
  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede gestionar suscripciones', 403);
  }

  const body = await req.json();
  if (!body.subscription_status || !SUBSCRIPTION_STATUSES.includes(body.subscription_status)) {
    return error('VALIDATION_ERROR', 'Estado de suscripción inválido', 422);
  }

  const updates: Record<string, unknown> = { subscription_status: body.subscription_status };
  if (body.subscription_plan !== undefined) updates.subscription_plan = body.subscription_plan;

  const admin = createServiceClient();
  const { data, error: dbError } = await admin
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single();

  if (dbError) return error('NOT_FOUND', 'Organización no encontrada', 404);

  // Auditoría de la acción de plataforma
  await logPlatformAction(req, admin, orgId, 'change_subscription', `organizations:${orgId}`, updates);

  return success(data);
}

/** PATCH /organizations/:id/branding — branding de la propia org (admin) o cualquiera (platform admin) */
async function handlePatchBranding(req: Request, supabase: any, orgId: string) {
  const platform = isPlatformAdmin(req);

  if (!platform) {
    // Debe ser admin de ESA organización
    const roleError = requireRole(req, ['admin']);
    if (roleError) return roleError;
    if (getOrgId(req) !== orgId) {
      return error('CROSS_TENANT_FORBIDDEN', 'No puede modificar otra organización', 403);
    }
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return error('VALIDATION_ERROR', 'Nombre no puede estar vacío', 422);
    }
    updates.name = body.name.trim();
  }
  if (body.logo_url !== undefined) updates.logo_url = body.logo_url || null;
  for (const key of ['brand_primary_color', 'brand_secondary_color'] as const) {
    if (body[key] !== undefined) {
      if (body[key] !== null && !HEX_COLOR_RE.test(body[key])) {
        return error('VALIDATION_ERROR', `${key} debe ser un color hex (#RRGGBB)`, 422);
      }
      updates[key] = body[key] || null;
    }
  }
  if (body.role_labels !== undefined) {
    if (typeof body.role_labels !== 'object' || Array.isArray(body.role_labels)) {
      return error('VALIDATION_ERROR', 'role_labels debe ser un objeto', 422);
    }
    updates.role_labels = body.role_labels;
  }

  if (Object.keys(updates).length === 0) {
    return error('VALIDATION_ERROR', 'No se proporcionaron campos para actualizar', 422);
  }

  const client = platform ? createServiceClient() : supabase;
  const { data, error: dbError } = await client
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single();

  if (dbError) return error('NOT_FOUND', 'Organización no encontrada', 404);
  return success(data);
}

/** Registrar una acción de plataforma en platform_audit_log (best-effort) */
async function logPlatformAction(
  req: Request,
  admin: any,
  orgId: string,
  action: string,
  resource: string,
  detail: Record<string, unknown>,
) {
  try {
    const { data: { user } } = await admin.auth.getUser(
      (req.headers.get('Authorization') ?? '').replace('Bearer ', ''),
    );
    if (!user) return;
    const { data: pa } = await admin
      .from('platform_admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();
    if (!pa) return;
    await admin.from('platform_audit_log').insert({
      platform_admin_id: pa.id,
      organization_id: orgId,
      action,
      resource,
      detail,
    });
  } catch {
    // La auditoría no debe bloquear la operación principal
  }
}
