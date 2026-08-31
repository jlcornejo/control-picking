'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { PageTransition } from '@/components/ui/animations';

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecordsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState(localDate(-7));
  const [dateTo, setDateTo] = useState(localDate(0));
  const [filterWorker, setFilterWorker] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [correctRow, setCorrectRow] = useState<any | null>(null);
  const [correctQty, setCorrectQty] = useState('');

  const correctMutation = useMutation({
    mutationFn: async () => {
      if (!correctRow) throw new Error('Sin registro');
      const qty = parseFloat(correctQty);
      if (!qty || qty <= 0) throw new Error('La cantidad debe ser mayor a 0');
      if (correctRow.work_day !== localDate(0)) throw new Error('Solo se puede corregir un registro del día actual');

      // Soft-update (regla 11): snapshot de auditoría con los valores VIEJOS +
      // edición in-place del original. organization_id lo completa el trigger.
      const { data: auth } = await supabase.auth.getUser();
      const { data: me } = await supabase.from('workers').select('id').eq('auth_user_id', auth.user?.id ?? '').maybeSingle();
      const { error: snapErr } = await supabase.from('picking_records').insert({
        worker_id: correctRow.worker_id,
        block_id: correctRow.block_id,
        quantity: correctRow.quantity,
        rate_amount_snapshot: correctRow.rate_amount_snapshot,
        work_day: correctRow.work_day,
        recorded_by: me?.id ?? correctRow.recorded_by,
        original_record_id: correctRow.id,
      });
      if (snapErr) throw snapErr;

      const { error: updErr } = await supabase.from('picking_records')
        .update({ quantity: qty })
        .eq('id', correctRow.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      setCorrectRow(null); setCorrectQty('');
      queryClient.invalidateQueries({ queryKey: ['picking-records'] });
      toast('Registro corregido', 'success');
    },
    onError: (err: any) => toast(err.message || 'Error al corregir', 'error'),
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ['picking-records', dateFrom, dateTo, filterWorker, filterBlock],
    queryFn: async () => {
      let query = supabase
        .from('picking_records')
        .select('id, worker_id, block_id, quantity, rate_amount_snapshot, recorded_at, work_day, original_record_id')
        .gte('work_day', dateFrom)
        .lte('work_day', dateTo)
        .order('recorded_at', { ascending: false });

      if (filterWorker) query = query.eq('worker_id', filterWorker);
      if (filterBlock) query = query.eq('block_id', filterBlock);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch worker and block names
      const workerIds = [...new Set((data || []).map(r => r.worker_id))];
      const blockIds = [...new Set((data || []).map(r => r.block_id))];

      const [{ data: workers }, { data: blocks }] = await Promise.all([
        supabase.from('workers').select('id, full_name').in('id', workerIds.length ? workerIds : ['x']),
        supabase.from('blocks').select('id, name').in('id', blockIds.length ? blockIds : ['x']),
      ]);

      const workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
      const blockMap = Object.fromEntries((blocks || []).map(b => [b.id, b.name]));

      return (data || []).map(r => ({
        ...r,
        worker_name: workerMap[r.worker_id] || '—',
        block_name: blockMap[r.block_id] || '—',
        total: Number(r.quantity) * Number(r.rate_amount_snapshot),
        is_correction: !!r.original_record_id,
      }));
    },
  });

  // Workers & blocks for filters
  const { data: allWorkers } = useQuery({
    queryKey: ['workers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('id, full_name').eq('status', 'active').order('full_name');
      return data || [];
    },
  });

  const { data: allBlocks } = useQuery({
    queryKey: ['blocks-list'],
    queryFn: async () => {
      const { data } = await supabase.from('blocks').select('id, name, fields(name)').eq('status', 'active').order('name');
      return data || [];
    },
  });

  // Summary stats
  const totalUnits = (records || []).reduce((s, r) => s + Number(r.quantity), 0);
  const totalAmount = (records || []).reduce((s, r) => s + r.total, 0);
  const totalRecords = (records || []).length;

  const columns = [
    { key: 'work_day', label: 'Fecha', render: (row: any) => (
      <span className="tabular-nums text-sm">{row.work_day}</span>
    )},
    { key: 'worker_name', label: 'Trabajador', render: (row: any) => (
      <span className="font-medium text-foreground">{row.worker_name}</span>
    )},
    { key: 'block_name', label: 'Paño', render: (row: any) => (
      <span className="text-sm">{row.block_name}</span>
    )},
    { key: 'quantity', label: 'Cantidad', render: (row: any) => (
      <span className="font-semibold tabular-nums">{row.quantity}</span>
    )},
    { key: 'rate_amount_snapshot', label: 'Tarifa', render: (row: any) => (
      <span className="tabular-nums text-muted-foreground">${Number(row.rate_amount_snapshot).toLocaleString()}</span>
    )},
    { key: 'total', label: 'Total', render: (row: any) => (
      <span className="font-semibold tabular-nums text-foreground">${row.total.toLocaleString()}</span>
    )},
    { key: 'recorded_at', label: 'Hora', render: (row: any) => (
      <span className="tabular-nums text-xs text-muted-foreground">
        {new Date(row.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
      </span>
    )},
    { key: 'is_correction', label: 'Tipo', sortable: false, render: (row: any) => (
      row.is_correction
        ? <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20">Corrección</span>
        : <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Original</span>
    )},
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Registros de Picking"
        description="Historial completo de producción"
      />

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 rounded-2xl border border-border bg-card p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Trabajador</label>
            <select
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            >
              <option value="">Todos</option>
              {(allWorkers || []).map((w: any) => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Paño</label>
            <select
              value={filterBlock}
              onChange={(e) => setFilterBlock(e.target.value)}
              className="block w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            >
              <option value="">Todos</option>
              {(allBlocks || []).map((b: any) => (
                <option key={b.id} value={b.id}>{b.name} — {(b as any).fields?.name}</option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Summary */}
      {!isLoading && records && records.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="mb-6 grid grid-cols-3 gap-3"
        >
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
            <p className="text-xs text-primary font-medium">Registros</p>
            <p className="text-xl font-bold text-primary tabular-nums">{totalRecords}</p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <p className="text-xs text-blue-600 font-medium">Total cajas</p>
            <p className="text-xl font-bold text-blue-800 tabular-nums">{totalUnits.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3">
            <p className="text-xs text-violet-600 font-medium">Total $</p>
            <p className="text-xl font-bold text-violet-800 tabular-nums">${totalAmount.toLocaleString()}</p>
          </div>
        </motion.div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={records || []}
        loading={isLoading}
        emptyMessage="No hay registros en el período seleccionado"
        searchable={true}
        searchPlaceholder="Buscar por trabajador, paño..."
        searchKeys={['worker_name', 'block_name', 'work_day']}
        pageSize={25}
        actions={(row: any) => (
          !row.is_correction && row.work_day === localDate(0) ? (
            <button
              onClick={() => { setCorrectQty(String(Number(row.quantity))); setCorrectRow(row); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              Corregir
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        )}
      />

      <Modal open={!!correctRow} onClose={() => { setCorrectRow(null); setCorrectQty(''); }} title="Corregir registro">
        {correctRow && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{correctRow.worker_name} · {correctRow.block_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cantidad actual: {Number(correctRow.quantity)}</p>
            </div>
            <FormField label="Nueva cantidad" required>
              <input
                type="number" step="1" min="1"
                value={correctQty}
                onChange={(e) => setCorrectQty(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </FormField>
            <p className="text-xs text-muted-foreground">
              Se conserva el registro original como auditoría. Solo se puede corregir un registro del día actual.
            </p>
            <button
              onClick={() => correctMutation.mutate()}
              disabled={correctMutation.isPending || !correctQty || parseFloat(correctQty) <= 0}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {correctMutation.isPending ? 'Guardando…' : 'Guardar corrección'}
            </button>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
}
