'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageTransition } from '@/components/ui/animations';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { ArrowLeft, Scale, PencilRuler, Lock, LockOpen, Save, PackageCheck, TrendingDown } from 'lucide-react';

interface DispatchGuide {
  id: string;
  scope: 'block' | 'field';
  field_id: string;
  block_id: string | null;
  work_day: string;
  status: 'open' | 'closed';
  guide_number: string;
  total_trays: number;
  total_weight_kg: number;
  weight_precise: boolean;
  weight_source: 'scale' | 'estimated' | 'mixed';
  carrier: string | null;
  notes: string | null;
  closed_at: string | null;
}

interface DispatchReceipt {
  id: string;
  received_trays: number;
  received_weight_kg: number;
  received_at: string;
  notes: string | null;
}

interface DispatchComparison {
  dispatched_trays: number;
  dispatched_weight_kg: number;
  received_trays: number;
  received_weight_kg: number;
  trays_diff: number;
  weight_diff_kg: number;
  weight_shrinkage_pct: number;
  has_receipt: boolean;
}

interface DetailData {
  guide: DispatchGuide;
  receipt: DispatchReceipt | null;
  comparison: DispatchComparison;
}

function num(v: number, d = 0) {
  return Number(v).toLocaleString('es-CL', { maximumFractionDigits: d });
}

export default function DispatchGuideDetailPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = useParams();
  const id = params?.id as string;
  const { enabled, loading: flagLoading } = useFeatureFlag('dispatch_guides');

  const [editTrays, setEditTrays] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editCarrier, setEditCarrier] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [rTrays, setRTrays] = useState('');
  const [rWeight, setRWeight] = useState('');
  const [rNotes, setRNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['dispatch-guide', id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`dispatch-guides/${id}`, { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Guía no encontrada');
      return data.data as DetailData;
    },
    enabled: enabled && !!id,
  });

  // Sync editable fields when the guide loads/changes.
  useEffect(() => {
    if (data?.guide) {
      setEditTrays(String(data.guide.total_trays));
      setEditWeight(String(data.guide.total_weight_kg));
      setEditCarrier(data.guide.carrier ?? '');
      setEditNotes(data.guide.notes ?? '');
    }
    if (data?.receipt) {
      setRTrays(String(data.receipt.received_trays));
      setRWeight(String(data.receipt.received_weight_kg));
      setRNotes(data.receipt.notes ?? '');
    }
  }, [data]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['dispatch-guide', id] });
    queryClient.invalidateQueries({ queryKey: ['dispatch-guides'] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.functions.invoke(`dispatch-guides/${id}`, {
        method: 'PUT',
        body: {
          total_trays: Number(editTrays),
          total_weight_kg: Number(editWeight),
          carrier: editCarrier.trim() || null,
          notes: editNotes.trim() || null,
        },
      });
      if (error) throw error;
      if (res?.success === false) throw new Error(res?.error?.message || 'Error al guardar');
    },
    onSuccess: () => { invalidate(); toast('Guía actualizada', 'success'); },
    onError: (err: any) => toast(err.message || 'Error al guardar', 'error'),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.functions.invoke(`dispatch-guides/${id}/close`, { method: 'POST', body: {} });
      if (error) throw error;
      if (res?.success === false) throw new Error(res?.error?.message || 'Error al cerrar');
    },
    onSuccess: () => { invalidate(); toast('Guía cerrada', 'success'); },
    onError: (err: any) => toast(err.message || 'Error al cerrar', 'error'),
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.functions.invoke(`dispatch-guides/${id}/reopen`, { method: 'POST', body: {} });
      if (error) throw error;
      if (res?.success === false) throw new Error(res?.error?.message || 'Error al reabrir');
    },
    onSuccess: () => { invalidate(); toast('Guía reabierta', 'success'); },
    onError: (err: any) => toast(err.message || 'Error al reabrir', 'error'),
  });

  const receiptMutation = useMutation({
    mutationFn: async () => {
      const hasReceipt = !!data?.receipt;
      const { data: res, error } = await supabase.functions.invoke(`dispatch-guides/${id}/receipt`, {
        method: hasReceipt ? 'PUT' : 'POST',
        body: {
          received_trays: Number(rTrays),
          received_weight_kg: Number(rWeight),
          notes: rNotes.trim() || null,
        },
      });
      if (error) throw error;
      if (res?.success === false) throw new Error(res?.error?.message || 'Error al registrar recepción');
    },
    onSuccess: () => { invalidate(); toast('Recepción registrada', 'success'); },
    onError: (err: any) => toast(err.message || 'Error al registrar recepción', 'error'),
  });

  if (flagLoading) return null;

  if (!enabled) {
    return (
      <PageTransition>
        <PageHeader title="Guías de despacho" description="Logística de salida del campo" />
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Función no habilitada para tu organización.
        </div>
      </PageTransition>
    );
  }

  if (isLoading || !data) {
    return (
      <PageTransition>
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Cargando…</div>
      </PageTransition>
    );
  }

  const { guide, receipt, comparison } = data;
  const isOpen = guide.status === 'open';
  const merma = comparison.weight_shrinkage_pct > 0;

  return (
    <PageTransition>
      <Link href="/dispatch-guides" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> Volver a guías
      </Link>

      <PageHeader
        title={`Guía ${guide.guide_number}`}
        description={`${guide.scope === 'field' ? 'Cierre de campo' : 'Despacho por paño'} · ${guide.work_day}`}
        action={
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
              guide.status === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
            }`}>
              {guide.status === 'closed' ? <Lock size={12} /> : <LockOpen size={12} />}
              {guide.status === 'closed' ? 'Cerrada' : 'Abierta'}
            </span>
            {isOpen ? (
              <button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Lock size={15} /> Cerrar guía
              </button>
            ) : (
              <button onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
                <LockOpen size={15} /> Reabrir
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Despacho (editable while open) */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Despacho</h2>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              guide.weight_precise ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {guide.weight_precise ? <Scale size={11} /> : <PencilRuler size={11} />}
              {guide.weight_precise ? 'Peso preciso (balanza)' : `Aproximado (${guide.weight_source})`}
            </span>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Bandejas despachadas">
                <input type="number" min="0" step="0.01" value={editTrays} disabled={!isOpen}
                  onChange={(e) => setEditTrays(e.target.value)}
                  className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </FormField>
              <FormField label="Peso despachado (kg)">
                <input type="number" min="0" step="0.001" value={editWeight} disabled={!isOpen}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </FormField>
            </div>
            <FormField label="Transportista / furgón">
              <input type="text" maxLength={150} value={editCarrier} disabled={!isOpen}
                onChange={(e) => setEditCarrier(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
            <FormField label="Notas">
              <textarea maxLength={500} rows={2} value={editNotes} disabled={!isOpen}
                onChange={(e) => setEditNotes(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>

            {isOpen ? (
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50">
                <Save size={15} /> {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                La guía está cerrada. Reábrela para editar el contenido. La recepción sí puede corregirse.
              </p>
            )}
          </div>
        </section>

        {/* Recepción del cliente */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <PackageCheck size={15} /> Recepción del cliente
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Bandejas recibidas" required>
                <input type="number" min="0" step="0.01" value={rTrays}
                  onChange={(e) => setRTrays(e.target.value)}
                  className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </FormField>
              <FormField label="Peso recibido (kg)" required>
                <input type="number" min="0" step="0.001" value={rWeight}
                  onChange={(e) => setRWeight(e.target.value)}
                  className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </FormField>
            </div>
            <FormField label="Notas de recepción">
              <textarea maxLength={500} rows={2} value={rNotes}
                onChange={(e) => setRNotes(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
            <button onClick={() => receiptMutation.mutate()}
              disabled={receiptMutation.isPending || !rTrays || !rWeight}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {receiptMutation.isPending ? 'Guardando…' : receipt ? 'Actualizar recepción' : 'Registrar recepción'}
            </button>
          </div>
        </section>
      </div>

      {/* Comparación despachado vs recibido */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Despachado vs recibido</h2>
        {!comparison.has_receipt ? (
          <p className="text-sm text-muted-foreground">Aún no hay recepción registrada para comparar.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Despachado</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{num(comparison.dispatched_trays, 2)} bandejas</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{num(comparison.dispatched_weight_kg, 3)} kg</p>
            </div>
            <div className="rounded-xl bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Recibido</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{num(comparison.received_trays, 2)} bandejas</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{num(comparison.received_weight_kg, 3)} kg</p>
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{
                backgroundColor: merma ? 'hsl(0 72% 96%)' : 'hsl(152 60% 96%)',
                border: `1px solid ${merma ? 'hsl(0 72% 85%)' : 'hsl(152 50% 82%)'}`,
              }}
            >
              <p className="flex items-center gap-1 text-xs" style={{ color: merma ? 'hsl(0 72% 42%)' : 'hsl(152 55% 32%)' }}>
                {merma && <TrendingDown size={12} />}
                {merma ? 'Merma en tránsito' : 'Diferencia'}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: merma ? 'hsl(0 72% 42%)' : 'hsl(152 55% 32%)' }}>
                {num(comparison.trays_diff, 2)} bandejas
              </p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: merma ? 'hsl(0 72% 42%)' : 'hsl(152 55% 32%)' }}>
                {num(comparison.weight_diff_kg, 3)} kg ({num(comparison.weight_shrinkage_pct, 2)}%)
              </p>
            </div>
          </div>
        )}
      </section>
    </PageTransition>
  );
}
