'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { generateSettlementPDF } from '@/components/settlement/SettlementPDF';
import { PageTransition } from '@/components/ui/animations';

export default function SettlementsPage() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, workers!fk_settlements_worker_org(full_name, national_id), crews!settlements_crew_id_fkey(name, crew_lead:workers!crews_crew_lead_id_fkey(full_name))')
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleExportPDF(settlement: any) {
    setExporting(settlement.id);
    try {
      // Fetch picking records for this settlement
      const { data: records } = await supabase
        .from('picking_records')
        .select('work_day, quantity, rate_amount_snapshot, block_id')
        .eq('worker_id', settlement.worker_id)
        .gte('work_day', settlement.period_start)
        .lte('work_day', settlement.period_end)
        .is('original_record_id', null)
        .order('work_day');

      // Fetch block names
      const blockIds = [...new Set((records || []).map(r => r.block_id))];
      const { data: blocks } = await supabase
        .from('blocks')
        .select('id, name, products(name)')
        .in('id', blockIds.length ? blockIds : ['x']);

      const blockMap = Object.fromEntries((blocks || []).map(b => [b.id, { name: b.name, product: (b as any).products?.name || '' }]));

      // Fetch payments for this settlement
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, paid_at, notes')
        .eq('settlement_id', settlement.id)
        .order('paid_at');

      const pdfData = {
        workerName: settlement.workers?.full_name || '—',
        workerRut: settlement.workers?.national_id || null,
        periodStart: settlement.period_start,
        periodEnd: settlement.period_end,
        totalAmount: Number(settlement.total_amount),
        status: settlement.status,
        generatedAt: settlement.generated_at,
        records: (records || []).map(r => ({
          work_day: r.work_day,
          block_name: blockMap[r.block_id]?.name || '—',
          product_name: blockMap[r.block_id]?.product || '—',
          quantity: Number(r.quantity),
          rate: Number(r.rate_amount_snapshot),
          subtotal: Number(r.quantity) * Number(r.rate_amount_snapshot),
        })),
        payments: (payments || []).map(p => ({
          date: new Date(p.paid_at).toLocaleDateString('es-CL'),
          amount: Number(p.amount),
          notes: p.notes || '',
        })),
      };

      generateSettlementPDF(pdfData);
      toast('PDF descargado', 'success');
    } catch (err) {
      console.error(err);
      toast('Error al generar PDF', 'error');
    }
    setExporting(null);
  }

  const columns = [
    { key: 'payee', label: 'Beneficiario', sortable: false, render: (row: any) => (
      row.payee_type === 'crew'
        ? (
          <span className="font-medium text-foreground">
            {row.crews?.name || 'Cuadrilla'}
            <span className="ml-1.5 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              Cuadrilla · {row.crews?.crew_lead?.full_name || '—'}
            </span>
          </span>
        )
        : <span className="font-medium text-foreground">{row.workers?.full_name || '—'}</span>
    )},
    { key: 'period_start', label: 'Desde', render: (row: any) => (
      <span className="tabular-nums text-sm">{row.period_start}</span>
    )},
    { key: 'period_end', label: 'Hasta', render: (row: any) => (
      <span className="tabular-nums text-sm">{row.period_end}</span>
    )},
    { key: 'total_amount', label: 'Monto', render: (row: any) => (
      <span className="font-semibold text-foreground tabular-nums">${Number(row.total_amount).toLocaleString()}</span>
    )},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Liquidaciones"
        description="Cálculo y control de pagos por período"
        action={
          <ActionButton onClick={() => setShowGenerate(true)}>
            Generar Liquidaciones
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay liquidaciones generadas"
        searchPlaceholder="Buscar por trabajador..."
        searchKeys={['workers']}
        actions={(row: any) => (
          row.payee_type === 'crew' ? (
            <span className="text-xs text-muted-foreground">Liquidación de cuadrilla</span>
          ) : (
            <button
              onClick={() => handleExportPDF(row)}
              disabled={exporting === row.id}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {exporting === row.id ? '...' : '↓ PDF'}
            </button>
          )
        )}
      />

      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generar Liquidaciones">
        <GenerateForm onSuccess={() => { setShowGenerate(false); queryClient.invalidateQueries({ queryKey: ['settlements'] }); }} />
      </Modal>
    </PageTransition>
  );
}

function GenerateForm({ onSuccess }: { onSuccess: () => void }) {
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

    // Delegamos en la Edge Function /settlements/generate, que clasifica la
    // producción por el modo capataz efectivo del campo (Opción A) y setea
    // payee_type (worker/crew). Evita duplicar/desincronizar esa lógica.
    const { data, error } = await supabase.functions.invoke('settlements/generate', {
      method: 'POST',
      body: { period_start: periodStart, period_end: periodEnd },
    });

    setLoading(false);

    // La Edge Function responde { success, data: [...] }
    const generated = Array.isArray(data?.data) ? data.data.length : 0;
    if (!error && generated > 0) {
      toast(`${generated} liquidación(es) generada(s)`, 'success');
      setTimeout(onSuccess, 800);
    } else if (!error) {
      setResult('No se encontró producción para el período seleccionado');
    } else {
      setResult('Error al generar las liquidaciones');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Fecha inicio *</label>
        <input name="period_start" type="date" required className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Fecha fin *</label>
        <input name="period_end" type="date" required className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
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
