'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PAYMENT_EVIDENCE } from '@fundo360/shared';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import {
  currentOrgId,
  uploadPaymentEvidence,
  signedPaymentEvidenceUrl,
} from '@/lib/payment-evidence';
import { ImagePlus, X } from 'lucide-react';

export default function PaymentsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { enabled: photoEnabled } = useFeatureFlag('payment_photo_evidence');

  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, workers(full_name), crews(name), settlements(period_start, period_end)')
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Evidencia fotográfica por pago (solo cuando el flag está activo). Se consulta
  // aparte y se agrupa por payment_id para alimentar la columna "Fotos".
  const paymentIds = (data || []).map((p: any) => p.id);
  const { data: evidenceByPayment } = useQuery({
    queryKey: ['payment-evidence', paymentIds],
    enabled: photoEnabled && paymentIds.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('payment_photo_evidence')
        .select('payment_id, image_path')
        .in('payment_id', paymentIds);
      if (error) throw error;
      const grouped: Record<string, string[]> = {};
      for (const r of rows || []) {
        const pid = (r as any).payment_id as string;
        (grouped[pid] ||= []).push((r as any).image_path as string);
      }
      return grouped;
    },
  });

  const columns = [
    { key: 'payee', label: 'Beneficiario', render: (row: any) => (
      row.crew_id
        ? (
          <span className="font-medium text-foreground">
            {row.crews?.name || 'Cuadrilla'}
            <span className="ml-1.5 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Cuadrilla</span>
          </span>
        )
        : <span className="font-medium text-foreground">{row.workers?.full_name || '—'}</span>
    )},
    { key: 'amount', label: 'Monto', render: (row: any) => (
      <span className="font-semibold text-foreground tabular-nums">${Number(row.amount).toLocaleString()}</span>
    )},
    { key: 'settlements', label: 'Período', render: (row: any) => (
      <span className="text-sm tabular-nums">{row.settlements?.period_start} — {row.settlements?.period_end}</span>
    )},
    { key: 'paid_at', label: 'Fecha pago', render: (row: any) => (
      <span className="tabular-nums">{new Date(row.paid_at).toLocaleDateString('es-CL')}</span>
    )},
    { key: 'notes', label: 'Notas', render: (row: any) => (
      <span className="text-muted-foreground">{row.notes || '—'}</span>
    )},
    ...(photoEnabled
      ? [{
          key: 'evidence',
          label: 'Fotos',
          render: (row: any) => (
            <PaymentEvidenceThumbnails paths={evidenceByPayment?.[row.id] || []} />
          ),
        }]
      : []),
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Pagos"
        description="Historial de pagos realizados"
        action={
          <ActionButton onClick={() => setShowCreate(true)}>
            Registrar Pago
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay pagos registrados"
        searchPlaceholder="Buscar pagos..."
        searchKeys={['workers', 'notes']}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Registrar Pago">
        <CreatePaymentForm
          photoEnabled={photoEnabled}
          onSuccess={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['payment-evidence'] });
            queryClient.invalidateQueries({ queryKey: ['pending-settlements'] });
            queryClient.invalidateQueries({ queryKey: ['settlements'] });
            toast('Pago registrado', 'success');
          }}
        />
      </Modal>
    </PageTransition>
  );
}

/**
 * Miniaturas de la evidencia de un pago. Resuelve una URL firmada temporal por
 * cada ruta y, al hacer click, abre la imagen en una pestaña nueva.
 */
function PaymentEvidenceThumbnails({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (paths.length === 0) {
      setUrls([]);
      return;
    }
    (async () => {
      const resolved = await Promise.all(paths.map((p) => signedPaymentEvidenceUrl(p, 3600)));
      if (active) setUrls(resolved.filter((u): u is string => !!u));
    })();
    return () => {
      active = false;
    };
  }, [paths]);

  if (paths.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {urls.map((url, i) => (
        <button
          key={i}
          type="button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          className="h-9 w-9 overflow-hidden rounded-lg border border-border bg-muted/30 ring-1 ring-transparent hover:ring-primary/30 transition-all"
          aria-label="Ver foto de respaldo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Respaldo del pago" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}

function CreatePaymentForm({ onSuccess, photoEnabled }: { onSuccess: () => void; photoEnabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const supabase = createClient();
  const { toast } = useToast();

  const { data: pendingSettlements } = useQuery({
    queryKey: ['pending-settlements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('settlements')
        .select('id, payee_type, worker_id, crew_id, total_amount, status, workers!fk_settlements_worker_org(full_name), crews!settlements_crew_id_fkey(name), period_start, period_end')
        .in('status', ['pending', 'partial'])
        .order('generated_at', { ascending: false });

      // Get paid amounts for each
      const results = [];
      for (const s of data || []) {
        const { data: payments } = await supabase.from('payments').select('amount').eq('settlement_id', s.id);
        const paid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
        results.push({ ...s, paid, remaining: Number(s.total_amount) - paid });
      }
      return results;
    },
  });

  const selected = pendingSettlements?.find((s: any) => s.id === selectedId);

  function addFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return;
    setFiles((prev) => [...prev, ...Array.from(selectedFiles)].slice(0, PAYMENT_EVIDENCE.MAX_IMAGES));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const amount = parseFloat(form.get('amount') as string);
    const notes = form.get('notes') as string;

    if (!selected) { setError('Seleccione una liquidación'); setLoading(false); return; }
    if (amount > selected.remaining) { setError(`El monto supera el saldo pendiente ($${selected.remaining.toLocaleString()})`); setLoading(false); return; }

    // El sujeto de pago se deriva del tipo de liquidación: 'crew' -> pago al
    // Encargado (crew_id); 'worker' -> pago al trabajador (worker_id).
    // organization_id lo completa el trigger set_organization_id desde el JWT.
    const payeeColumns =
      (selected as any).payee_type === 'crew'
        ? { crew_id: (selected as any).crew_id, worker_id: null }
        : { worker_id: (selected as any).worker_id, crew_id: null };

    const { data: inserted, error: dbError } = await supabase
      .from('payments')
      .insert({
        settlement_id: selectedId,
        ...payeeColumns,
        amount,
        notes: notes || null,
      })
      .select('id')
      .single();

    if (dbError) { setError(dbError.message); setLoading(false); return; }

    // Update settlement status
    const newPaid = selected.paid + amount;
    const newStatus = newPaid >= Number((selected as any).total_amount) ? 'paid' : 'partial';
    await supabase.from('settlements').update({ status: newStatus }).eq('id', selectedId);

    // Evidencia fotográfica (best-effort): el pago ya está registrado y es
    // crítico; si una foto falla, se avisa pero NO se revierte el pago.
    if (photoEnabled && files.length > 0 && inserted?.id) {
      try {
        const orgId = await currentOrgId();
        const { data: auth } = await supabase.auth.getUser();
        const { data: me } = await supabase
          .from('workers')
          .select('id')
          .eq('auth_user_id', auth.user?.id ?? '')
          .maybeSingle();

        let anyFailed = false;
        if (!orgId || !me?.id) {
          anyFailed = true;
        } else {
          for (const file of files) {
            try {
              const path = await uploadPaymentEvidence({ orgId, paymentId: inserted.id, file });
              const { error: evErr } = await supabase.from('payment_photo_evidence').insert({
                payment_id: inserted.id,
                image_path: path,
                uploaded_by: me.id,
              });
              if (evErr) anyFailed = true;
            } catch {
              anyFailed = true;
            }
          }
        }
        if (anyFailed) {
          toast('El pago se registró; una foto no se pudo adjuntar', 'error');
        }
      } catch {
        toast('El pago se registró; una foto no se pudo adjuntar', 'error');
      }
    }

    setLoading(false);
    onSuccess();
  }

  const atMax = files.length >= PAYMENT_EVIDENCE.MAX_IMAGES;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Settlement selector */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Liquidación pendiente *</label>
        <select
          name="settlement_id"
          required
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        >
          <option value="">Seleccione liquidación...</option>
          {(pendingSettlements || []).map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.payee_type === 'crew' ? `${s.crews?.name || 'Cuadrilla'} (Encargado)` : s.workers?.full_name} — {s.period_start} a {s.period_end}
            </option>
          ))}
        </select>
      </div>

      {/* Selected settlement detail */}
      {selected && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{(selected as any).payee_type === 'crew' ? `${(selected as any).crews?.name || 'Cuadrilla'} (Encargado)` : (selected as any).workers?.full_name}</span>
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
              selected.status === 'pending' ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-orange-50 text-orange-700 ring-orange-600/20'
            }`}>
              {selected.status === 'pending' ? 'Pendiente' : 'Parcial'}
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            Período: {selected.period_start} — {selected.period_end}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Pagado</span>
              <span className="font-medium text-foreground">
                ${selected.paid.toLocaleString()} / ${Number((selected as any).total_amount).toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-glow rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (selected.paid / Number((selected as any).total_amount)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Remaining */}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-sm text-muted-foreground">Saldo pendiente</span>
            <span className="text-lg font-bold text-foreground tabular-nums">${selected.remaining.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Monto a pagar ($) *</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <input
            name="amount"
            type="number"
            step="1"
            min="1"
            max={selected?.remaining || undefined}
            required
            placeholder={selected ? selected.remaining.toLocaleString() : '0'}
            className="block w-full rounded-xl border border-border bg-muted/30 pl-8 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>
        {selected && (
          <p className="mt-1 text-xs text-muted-foreground">
            Máximo: ${selected.remaining.toLocaleString()}
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Notas</label>
        <input name="notes" placeholder="Ej: Transferencia, efectivo, cheque..." className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
      </div>

      {/* Fotos de respaldo (gateado por el flag payment_photo_evidence) */}
      {photoEnabled && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Fotos de respaldo (opcional, máx {PAYMENT_EVIDENCE.MAX_IMAGES})
          </label>

          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((file, i) => {
                const url = URL.createObjectURL(file);
                return (
                  <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Respaldo ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground transition-all"
                      aria-label="Quitar foto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:ring-2 hover:ring-primary/30 ${
              atMax ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <ImagePlus className="h-4 w-4" />
            {atMax ? `Máximo ${PAYMENT_EVIDENCE.MAX_IMAGES} fotos` : 'Agregar foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={atMax}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !selectedId}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
      >
        {loading ? 'Registrando...' : 'Registrar Pago'}
      </button>
    </form>
  );
}
