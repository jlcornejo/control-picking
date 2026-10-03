import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

/**
 * Evidencia fotográfica del registro de picking.
 *
 * La foto de respaldo se guarda en el bucket privado `picking-evidence`, aislado
 * por organización mediante el primer segmento de la ruta del objeto:
 *   {org_id}/{picking_record_id}/{uuid}.jpg
 *
 * Se persiste la RUTA (storage key) en picking_records.backup_image_path, nunca
 * una URL pública. Para visualizar se genera una URL firmada temporal.
 */

const BUCKET = 'picking-evidence';

/** Genera un UUID v4 (reusa expo-crypto, ya presente en el build). */
export function newUuid(): string {
  return Crypto.randomUUID();
}

/**
 * Lee el org_id (organización del usuario) desde el claim del JWT de la sesión
 * actual. Es el mismo claim que usan las policies RLS; así el primer segmento
 * del path de la evidencia coincide siempre con lo que el servidor exige.
 * Devuelve null si no hay sesión o el claim no está presente.
 */
export async function currentOrgId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url -> base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8'),
    );
    const orgId = json?.org_id;
    return typeof orgId === 'string' && orgId.length > 0 ? orgId : null;
  } catch {
    return null;
  }
}

/**
 * Construye la ruta del objeto de evidencia para un registro.
 * El primer segmento (org_id) es lo que las policies RLS validan contra el JWT.
 */
export function evidencePath(orgId: string, recordId: string, uuid: string): string {
  return `${orgId}/${recordId}/${uuid}.jpg`;
}

/**
 * Sube una foto (uri local de la cámara) al bucket de evidencia y devuelve la
 * ruta del objeto almacenado. Lanza si falla la lectura del archivo o la subida.
 *
 * En React Native el cuerpo se envía como ArrayBuffer (fetch sobre el uri local);
 * `supabase-js` lo acepta y respeta el contentType.
 */
export async function uploadPickingEvidence(params: {
  orgId: string;
  recordId: string;
  localUri: string;
}): Promise<string> {
  const { orgId, recordId, localUri } = params;
  const path = evidencePath(orgId, recordId, newUuid());

  // Leer el archivo local como binario. takePictureAsync entrega un uri file://
  // en el cache de la app; fetch lo resuelve a un ArrayBuffer.
  const res = await fetch(localUri);
  const arrayBuffer = await res.arrayBuffer();

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;

  return path;
}

/**
 * Devuelve una URL firmada temporal para visualizar una evidencia.
 * `expiresInSeconds` por defecto 1 hora. Devuelve null si la ruta es vacía o falla.
 */
export async function signedEvidenceUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
