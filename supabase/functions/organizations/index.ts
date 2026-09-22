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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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

/**
 * POST /organizations — dar de alta un cliente (solo platform admin).
 *
 * Onboarding atómico: crea la organización + el usuario admin del cliente en
 * un solo paso, para que el cliente pueda iniciar sesión y controlar su campo
 * de inmediato. El super-admin define email + contraseña iniciales; el admin
 * queda marcado con must_change_password para forzar el cambio en su primer login.
 *
 * Como las Edge Functions no pueden abrir una transacción que abarque Auth + DB,
 * ante un fallo se hace compensación best-effort (borrar lo ya creado) para no
 * dejar organizaciones huérfanas sin admin ni usuarios de Auth sin worker.
 *
 * Body: { name, slug, subscription_status?, subscription_plan?,
 *         admin: { full_name, email, password } }
 * Devuelve: { organization, admin: { worker_id, auth_user_id, email } } (nunca la contraseña).
 */
async function handleCreate(req: Request) {
  if (!isPlatformAdmin(req)) {
    return error('FORBIDDEN', 'Solo el administrador de plataforma puede crear organizaciones', 403);
  }

  const body = await req.json();

  // --- Validación de la organización ---
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre de la organización es requerido', 422);
  }
  if (!body.slug || typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) {
    return error('VALIDATION_ERROR', 'Slug inválido (usar minúsculas, números y guiones)', 422);
  }
  if (body.subscription_status && !SUBSCRIPTION_STATUSES.includes(body.subscription_status)) {
    return error('VALIDATION_ERROR', 'Estado de suscripción inválido', 422);
  }

  // --- Validación del admin del cliente ---
  const adminInput = body.admin;
  if (!adminInput || typeof adminInput !== 'object') {
    return error('VALIDATION_ERROR', 'Los datos del administrador del cliente son requeridos', 422);
  }
  if (!adminInput.full_name || typeof adminInput.full_name !== 'string' || adminInput.full_name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre del administrador es requerido', 422);
  }
  if (!adminInput.email || typeof adminInput.email !== 'string' || !EMAIL_RE.test(adminInput.email.trim())) {
    return error('VALIDATION_ERROR', 'Email del administrador inválido', 422);
  }
  if (!adminInput.password || typeof adminInput.password !== 'string' || adminInput.password.length < MIN_PASSWORD_LENGTH) {
    return error('VALIDATION_ERROR', `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`, 422);
  }

  const adminEmail = adminInput.email.trim().toLowerCase();
  const svc = createServiceClient();

  // --- 1) Crear la organización ---
  const { data: org, error: orgError } = await svc
    .from('organizations')
    .insert({
      name: body.name.trim(),
      slug: body.slug,
      subscription_status: body.subscription_status || 'trial',
      subscription_plan: body.subscription_plan || null,
    })
    .select()
    .single();

  if (orgError) {
    if (orgError.code === '23505') return error('VALIDATION_ERROR', 'El slug ya está en uso', 409);
    return error('VALIDATION_ERROR', orgError.message, 400);
  }

  // --- 2) Crear el usuario de Auth del admin ---
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email: adminEmail,
    password: adminInput.password,
    email_confirm: true,
  });

  if (authError || !authData?.user) {
    // Compensación: borrar la organización recién creada.
    await svc.from('organizations').delete().eq('id', org.id);
    const msg = authError?.message || 'No se pudo crear el usuario administrador';
    const conflict = /already|registered|duplicate|exists/i.test(msg);
    return error('VALIDATION_ERROR', `No se pudo crear el administrador: ${msg}`, conflict ? 409 : 400);
  }

  const authUserId = authData.user.id;

  // --- 3) Crear el worker admin del cliente (org_id explícito, must_change_password) ---
  const { data: worker, error: workerError } = await svc
    .from('workers')
    .insert({
      organization_id: org.id,
      full_name: adminInput.full_name.trim(),
      role: 'admin',
      auth_user_id: authUserId,
      must_change_password: true,
      status: 'active',
    })
    .select('id')
    .single();

  if (workerError) {
    // Compensación: borrar el usuario de Auth y la organización.
    await svc.auth.admin.deleteUser(authUserId).catch(() => {});
    await svc.from('organizations').delete().eq('id', org.id);
    return error('VALIDATION_ERROR', `No se pudo crear el administrador: ${workerError.message}`, 400);
  }

  // --- 4) Auditoría de la acción de plataforma (best-effort) ---
  await logPlatformAction(req, svc, org.id, 'create_tenant', `organizations:${org.id}`, {
    slug: org.slug,
    admin_email: adminEmail,
    admin_worker_id: worker.id,
  });

  return success(
    {
      organization: org,
      admin: { worker_id: worker.id, auth_user_id: authUserId, email: adminEmail },
    },
    201,
  );
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
