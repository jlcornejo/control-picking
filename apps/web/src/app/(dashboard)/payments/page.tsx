'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';

export default function PaymentsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
        <CreatePaymentForm onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['payments'] }); queryClient.invalidateQueries({ queryKey: ['pending-settlements'] }); queryClient.invalidateQueries({ queryKey: ['settlements'] }); toast('Pago registrado', 'success'); }} />
      </Modal>
    </PageTransition>
  );
}

function CreatePaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
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

    const { error: dbError } = await supabase.from('payments').insert({
      settlement_id: selectedId,
      ...payeeColumns,
      amount,
      notes: notes || null,
    });

    if (dbError) { setError(dbError.message); setLoading(false); return; }

    // Update settlement status
    const newPaid = selected.paid + amount;
    const newStatus = newPaid >= Number((selected as any).total_amount) ? 'paid' : 'partial';
    await supabase.from('settlements').update({ status: newStatus }).eq('id', selectedId);

    setLoading(false);
    onSuccess();
  }

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
