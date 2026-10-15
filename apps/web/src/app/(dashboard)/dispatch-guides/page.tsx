'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { useState } from 'react';
import Link from 'next/link';
import { PageTransition } from '@/components/ui/animations';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { Truck, Plus, Scale, PencilRuler, Lock, LockOpen, PackageCheck } from 'lucide-react';

type Scope = 'block' | 'field';

interface DispatchGuide {
  id: string;
  scope: Scope;
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
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build a query string for the Edge Function path. */
function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export default function DispatchGuidesPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { enabled, loading: flagLoading } = useFeatureFlag('dispatch_guides');

  // Filters
  const [fScope, setFScope] = useState('');
  const [fField, setFField] = useState('');
  const [fBlock, setFBlock] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fDay, setFDay] = useState('');
  const [page, setPage] = useState(1);

  // Create flow
  const [createOpen, setCreateOpen] = useState(false);
  const [cScope, setCScope] = useState<Scope>('block');
  const [cField, setCField] = useState('');
  const [cBlock, setCBlock] = useState('');
  const [cDay, setCDay] = useState(today());
  const [cGuideNumber, setCGuideNumber] = useState('');
  const [cCarrier, setCCarrier] = useState('');
  const [cTrays, setCTrays] = useState('');
  const [cWeight, setCWeight] = useState('');
  const [suggestion, setSuggestion] = useState<{ weight_source: string; weight_precise: boolean; record_count: number } | null>(null);

  const { data: fields } = useQuery({
    queryKey: ['fields-list'],
    queryFn: async () => {
      const { data } = await supabase.from('fields').select('id, name').eq('status', 'active').order('name');
      return data || [];
    },
    enabled,
  });

  const { data: blocks } = useQuery({
    queryKey: ['blocks-list-dispatch', cField || fField],
    queryFn: async () => {
      const fieldId = cField || fField;
      let q = supabase.from('blocks').select('id, name, field_id').eq('status', 'active').order('name');
      if (fieldId) q = q.eq('field_id', fieldId);
      const { data } = await q;
      return data || [];
    },
    enabled,
  });

  const { data: guides, isLoading } = useQuery({
    queryKey: ['dispatch-guides', fScope, fField, fBlock, fStatus, fDay, page],
    queryFn: async () => {
      const path = `dispatch-guides${qs({
        scope: fScope, field_id: fField, block_id: fBlock, status: fStatus, work_day: fDay,
        page: String(page), limit: '20',
      })}`;
      const { data, error } = await supabase.functions.invoke(path, { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error al cargar guías');
      return { rows: (data?.data ?? []) as DispatchGuide[], total: data?.meta?.total ?? 0 };
    },
    enabled,
  });

  const fieldName = (id: string) => (fields || []).find((f: any) => f.id === id)?.name ?? '—';
  const blockName = (id: string | null) => (id ? (blocks || []).find((b: any) => b.id === id)?.name ?? '—' : null);

  // Fetch the auto-suggestion to prefill editable totals.
  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (cScope === 'block' && !cBlock) throw new Error('Selecciona un paño');
      if (cScope === 'field' && !cField) throw new Error('Selecciona un campo');
      const path = `dispatch-guides/suggestion${qs({
        scope: cScope,
        field_id: cScope === 'field' ? cField : cField || undefined,
        block_id: cScope === 'block' ? cBlock : undefined,
        work_day: cDay,
      })}`;
      const { data, error } = await supabase.functions.invoke(path, { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Sin cosecha para el grupo');
      return data.data as any;
    },
    onSuccess: (s) => {
      setCTrays(String(s.total_trays));
      setCWeight(String(s.total_weight_kg));
      setSuggestion({ weight_source: s.weight_source, weight_precise: s.weight_precise, record_count: s.record_count });
    },
    onError: (err: any) => {
      setSuggestion(null);
      toast(err.message || 'No se pudo calcular el sugerido', 'error');
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!cGuideNumber.trim()) throw new Error('Número de guía requerido');
      const { data, error } = await supabase.functions.invoke('dispatch-guides', {
        method: 'POST',
        body: {
          scope: cScope,
          field_id: cScope === 'field' ? cField : undefined,
          block_id: cScope === 'block' ? cBlock : null,
          work_day: cDay,
          guide_number: cGuideNumber.trim(),
          carrier: cCarrier.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error al crear la guía');
      return data.data as DispatchGuide;
    },
    onSuccess: () => {
      setCreateOpen(false);
      resetCreate();
      queryClient.invalidateQueries({ queryKey: ['dispatch-guides'] });
      toast('Guía creada', 'success');
    },
    onError: (err: any) => toast(err.message || 'Error al crear la guía', 'error'),
  });

  function resetCreate() {
    setCScope('block'); setCField(''); setCBlock(''); setCDay(today());
    setCGuideNumber(''); setCCarrier(''); setCTrays(''); setCWeight(''); setSuggestion(null);
  }

  if (flagLoading) return null;

  if (!enabled) {
    return (
      <PageTransition>
        <PageHeader title="Guías de despacho" description="Logística de salida del campo" />
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Truck className="mx-auto mb-3 text-muted-foreground" size={32} />
          <p className="text-sm font-medium text-foreground">Función no habilitada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Las guías de despacho no están activas para tu organización. Contacta al administrador de la plataforma.
          </p>
        </div>
      </PageTransition>
    );
  }

  const rows = guides?.rows ?? [];
  const total = guides?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / 20), 1);

  return (
    <PageTransition>
      <PageHeader
        title="Guías de despacho"
        description="Fruta que sale del campo hacia el cliente. Agrega la cosecha y compara contra lo recibido."
        action={
          <button
            onClick={() => { resetCreate(); setCreateOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} /> Nueva guía
          </button>
        }
      />

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nivel</label>
            <select value={fScope} onChange={(e) => { setFScope(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Todos</option>
              <option value="block">Por paño</option>
              <option value="field">Cierre de campo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Campo</label>
            <select value={fField} onChange={(e) => { setFField(e.target.value); setFBlock(''); setPage(1); }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Todos</option>
              {(fields || []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Paño</label>
            <select value={fBlock} onChange={(e) => { setFBlock(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Todos</option>
              {(blocks || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Jornada</label>
            <input type="date" value={fDay} onChange={(e) => { setFDay(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Estado</label>
            <select value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Todos</option>
              <option value="open">Abierta</option>
              <option value="closed">Cerrada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Responsive card grid (no wide horizontal-scroll table) */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No hay guías para los filtros seleccionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((g) => (
            <Link
              key={g.id}
              href={`/dispatch-guides/${g.id}`}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">Guía {g.guide_number}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.scope === 'field' ? 'Cierre de campo' : 'Paño'} · {fieldName(g.field_id)}
                    {g.block_id ? ` / ${blockName(g.block_id)}` : ''}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                  g.status === 'closed'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                }`}>
                  {g.status === 'closed' ? <Lock size={11} /> : <LockOpen size={11} />}
                  {g.status === 'closed' ? 'Cerrada' : 'Abierta'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Bandejas</p>
                  <p className="text-base font-bold tabular-nums text-foreground">{Number(g.total_trays).toLocaleString('es-CL')}</p>
                </div>
                <div className="rounded-xl bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Peso (kg)</p>
                  <p className="text-base font-bold tabular-nums text-foreground">{Number(g.total_weight_kg).toLocaleString('es-CL', { maximumFractionDigits: 3 })}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">{g.work_day}</span>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                  g.weight_precise ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {g.weight_precise ? <Scale size={11} /> : <PencilRuler size={11} />}
                  {g.weight_precise ? 'Peso preciso' : 'Aproximado'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40">Anterior</button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40">Siguiente</button>
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva guía de despacho" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nivel" required>
              <select value={cScope} onChange={(e) => { setCScope(e.target.value as Scope); setCBlock(''); setSuggestion(null); setCTrays(''); setCWeight(''); }}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="block">Por paño/cuartel</option>
                <option value="field">Cierre diario del campo</option>
              </select>
            </FormField>
            <FormField label="Jornada" required>
              <input type="date" value={cDay} onChange={(e) => { setCDay(e.target.value); setSuggestion(null); }}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
            <FormField label="Campo" required>
              <select value={cField} onChange={(e) => { setCField(e.target.value); setCBlock(''); setSuggestion(null); }}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Selecciona…</option>
                {(fields || []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </FormField>
            {cScope === 'block' && (
              <FormField label="Paño" required>
                <select value={cBlock} onChange={(e) => { setCBlock(e.target.value); setSuggestion(null); }}
                  className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Selecciona…</option>
                  {(blocks || []).filter((b: any) => !cField || b.field_id === cField).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </FormField>
            )}
          </div>

          <button
            onClick={() => suggestMutation.mutate()}
            disabled={suggestMutation.isPending || !cField || (cScope === 'block' && !cBlock)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            <PackageCheck size={16} /> {suggestMutation.isPending ? 'Calculando…' : 'Calcular desde cosecha'}
          </button>

          {suggestion && (
            <div className="rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              Sugerido desde {suggestion.record_count} registro(s) de picking · peso{' '}
              {suggestion.weight_precise ? 'preciso (balanza)' : `aproximado (${suggestion.weight_source})`}. Puedes ajustarlo antes de crear.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Bandejas despachadas">
              <input type="number" min="0" step="0.01" value={cTrays} onChange={(e) => setCTrays(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
            <FormField label="Peso despachado (kg)">
              <input type="number" min="0" step="0.001" value={cWeight} onChange={(e) => setCWeight(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
            <FormField label="Número de guía" required>
              <input type="text" maxLength={60} value={cGuideNumber} onChange={(e) => setCGuideNumber(e.target.value)}
                placeholder="N° talonario físico"
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
            <FormField label="Transportista / furgón">
              <input type="text" maxLength={150} value={cCarrier} onChange={(e) => setCCarrier(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </FormField>
          </div>

          <p className="text-xs text-muted-foreground">
            Los totales se calculan automáticamente desde la cosecha. Puedes ajustarlos a mano; si editas el peso quedará marcado como aproximado. El contenido se edita en el detalle hasta cerrar la guía.
          </p>

          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !cGuideNumber.trim() || !cField || (cScope === 'block' && !cBlock)}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {createMutation.isPending ? 'Creando…' : 'Crear guía'}
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}
