import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useConnectivity } from './useConnectivity';
import { enqueue } from '../lib/offline-queue';
import { showAlert } from '../lib/alert';
import { localDate } from '../utils/date';

/**
 * Registro a corregir. Es un subconjunto del registro enriquecido que pintan
 * tanto Producción como Registros: lo necesario para construir el snapshot de
 * auditoría y el update in-place del original.
 */
export interface CorrectableRecord {
  id: string;
  worker_id: string;
  block_id: string;
  quantity: number | string;
  payment_unit: 'box' | 'kg';
  paid_quantity_kg: number | string | null;
  rate_amount_snapshot: number | string;
  work_day: string;
  /** Unidad efectiva ya resuelta por la pantalla ('box' | 'kg'). */
  unit: string;
}

export interface CorrectionResult {
  queued: boolean;
}

/**
 * Mutación compartida de corrección de un registro de picking (soft-update
 * auditado). Extraída de `production.tsx` sin cambio funcional para que
 * Producción y Registros (admin) la reutilicen.
 *
 * Invariantes preservados:
 *  - Solo se corrige un registro del día actual (work_day === localDate(0)).
 *  - Soft-update: snapshot con valores viejos + original_record_id, luego update
 *    del original in-place (quantity para caja; paid_quantity_kg a 3 decimales
 *    para kg). `rate_amount_snapshot` y `payment_unit` nunca cambian.
 *  - Nueva cantidad/kg > 0 (picking quantity > 0).
 *  - Offline: se encola la corrección (useConnectivity + enqueue).
 *
 * El hook expone SOLO la mutación; la visibilidad del botón "Corregir" la decide
 * cada pantalla. En `onSuccess` invalida AMBAS familias de claves (['production']
 * y ['records']) para que una corrección hecha desde cualquiera de las dos
 * pantallas refresque las dos.
 */
export function usePickingCorrection() {
  const { worker } = useAuth();
  const { online } = useConnectivity();
  const queryClient = useQueryClient();

  return useMutation<CorrectionResult, Error, { record: CorrectableRecord; rawValue: string }>({
    mutationFn: async ({ record, rawValue }) => {
      const value = parseFloat(rawValue);
      const isKg = record.unit === 'kg';
      if (!value || value <= 0) throw new Error(isKg ? 'Los kilos deben ser mayores a 0' : 'La cantidad debe ser mayor a 0');
      if (record.work_day !== localDate(0)) throw new Error('Solo se puede corregir un registro del día actual');

      const newKg = isKg ? Math.round(value * 1000) / 1000 : null;

      if (online) {
        // 1) Snapshot de auditoría con los valores VIEJOS, apuntando al original.
        //    organization_id lo completa el trigger set_organization_id.
        //    payment_unit y paid_quantity_kg se copian (NOT NULL / CHECK).
        const { error: snapErr } = await supabase.from('picking_records').insert({
          worker_id: record.worker_id,
          block_id: record.block_id,
          quantity: record.quantity,
          payment_unit: record.payment_unit,
          paid_quantity_kg: record.paid_quantity_kg,
          rate_amount_snapshot: record.rate_amount_snapshot,
          work_day: record.work_day,
          recorded_by: worker?.id,
          original_record_id: record.id,
        });
        if (snapErr) throw snapErr;

        // 2) Editar el original in-place. kg -> paid_quantity_kg; caja -> quantity.
        //    rate_amount_snapshot y payment_unit nunca cambian.
        const patch = isKg ? { paid_quantity_kg: newKg } : { quantity: value };
        const { error: updErr } = await supabase.from('picking_records')
          .update(patch)
          .eq('id', record.id);
        if (updErr) throw updErr;
        return { queued: false };
      }

      // Offline: encolar la corrección (snapshot + update) para reproducir al reconectar.
      await enqueue({
        type: 'picking_correction',
        payload: {
          original_id: record.id,
          old_worker_id: record.worker_id,
          old_block_id: record.block_id,
          old_quantity: Number(record.quantity),
          old_payment_unit: record.payment_unit,
          old_paid_quantity_kg: record.paid_quantity_kg === null || record.paid_quantity_kg === undefined ? null : Number(record.paid_quantity_kg),
          old_rate_amount_snapshot: Number(record.rate_amount_snapshot),
          work_day: record.work_day,
          recorded_by: worker?.id ?? null,
          new_quantity: isKg ? Number(record.quantity) : value,
          new_paid_quantity_kg: newKg,
        },
      });
      return { queued: true };
    },
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Invalida AMBAS familias: Producción y Registros leen claves distintas
      // (['production', ...] y ['records', ...]) y una corrección desde cualquiera
      // debe refrescar las dos (lista, resumen y fuente del CSV).
      queryClient.invalidateQueries({ queryKey: ['production'] });
      queryClient.invalidateQueries({ queryKey: ['records'] });
      showAlert(res.queued ? 'Corrección en espera' : 'Registro corregido',
        res.queued ? 'Se sincronizará al reconectar.' : undefined);
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert('Error', err.message);
    },
  });
}
