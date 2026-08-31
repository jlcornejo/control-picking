import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Cola de mutaciones offline para operaciones críticas de terreno.
 *
 * Modelo: cuando no hay conectividad, las mutaciones se serializan y guardan en
 * AsyncStorage. Al reconectar (o al abrir la app con red), se reproducen en
 * orden FIFO. Cada job re-valida los invariantes de dominio en el momento de la
 * reproducción (no solo al encolar), porque el estado del servidor pudo cambiar
 * mientras el dispositivo estuvo offline.
 *
 * Invariantes preservados:
 *  - picking_records.quantity > 0
 *  - rate_amount_snapshot > 0 (tarifa vigente al momento del registro)
 *  - payments.amount > 0 y <= saldo pendiente (settlement inmutable si ya está pagado)
 *  - payments: crew_id XOR worker_id
 *  - corrección: snapshot de auditoría (valores viejos) + update del original in-place
 */

const QUEUE_KEY = 'fundo360.offline_queue.v1';

export type PickingInsertJob = {
  type: 'picking_insert';
  payload: {
    worker_id: string;
    block_id: string;
    quantity: number;
    rate_amount_snapshot: number;
    work_day: string;
    recorded_by: string | null;
  };
};

export type PickingCorrectionJob = {
  type: 'picking_correction';
  payload: {
    original_id: string;
    // Valores viejos para el snapshot de auditoría
    old_worker_id: string;
    old_block_id: string;
    old_quantity: number;
    old_rate_amount_snapshot: number;
    work_day: string;
    recorded_by: string | null;
    // Nuevo valor a aplicar al original
    new_quantity: number;
  };
};

export type PaymentInsertJob = {
  type: 'payment_insert';
  payload: {
    settlement_id: string;
    worker_id: string | null;
    crew_id: string | null;
    amount: number;
    notes: string | null;
    settlement_total: number;
  };
};

export type QueuedJobBody = PickingInsertJob | PickingCorrectionJob | PaymentInsertJob;

export type QueuedJob = QueuedJobBody & {
  id: string;
  enqueuedAt: number;
  attempts: number;
};

export type ProcessResult = { processed: number; failed: number; remaining: number };

type Listener = (count: number) => void;

const listeners = new Set<Listener>();
let processing = false;

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue(): Promise<QueuedJob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(jobs: QueuedJob[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
  listeners.forEach((l) => l(jobs.length));
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  readQueue().then((jobs) => listener(jobs.length));
  return () => listeners.delete(listener);
}

export async function getQueueCount(): Promise<number> {
  return (await readQueue()).length;
}

/** Valida invariantes de dominio antes de aceptar un job en la cola. */
function validateJob(job: QueuedJobBody): void {
  if (job.type === 'picking_insert') {
    if (!(job.payload.quantity > 0)) throw new Error('La cantidad debe ser mayor a 0');
    if (!(job.payload.rate_amount_snapshot > 0)) throw new Error('La tarifa debe ser mayor a 0');
  } else if (job.type === 'picking_correction') {
    if (!(job.payload.new_quantity > 0)) throw new Error('La cantidad debe ser mayor a 0');
  } else if (job.type === 'payment_insert') {
    if (!(job.payload.amount > 0)) throw new Error('El monto debe ser mayor a 0');
    const hasWorker = !!job.payload.worker_id;
    const hasCrew = !!job.payload.crew_id;
    if (hasWorker === hasCrew) throw new Error('El pago debe tener crew_id XOR worker_id');
  }
}

export async function enqueue(job: QueuedJobBody): Promise<QueuedJob> {
  validateJob(job);
  const jobs = await readQueue();
  const queued: QueuedJob = { ...job, id: genId(), enqueuedAt: Date.now(), attempts: 0 };
  jobs.push(queued);
  await writeQueue(jobs);
  return queued;
}

/** Ejecuta un único job contra Supabase. Lanza en caso de error para reintentar. */
async function runJob(job: QueuedJob): Promise<void> {
  validateJob(job);

  if (job.type === 'picking_insert') {
    const { error } = await supabase.from('picking_records').insert({
      worker_id: job.payload.worker_id,
      block_id: job.payload.block_id,
      quantity: job.payload.quantity,
      rate_amount_snapshot: job.payload.rate_amount_snapshot,
      work_day: job.payload.work_day,
      recorded_by: job.payload.recorded_by,
    });
    if (error) throw error;
    return;
  }

  if (job.type === 'picking_correction') {
    // 1) Snapshot de auditoría con los valores VIEJOS apuntando al original.
    const { error: snapErr } = await supabase.from('picking_records').insert({
      worker_id: job.payload.old_worker_id,
      block_id: job.payload.old_block_id,
      quantity: job.payload.old_quantity,
      rate_amount_snapshot: job.payload.old_rate_amount_snapshot,
      work_day: job.payload.work_day,
      recorded_by: job.payload.recorded_by,
      original_record_id: job.payload.original_id,
    });
    if (snapErr) throw snapErr;
    // 2) Editar el original in-place con la nueva cantidad (conserva la tarifa).
    const { error: updErr } = await supabase
      .from('picking_records')
      .update({ quantity: job.payload.new_quantity })
      .eq('id', job.payload.original_id);
    if (updErr) throw updErr;
    return;
  }

  if (job.type === 'payment_insert') {
    // Re-verificar inmutabilidad/saldo: el settlement pudo pagarse mientras
    // estábamos offline. Recalculamos el pagado real desde el servidor.
    const { data: prior, error: priorErr } = await supabase
      .from('payments')
      .select('amount')
      .eq('settlement_id', job.payload.settlement_id);
    if (priorErr) throw priorErr;
    const alreadyPaid = (prior || []).reduce((s, p) => s + Number(p.amount), 0);
    const remaining = job.payload.settlement_total - alreadyPaid;
    if (remaining <= 0) throw new Error('La liquidación ya está pagada');
    if (job.payload.amount > remaining) throw new Error('El monto supera el saldo pendiente');

    const { error } = await supabase.from('payments').insert({
      settlement_id: job.payload.settlement_id,
      worker_id: job.payload.worker_id,
      crew_id: job.payload.crew_id,
      amount: job.payload.amount,
      notes: job.payload.notes,
    });
    if (error) throw error;

    const newPaid = alreadyPaid + job.payload.amount;
    const newStatus = newPaid >= job.payload.settlement_total ? 'paid' : 'partial';
    const { error: stErr } = await supabase
      .from('settlements')
      .update({ status: newStatus })
      .eq('id', job.payload.settlement_id);
    if (stErr) throw stErr;
    return;
  }
}

const MAX_ATTEMPTS = 5;

/**
 * Procesa la cola en orden FIFO. Se detiene ante el primer error de red para
 * preservar el orden. Jobs con error de validación permanente (o que exceden
 * MAX_ATTEMPTS) se descartan para no bloquear la cola indefinidamente.
 */
export async function processQueue(): Promise<ProcessResult> {
  if (processing) return { processed: 0, failed: 0, remaining: await getQueueCount() };
  processing = true;
  let processed = 0;
  let failed = 0;
  try {
    let jobs = await readQueue();
    while (jobs.length > 0) {
      const job = jobs[0];
      if (!job) break;
      try {
        await runJob(job);
        jobs = jobs.slice(1);
        await writeQueue(jobs);
        processed++;
      } catch (err: any) {
        const attempts = job.attempts + 1;
        const permanent = isPermanentError(err);
        if (permanent || attempts >= MAX_ATTEMPTS) {
          // Descartar job envenenado para no bloquear el resto.
          jobs = jobs.slice(1);
          await writeQueue(jobs);
          failed++;
          continue;
        }
        // Error transitorio (red): incrementar intento y detener para conservar orden.
        jobs = [{ ...job, attempts }, ...jobs.slice(1)];
        await writeQueue(jobs);
        break;
      }
    }
  } finally {
    processing = false;
  }
  return { processed, failed, remaining: await getQueueCount() };
}

/**
 * Un error se considera permanente (no reintentable) si es de validación de
 * negocio o de RLS/PostgREST, no una caída de red. En esos casos reintentar no
 * ayuda y solo bloquearía la cola.
 */
function isPermanentError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  if (
    msg.includes('la cantidad debe') ||
    msg.includes('la tarifa debe') ||
    msg.includes('el monto') ||
    msg.includes('crew_id xor') ||
    msg.includes('ya está pagada') ||
    msg.includes('saldo pendiente')
  ) {
    return true;
  }
  // PostgREST/Supabase devuelve `code` para errores de la base (RLS, checks, FKs).
  if (err?.code && typeof err.code === 'string') return true;
  return false;
}
