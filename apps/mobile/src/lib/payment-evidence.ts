import { PAYMENT_EVIDENCE } from '@fundo360/shared';
import { supabase } from './supabase';
// Reusa la generación de UUID del helper de picking (mismo mecanismo). La
// lectura del org_id del JWT (currentOrgId) también vive allí y se reusa desde
// la pantalla de pagos; no se re-implementa.
import { newUuid } from './picking-evidence';

/**
 * Evidencia fotográfica de un pago (p. ej. pago en mano/efectivo).
 *
 * Espejo de picking-evidence.ts: las imágenes se guardan en el bucket privado
 * `payment-evidence`, aisladas por organización mediante el primer segmento de
 * la ruta del objeto:
 *   {org_id}/{payment_id}/{uuid}.jpg
 *
 * Se persiste la RUTA (storage key) en payment_photo_evidence.image_path, nunca
 * una URL pública. Para visualizar se genera una URL firmada temporal.
 */

const BUCKET = PAYMENT_EVIDENCE.BUCKET;

/**
 * Construye la ruta del objeto de evidencia para un pago.
 * El primer segmento (org_id) es lo que las policies RLS validan contra el JWT.
 */
export function evidencePath(orgId: string, paymentId: string, uuid: string): string {
  return `${orgId}/${paymentId}/${uuid}.jpg`;
}

/**
 * Sube una foto (uri local de la cámara) al bucket de evidencia de pagos y
 * devuelve la ruta del objeto almacenado. Lanza si falla la lectura del archivo
 * o la subida.
 *
 * En React Native el cuerpo se envía como ArrayBuffer (fetch sobre el uri local);
 * `supabase-js` lo acepta y respeta el contentType.
 */
export async function uploadPaymentEvidence(params: {
  orgId: string;
  paymentId: string;
  localUri: string;
}): Promise<string> {
  const { orgId, paymentId, localUri } = params;
  const path = evidencePath(orgId, paymentId, newUuid());

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
 * Devuelve una URL firmada temporal para visualizar una evidencia de pago.
 * `expiresInSeconds` por defecto 1 hora. Devuelve null si la ruta es vacía o falla.
 */
export async function signedPaymentEvidenceUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
