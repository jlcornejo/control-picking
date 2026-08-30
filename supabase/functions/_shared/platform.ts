/**
 * Utilidades para la consola de plataforma (super-admin / soporte).
 */

/**
 * Registra una acción de plataforma en platform_audit_log (best-effort).
 * No debe bloquear la operación principal si falla la auditoría.
 *
 * @param admin  service-role client (createServiceClient)
 */
export async function logPlatformAction(
  req: Request,
  admin: any,
  orgId: string | null,
  action: string,
  resource: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
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
    // La auditoría no debe bloquear la operación principal.
  }
}
