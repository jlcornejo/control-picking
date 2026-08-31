'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { useState } from 'react';
import { Truck, Users } from 'lucide-react';

/**
 * Vista del Encargado (crew_lead) — Nivel 2.
 * Muestra la liquidación de su cuadrilla (lo que le paga el cliente) y le
 * permite generar y pagar las liquidaciones de sus trabajadores.
 * RLS restringe todos los datos a su propia cuadrilla.
 */
export default function CrewLeadPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showGenerate, setShowGenerate] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);

  // Liquidación de la cuadrilla (nivel 1: cliente -> encargado)
  const { data: crewSettlements } = useQuery({
    queryKey: ['my-crew-settlement'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, crews(name)')
        .eq('payee_type', 'crew')
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Liquidaciones de los trabajadores de la cuadrilla (nivel 2)
  const { data: memberSettlements, isLoading } = useQuery({
    queryKey: ['my-crew-member-settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, workers(full_name)')
        .eq('payee_type', 'worker')
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const columns = [
    { key: 'workers', label: 'Trabajador', render: (row: any) => (
      <span className="font-medium text-foreground">{row.workers?.full_name || '—'}</span>
    )},
    { key: 'period_start', label: 'Desde', render: (row: any) => <span className="tabular-nums text-sm">{row.period_start}</span> },
    { key: 'period_end', label: 'Hasta', render: (row: any) => <span className="tabular-nums text-sm">{row.period_end}</span> },
    { key: 'total_amount', label: 'Monto', render: (row: any) => (
      <span className="font-semibold text-foreground tabular-nums">${Number(row.total_amount).toLocaleString()}</span>
    )},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Mi Cuadrilla"
        description="Producción, liquidaciones y pagos de tu equipo"
        action={<ActionButton onClick={() => setShowGenerate(true)}>Generar liquidaciones del equipo</ActionButton>}
      />

      {/* Nivel 1: lo que el cliente le paga al encargado */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {(crewSettlements || []).length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Truck size={16} /> <span className="text-sm">Liquidación de cuadrilla</span>
            </div>
            <p className="text-sm text-muted-foreground">Aún no hay liquidación de cuadrilla generada por el cliente.</p>
          </div>
        ) : (
          (crewSettlements || []).map((s: any) => (
            <div key={s.id} className="rounded-2xl border border-border bg-white/60 p-5">
              <div className="mb-1 flex items-center gap-2 text-primary">
                <Truck size={16} /> <span className="text-sm font-medium">{s.crews?.name || 'Mi cuadrilla'}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">${Number(s.total_amount).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{s.period_start} → {s.period_end}</p>
              <div className="mt-2"><StatusBadge status={s.status} /></div>
            </div>
          ))
        )}
      </div>

      {/* Nivel 2: liquidaciones de los trabajadores del encargado */}
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <Users size={16} /> Liquidaciones de tus trabajadores
      </div>
      <DataTable
        columns={columns}
        data={memberSettlements || []}
        loading={isLoading}
        emptyMessage="Aún no has generado liquidaciones para tu equipo"
        searchPlaceholder="Buscar por trabajador..."
        searchKeys={['workers']}
        actions={(row: any) => (
          row.status !== 'paid' ? (
            <button
              onClick={() => setPayTarget(row)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              Registrar pago
            </button>
          ) : <span className="text-xs text-muted-foreground">Pagada</span>
        )}
      />

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generar liquidaciones del equipo">
        <CrewGenerateForm onSuccess={() => {
          setShowGenerate(false);
          queryClient.invalidateQueries({ queryKey: ['my-crew-member-settlements'] });
        }} />
      </Modal>

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title={`Pagar — ${payTarget?.workers?.full_name || ''}`}>
        {payTarget && (
          <PayForm settlement={payTarget} onSuccess={() => {
            setPayTarget(null);
            queryClient.invalidateQueries({ queryKey: ['my-crew-member-settlements'] });
          }} />
        )}
      </Modal>
    </PageTransition>
  );
}

function CrewGenerateForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const supabase = createClient();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const form = new FormData(e.currentTarget);
    const periodStart = form.get('period_start') as string;
    const periodEnd = form.get('period_end') as string;

    // Edge Function /settlements/crew-generate (nivel 2, acotado a la cuadrilla por RLS)
    const { data, error } = await supabase.functions.invoke('settlements/crew-generate', {
      method: 'POST',
      body: { period_start: periodStart, period_end: periodEnd },
    });

    setLoading(false);
    const generated = Array.isArray(data?.data) ? data.data.length : 0;
    if (!error && generated > 0) {
      toast(`${generated} liquidación(es) generada(s)`, 'success');
      setTimeout(onSuccess, 800);
    } else if (!error) {
      setResult('No se encontró producción de tu cuadrilla para el período seleccionado');
    } else {
      setResult('Error al generar las liquidaciones');
    }
  }

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Fecha inicio *</label>
        <input name="period_start" type="date" required className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Fecha fin *</label>
        <input name="period_end" type="date" required className={inputClass} />
      </div>
      {result && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
          <p className="text-sm text-amber-700">{result}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Generando...' : 'Generar'}
      </button>
    </form>
  );
}

function PayForm({ settlement, onSuccess }: { settlement: any; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const amount = parseFloat(form.get('amount') as string);
    const notes = (form.get('notes') as string) || '';

    if (!amount || amount <= 0) { setError('El monto debe ser mayor a 0'); return; }

    setLoading(true);
    // Edge Function /payments (crew_lead puede pagar a su cuadrilla; RLS lo valida)
    const { data, error: fnErr } = await supabase.functions.invoke('payments', {
      method: 'POST',
      body: {
        settlement_id: settlement.id,
        worker_id: settlement.worker_id,
        amount,
        notes,
      },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'Error al registrar el pago');
      return;
    }
    toast('Pago registrado', 'success');
    setTimeout(onSuccess, 600);
  }

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">Monto de la liquidación</p>
        <p className="text-lg font-bold text-foreground tabular-nums">${Number(settlement.total_amount).toLocaleString()}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Monto a pagar *</label>
        <input name="amount" type="number" step="1" min="1" required className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Notas</label>
        <input name="notes" type="text" placeholder="Opcional" className={inputClass} />
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Registrando...' : 'Registrar pago'}
      </button>
    </form>
  );
}
