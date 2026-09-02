import { supabase } from '../lib/supabase';

/**
 * Resolución del "día de trabajo" (work_day) anclado a la zona del TENANT.
 *
 * La base opera en UTC, pero el work_day es un concepto de negocio que pertenece
 * a la organización, no al instante UTC ni a la zona del dispositivo. La
 * autoridad es el servidor: el RPC `org_workday` calcula "hoy" en
 * organizations.timezone (ej. America/Santiago).
 *
 * Antes se usaba la zona del dispositivo (new Date() local), lo que provocaba un
 * desfase de un día para registros hechos entre la tarde/noche local y la
 * medianoche UTC. Ese bug queda corregido usando la fecha del tenant.
 */

/** Fecha base del tenant ('YYYY-MM-DD'), cacheada tras resolverla del servidor. */
let cachedTenantToday: string | null = null;

/** Suma `offset` días a una fecha 'YYYY-MM-DD' con aritmética UTC pura (sin zona local). */
export function addDays(isoDate: string, offset: number): string {
  const parts = isoDate.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offset);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

/**
 * "Hoy" del tenant (más `offset` días) según la zona horaria de la organización.
 * Resuelto por el servidor vía RPC `current_org_workday`. Cachea el resultado
 * para que las llamadas posteriores (y la variante síncrona) sean inmediatas.
 */
export async function tenantWorkday(offset = 0): Promise<string> {
  if (!cachedTenantToday) {
    const { data, error } = await supabase.rpc('current_org_workday');
    if (!error && data) {
      cachedTenantToday = typeof data === 'string' ? data : String(data);
    } else {
      // Fallback defensivo: si el RPC falla (offline/sesión), usa la fecha del
      // dispositivo. El servidor sigue siendo la autoridad al insertar (trigger
      // set_picking_work_day resuelve work_day en la zona del tenant).
      cachedTenantToday = deviceDate(0);
    }
  }
  return addDays(cachedTenantToday, offset);
}

/**
 * Variante síncrona de `tenantWorkday`. Devuelve la fecha del tenant cacheada
 * (más offset) si ya fue resuelta; si no, cae a la fecha del dispositivo.
 * Úsala en render/filtros; para escrituras (INSERT de picking) prefiere la
 * versión async o deja que el servidor fije work_day.
 */
export function localDate(offset = 0): string {
  const base = cachedTenantToday ?? deviceDate(0);
  return addDays(base, offset);
}

/** Precarga la fecha del tenant en la caché (llamar al iniciar sesión/app). */
export async function primeTenantWorkday(): Promise<void> {
  cachedTenantToday = null;
  await tenantWorkday(0);
}

/** Limpia la caché de la fecha del tenant (llamar al cerrar sesión). */
export function clearTenantWorkdayCache(): void {
  cachedTenantToday = null;
}

/** Fecha del dispositivo 'YYYY-MM-DD' (solo fallback interno). */
function deviceDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
