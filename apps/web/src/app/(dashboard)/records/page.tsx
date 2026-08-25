'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
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
  const [dateFrom, setDateFrom] = useState(localDate(-7));
  const [dateTo, setDateTo] = useState(localDate(0));
  const [filterWorker, setFilterWorker] = useState('');
  const [filterBlock, setFilterBlock] = useState('');

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
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
            <p className="text-xs text-emerald-600 font-medium">Registros</p>
            <p className="text-xl font-bold text-emerald-800 tabular-nums">{totalRecords}</p>
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
      />
    </PageTransition>
  );
}
