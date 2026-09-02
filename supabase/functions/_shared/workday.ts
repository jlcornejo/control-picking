/**
 * Resolución del "día de trabajo" (work_day) en la zona horaria del tenant.
 *
 * La base opera en UTC, pero el work_day es un concepto de negocio anclado a la
 * zona de la organización (organizations.timezone). La autoridad es el servidor:
 * nunca se calcula con la zona del dispositivo del cliente.
 *
 * Usa el RPC org_workday(p_org_id) (definido en la migración de timezone) para
 * que TS y SQL compartan exactamente la misma lógica de fecha.
 */
export async function getOrgWorkday(supabase: any, orgId: string): Promise<string> {
  const { data, error: rpcError } = await supabase.rpc('org_workday', { p_org_id: orgId });
  if (rpcError || !data) {
    throw new Error(`No se pudo resolver el día de trabajo del tenant: ${rpcError?.message ?? 'sin datos'}`);
  }
  // org_workday devuelve DATE -> string 'YYYY-MM-DD'
  return typeof data === 'string' ? data : String(data);
}
