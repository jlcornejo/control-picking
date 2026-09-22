import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { success, error } from '../_shared/response.ts';
import { createServiceClient } from '../_shared/auth.ts';

const MIN_PASSWORD_LENGTH = 8;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const action = pathParts[1] || null; // "login", "refresh", "logout"

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );

  if (req.method !== 'POST') {
    return error('NOT_FOUND', 'Método no soportado', 405);
  }

  switch (action) {
    case 'login':
      return await handleLogin(req, supabase);
    case 'refresh':
      return await handleRefresh(req, supabase);
    case 'logout':
      return await handleLogout(req);
    case 'change-password':
      return await handleChangePassword(req);
    default:
      return error('NOT_FOUND', 'Acción no encontrada', 404);
  }
});

/** POST /auth/login */
async function handleLogin(req: Request, supabase: any) {
  const body = await req.json();
  if (!body.email || !body.password) {
    return error('VALIDATION_ERROR', 'Email y password son requeridos', 422);
  }

  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (authError) return error('UNAUTHORIZED', 'Credenciales inválidas', 401);

  // Get worker info
  const { data: worker } = await supabase
    .from('workers')
    .select('id, full_name, role, status, must_change_password')
    .eq('auth_user_id', data.user.id)
    .single();

  return success({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    must_change_password: worker?.must_change_password ?? false,
    user: {
      id: data.user.id,
      email: data.user.email,
      worker: worker || null,
    },
  });
}

/** POST /auth/refresh */
async function handleRefresh(req: Request, supabase: any) {
  const body = await req.json();
  if (!body.refresh_token) {
    return error('VALIDATION_ERROR', 'refresh_token es requerido', 422);
  }

  const { data, error: authError } = await supabase.auth.refreshSession({
    refresh_token: body.refresh_token,
  });

  if (authError) return error('UNAUTHORIZED', 'Token de refresh inválido', 401);

  return success({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: data.session!.expires_at,
  });
}

/** POST /auth/logout */
async function handleLogout(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return error('UNAUTHORIZED', 'No autenticado', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  await supabase.auth.signOut();
  return success({ message: 'Sesión cerrada' });
}

/**
 * POST /auth/change-password
 * El usuario autenticado cambia su propia contraseña. Se usa para el cambio
 * forzado en el primer login (admin de cliente creado por el super-admin) y
 * también para cambios voluntarios. Al completar, limpia must_change_password.
 * Body: { new_password }
 */
async function handleChangePassword(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return error('UNAUTHORIZED', 'No autenticado', 401);

  // Cliente autenticado con el token del usuario: valida la sesión.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return error('UNAUTHORIZED', 'No autenticado', 401);

  const body = await req.json();
  const newPassword = body?.new_password;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return error('VALIDATION_ERROR', `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`, 422);
  }

  // Actualizar la contraseña con el service client (admin API) y limpiar la bandera.
  const svc = createServiceClient();
  const { error: updateError } = await svc.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updateError) return error('VALIDATION_ERROR', `No se pudo actualizar la contraseña: ${updateError.message}`, 400);

  await svc.from('workers').update({ must_change_password: false }).eq('auth_user_id', user.id);

  return success({ message: 'Contraseña actualizada' });
}
