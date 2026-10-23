import { handleCors } from '../_shared/cors.ts';
import { getUser, requireRole, requirePermission, requireOrg, createServiceClient, getOrgId } from '../_shared/auth.ts';
import { success, error } from '../_shared/response.ts';
import { generateTempPassword } from '../_shared/password.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const workerId = pathParts[1] || null;
  const subResource = pathParts[2] || null; // "status" | "badge" | "reset-password"

  const { user, supabase, errorResponse } = await getUser(req);
  if (errorResponse) return errorResponse;

  // PATCH /workers/:id/status
  if (req.method === 'PATCH' && workerId && subResource === 'status') {
    return await handlePatchStatus(req, supabase, workerId);
  }

  // POST /workers/:id/badge
  if (req.method === 'POST' && workerId && subResource === 'badge') {
    return await handleRegenerateBadge(req, supabase, workerId);
  }

  // POST /workers/:id/reset-password
  if (req.method === 'POST' && workerId && subResource === 'reset-password') {
    return await handleResetPassword(req, supabase, workerId);
  }

  switch (req.method) {
    case 'GET':
      return workerId ? await handleGetOne(supabase, workerId) : await handleGetList(supabase, url);
    case 'POST':
      return await handlePost(req, supabase);
    case 'PUT':
      return await handlePut(req, supabase, workerId);
    default:
      return error('NOT_FOUND', 'Método no soportado', 405);
  }
});

async function handleGetList(supabase: any, url: URL) {
  const status = url.searchParams.get('status') || 'active';
  const role = url.searchParams.get('role');

  let query = supabase.from('workers').select('id, full_name, phone, role, status, qr_badge_url, created_at', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (role) query = query.eq('role', role);
  query = query.order('full_name', { ascending: true });

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  query = query.range((page - 1) * limit, (page - 1) * limit + limit - 1);

  const { data, error: dbError, count } = await query;
  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 200, { page, total: count ?? 0, limit });
}

async function handleGetOne(supabase: any, workerId: string) {
  const { data, error: dbError } = await supabase
    .from('workers')
    .select('*')
    .eq('id', workerId)
    .single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

async function handlePost(req: Request, supabase: any) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const permError = requirePermission(req, 'workers.manage');
  if (permError) return permError;

  const body = await req.json();
  if (!body.full_name || body.full_name.trim().length === 0) {
    return error('VALIDATION_ERROR', 'Nombre completo es requerido', 422);
  }
  if (!body.role || !['admin', 'supervisor', 'crew_lead', 'worker'].includes(body.role)) {
    return error('VALIDATION_ERROR', 'Rol debe ser admin, supervisor, crew_lead o worker', 422);
  }

  // Crear usuario de login SOLO cuando la UI de "Usuarios" lo pide explícitamente
  // (create_login === true). La contraseña la genera el servidor; nunca se lee
  // del body. La pantalla de Trabajadores no envía este flag, así su flujo queda
  // intacto. No existe un camino legacy email+password (ningún llamador lo usa).
  let authUserId: string | null = null;
  const createLogin = body.create_login === true;
  if (createLogin) {
    // Un usuario de login no puede tener rol 'worker' (cosechero sin acceso).
    if (body.role === 'worker') {
      return error('VALIDATION_ERROR', 'Un usuario de acceso no puede tener rol trabajador', 422);
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return error('VALIDATION_ERROR', 'Email inválido', 422);
    }

    const tempPassword = generateTempPassword();
    const svc = createServiceClient();
    const { data: authData, error: authError } = await svc.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError || !authData?.user) {
      const msg = authError?.message || 'No se pudo crear la cuenta de acceso';
      const conflict = /already|registered|duplicate|exists/i.test(msg);
      return error('VALIDATION_ERROR', conflict ? 'El email ya está en uso' : msg, conflict ? 409 : 400);
    }
    authUserId = authData.user.id;

    // Generate QR badge UUID (uniforme con el insert de Trabajadores; inocuo).
    const qrUuid = crypto.randomUUID();

    // Tenant: el organization_id se toma del token (nunca del cliente)
    const orgId = getOrgId(req);
    if (!orgId) {
      await svc.auth.admin.deleteUser(authUserId).catch(() => {});
      return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);
    }

    const { data, error: dbError } = await supabase
      .from('workers')
      .insert({
        organization_id: orgId,
        full_name: body.full_name.trim(),
        national_id: body.national_id || null,
        phone: body.phone || null,
        role: body.role,
        qr_badge_url: qrUuid,
        auth_user_id: authUserId,
        // Fuerza el cambio de contraseña en el primer login.
        must_change_password: true,
        // Perfil de permisos opcional (RBAC configurable). null = capacidades completas del rol.
        permission_profile_id: body.permission_profile_id || null,
        // status se omite a propósito: se apoya en el default 'active' de entity_status,
        // requerido por custom_access_token_hook (solo inyecta claims si status='active').
      })
      .select()
      .single();

    if (dbError) {
      // Compensación best-effort: no dejar cuentas de Auth huérfanas.
      await svc.auth.admin.deleteUser(authUserId).catch(() => {});
      const conflict = dbError.code === '23505';
      return error('VALIDATION_ERROR', conflict ? 'El email ya está en uso' : dbError.message, conflict ? 409 : 400);
    }
    // temp_password se devuelve UNA sola vez; nunca se persiste ni se loguea.
    return success({ worker: data, temp_password: tempPassword }, 201);
  }

  // Camino sin login (trabajador cosechero). Se preserva por si en el futuro se
  // enruta por la Edge (hoy la UI de Trabajadores usa insert directo de supabase-js).
  const qrUuid = crypto.randomUUID();

  const orgId = getOrgId(req);
  if (!orgId) return error('ORG_CONTEXT_REQUIRED', 'Contexto de organización requerido', 403);

  const { data, error: dbError } = await supabase
    .from('workers')
    .insert({
      organization_id: orgId,
      full_name: body.full_name.trim(),
      national_id: body.national_id || null,
      phone: body.phone || null,
      role: body.role,
      qr_badge_url: qrUuid,
      auth_user_id: null,
      permission_profile_id: body.permission_profile_id || null,
    })
    .select()
    .single();

  if (dbError) return error('VALIDATION_ERROR', dbError.message, 400);
  return success(data, 201);
}

async function handlePut(req: Request, supabase: any, workerId: string | null) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const permError = requirePermission(req, 'workers.manage');
  if (permError) return permError;
  if (!workerId) return error('VALIDATION_ERROR', 'ID requerido', 400);

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) updates.full_name = body.full_name.trim();
  if (body.national_id !== undefined) updates.national_id = body.national_id;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.role !== undefined) {
    if (!['admin', 'supervisor', 'crew_lead', 'worker'].includes(body.role)) {
      return error('VALIDATION_ERROR', 'Rol inválido', 422);
    }
    // Guard anti-degradación: no se puede convertir en 'worker' a un usuario que
    // tiene cuenta de login (auth_user_id no nulo). Quedaría como login huérfano
    // invisible en ambas pantallas. La barrera vive en el servidor (no en el enum
    // Zod del cliente). Se resuelve la fila con service client (bypassa RLS) y se
    // aísla por org con requireOrg antes de aplicar el update.
    if (body.role === 'worker') {
      const svc = createServiceClient();
      const { data: target } = await svc
        .from('workers')
        .select('auth_user_id, organization_id')
        .eq('id', workerId)
        .single();
      const orgErr = requireOrg(req, target?.organization_id);
      if (orgErr) return orgErr;
      if (target?.auth_user_id) {
        return error('VALIDATION_ERROR', 'No se puede convertir un usuario con acceso en trabajador; desactívelo en su lugar', 422);
      }
    }
    updates.role = body.role;
  }
  // Perfil de permisos: asignar (uuid) o quitar (null) el perfil del worker.
  if (body.permission_profile_id !== undefined) updates.permission_profile_id = body.permission_profile_id || null;
  if (Object.keys(updates).length === 0) return error('VALIDATION_ERROR', 'Sin campos para actualizar', 422);

  const { data, error: dbError } = await supabase.from('workers').update(updates).eq('id', workerId).select().single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

async function handlePatchStatus(req: Request, supabase: any, workerId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const permError = requirePermission(req, 'workers.manage');
  if (permError) return permError;

  const body = await req.json();
  if (!['active', 'inactive'].includes(body.status)) {
    return error('VALIDATION_ERROR', 'Estado debe ser "active" o "inactive"', 422);
  }

  // If deactivating, check for pending settlements
  if (body.status === 'inactive') {
    // 1) Deuda a nivel trabajador (incluye nivel 2 donde un crew_lead cobra como miembro).
    const { count } = await supabase
      .from('settlements')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .in('status', ['pending', 'partial']);

    if (count && count > 0) {
      return error('WORKER_HAS_PENDING_DEBT', `Trabajador tiene ${count} liquidación(es) pendiente(s) de pago. Resuelva antes de desactivar.`, 409);
    }

    // 2) Deuda a nivel cuadrilla (payee_type='crew', keyeada por crew_id). Un
    // crew_lead lidera cuadrillas (crews.crew_lead_id); su desactivación podría
    // dejar liquidaciones de cuadrilla impagas. Inocuo para admin/supervisor
    // (no lideran cuadrillas -> 0 filas).
    const { data: crews, error: crewsErr } = await supabase
      .from('crews')
      .select('id')
      .eq('crew_lead_id', workerId);
    if (crewsErr) return error('VALIDATION_ERROR', crewsErr.message, 400);

    if (crews && crews.length > 0) {
      const crewIds = crews.map((c: { id: string }) => c.id);
      const { count: crewDebt, error: crewDebtErr } = await supabase
        .from('settlements')
        .select('*', { count: 'exact', head: true })
        .eq('payee_type', 'crew')
        .in('crew_id', crewIds)
        .in('status', ['pending', 'partial']);
      if (crewDebtErr) return error('VALIDATION_ERROR', crewDebtErr.message, 400);
      if (crewDebt && crewDebt > 0) {
        return error('WORKER_HAS_PENDING_DEBT', 'La cuadrilla a cargo tiene liquidaciones pendientes de pago. Resuelva antes de desactivar.', 409);
      }
    }
  }

  const { data, error: dbError } = await supabase.from('workers').update({ status: body.status }).eq('id', workerId).select().single();
  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

async function handleRegenerateBadge(req: Request, supabase: any, workerId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;

  const newQrUuid = crypto.randomUUID();
  const { data, error: dbError } = await supabase
    .from('workers')
    .update({ qr_badge_url: newQrUuid })
    .eq('id', workerId)
    .select()
    .single();

  if (dbError) return error('NOT_FOUND', 'Trabajador no encontrado', 404);
  return success(data);
}

/**
 * POST /workers/:id/reset-password — el admin del cliente regenera la contraseña
 * temporal de un usuario de login de su propia org. Service-role (bypassa RLS)
 * acotado en código por requireOrg. Devuelve temp_password UNA sola vez; nunca
 * se loguea ni se escribe en platform_audit_log (actor = admin de tenant).
 */
async function handleResetPassword(req: Request, supabase: any, workerId: string) {
  const roleError = requireRole(req, ['admin']);
  if (roleError) return roleError;
  const permError = requirePermission(req, 'workers.manage');
  if (permError) return permError;
  // getOrgId solo para tener el valor disponible; requireOrg enforcea la presencia.
  getOrgId(req);

  const svc = createServiceClient();
  const { data: target, error: targetErr } = await svc
    .from('workers')
    .select('id, organization_id, auth_user_id, role')
    .eq('id', workerId)
    .single();
  if (targetErr || !target) return error('NOT_FOUND', 'Trabajador no encontrado', 404);

  const orgErr = requireOrg(req, target.organization_id);
  if (orgErr) return orgErr;

  if (!target.auth_user_id) {
    return error('VALIDATION_ERROR', 'El usuario no tiene cuenta de acceso', 422);
  }

  const tempPassword = generateTempPassword();
  const { error: updErr } = await svc.auth.admin.updateUserById(target.auth_user_id, { password: tempPassword });
  if (updErr) return error('VALIDATION_ERROR', updErr.message, 400);

  await svc.from('workers').update({ must_change_password: true }).eq('id', workerId);

  return success({ temp_password: tempPassword }, 200);
}
