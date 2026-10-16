import { PAYMENT_EVIDENCE } from '@fundo360/shared';
import { createClient } from '@/lib/supabase';

/**
 * Evidencia fotográfica de respaldo de un pago (web).
 *
 * Espejo de apps/mobile/src/lib/payment-evidence.ts: las imágenes se guardan en
 * el bucket privado `payment-evidence`, aisladas por organización mediante el
 * primer segmento de la ruta del objeto:
 *   {org_id}/{payment_id}/{uuid}.<ext>
 *
 * Nunca se persiste una URL pública: se guarda la RUTA (storage key) en
 * payment_photo_evidence.image_path y se visualiza con una URL firmada temporal.
 */

const BUCKET = PAYMENT_EVIDENCE.BUCKET;

/** Extensiones aceptadas por MIME type (coinciden con allowed_mime_types del bucket). */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Lee el org_id (organización del usuario) desde el claim del JWT de la sesión
 * actual, igual que las policies RLS. Así el primer segmento del path de la
 * evidencia coincide siempre con lo que el servidor exige. Devuelve null si no
 * hay sesión o el claim no está presente.
 */
export async function currentOrgId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url -> base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64)) as { org_id?: unknown };
    const orgId = json?.org_id;
    return typeof orgId === 'string' && orgId.length > 0 ? orgId : null;
  } catch {
    return null;
  }
}

/**
 * Construye la ruta del objeto de evidencia para un pago.
 * El primer segmento (org_id) es lo que las policies RLS validan contra el JWT.
 */
export function evidencePath(orgId: string, paymentId: string, uuid: string, ext: string): string {
  return `${orgId}/${paymentId}/${uuid}.${ext}`;
}

/**
 * Sube una imagen (File del input) al bucket de evidencia y devuelve la ruta del
 * objeto almacenado. Lanza si falla la subida.
 */
export async function uploadPaymentEvidence(params: {
  orgId: string;
  paymentId: string;
  file: File;
}): Promise<string> {
  const { orgId, paymentId, file } = params;
  const ext = EXT_BY_MIME[file.type] ?? 'jpg';
  const path = evidencePath(orgId, paymentId, crypto.randomUUID(), ext);

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  return path;
}

/**
 * Devuelve una URL firmada temporal para visualizar una evidencia.
 * `expiresInSeconds` por defecto 1 hora. Devuelve null si la ruta es vacía o falla.
 */
export async function signedPaymentEvidenceUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
