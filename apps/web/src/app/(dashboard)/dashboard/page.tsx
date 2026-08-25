'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Package, DollarSign, Users, Grid3X3 } from 'lucide-react';
import { AnimatedCounter, FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/animations';
import { KpiCardSkeleton, ChartSkeleton, RankingSkeleton } from '@/components/ui/skeletons';

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardHome() {
  const supabase = createClient();
  const today = localDate(0);

  // Drilldown state
  const [drilldown, setDrilldown] = useState<{ type: string; title: string; data?: any } | null>(null);

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const { data: records } = await supabase
        .from('picking_records')
        .select('quantity, rate_amount_snapshot, worker_id, block_id')
        .eq('work_day', today)
        .is('original_record_id', null);
      const totalUnits = (records || []).reduce((s, r) => s + Number(r.quantity), 0);
      const totalAmount = (records || []).reduce((s, r) => s + Number(r.quantity) * Number(r.rate_amount_snapshot), 0);
      const activeWorkers = new Set((records || []).map(r => r.worker_id)).size;
      const activeBlocks = new Set((records || []).map(r => r.block_id)).size;
      return { totalUnits, totalAmount: Math.round(totalAmount), activeWorkers, activeBlocks };
    },
    refetchInterval: 30000,
  });

  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['dashboard-ranking'],
    queryFn: async () => {
      const { data } = await supabase
        .from('picking_records')
        .select('worker_id, quantity')
        .eq('work_day', today)
        .is('original_record_id', null);
      const byWorker: Record<string, { id: string; name: string; units: number }> = {};
      for (const r of data || []) {
        if (!byWorker[r.worker_id]) byWorker[r.worker_id] = { id: r.worker_id, name: '', units: 0 };
        byWorker[r.worker_id]!.units += Number(r.quantity);
      }
      const workerIds = Object.keys(byWorker);
      if (workerIds.length > 0) {
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        for (const w of workers || []) {
          if (byWorker[w.id]) byWorker[w.id]!.name = w.full_name;
        }
      }
      return Object.values(byWorker).sort((a, b) => b.units - a.units).slice(0, 10);
    },
    refetchInterval: 30000,
  });

  const { data: weeklyTrend, isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard-weekly-trend'],
    queryFn: async () => {
      const days: { date: string; fullDate: string; units: number; amount: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dateStr = localDate(-i);
        const { data: records } = await supabase
          .from('picking_records')
          .select('quantity, rate_amount_snapshot')
          .eq('work_day', dateStr)
          .is('original_record_id', null);
        const units = (records || []).reduce((s, r) => s + Number(r.quantity), 0);
        const amount = (records || []).reduce((s, r) => s + Number(r.quantity) * Number(r.rate_amount_snapshot), 0);
        const d = new Date(); d.setDate(d.getDate() - i);
        const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' });
        days.push({ date: dayName, fullDate: dateStr, units, amount: Math.round(amount) });
      }
      return days;
    },
    refetchInterval: 60000,
  });

  const { data: blockProduction, isLoading: blocksLoading } = useQuery({
    queryKey: ['dashboard-block-production'],
    queryFn: async () => {
      const { data } = await supabase
        .from('picking_records')
        .select('quantity, block_id')
        .eq('work_day', today)
        .is('original_record_id', null);
      const byBlock: Record<string, { id: string; name: string; units: number }> = {};
      for (const r of data || []) {
        if (!byBlock[r.block_id]) byBlock[r.block_id] = { id: r.block_id, name: '', units: 0 };
        byBlock[r.block_id]!.units += Number(r.quantity);
      }
      const blockIds = Object.keys(byBlock);
      if (blockIds.length > 0) {
        const { data: blocks } = await supabase.from('blocks').select('id, name').in('id', blockIds);
        for (const b of blocks || []) {
          if (byBlock[b.id]) byBlock[b.id]!.name = b.name;
        }
      }
      return Object.values(byBlock).sort((a, b) => b.units - a.units).slice(0, 8);
    },
    refetchInterval: 30000,
  });

  // Drilldown data fetcher
  const { data: drilldownRecords, isLoading: drillLoading } = useQuery({
    queryKey: ['drilldown', drilldown?.type, drilldown?.data],
    enabled: !!drilldown,
    queryFn: async () => {
      if (!drilldown) return [];
      let query = supabase.from('picking_records').select('id, worker_id, block_id, quantity, rate_amount_snapshot, recorded_at, work_day').is('original_record_id', null);

      if (drilldown.type === 'worker') {
        query = query.eq('worker_id', drilldown.data.workerId).eq('work_day', today);
      } else if (drilldown.type === 'block') {
        query = query.eq('block_id', drilldown.data.blockId).eq('work_day', today);
      } else if (drilldown.type === 'day') {
        query = query.eq('work_day', drilldown.data.date);
      } else if (drilldown.type === 'production') {
        query = query.eq('work_day', today);
      } else if (drilldown.type === 'workers-active') {
        query = query.eq('work_day', today);
      } else if (drilldown.type === 'blocks-active') {
        query = query.eq('work_day', today);
      }

      const { data } = await query.order('recorded_at', { ascending: false });

      // Enrich with names
      const records = data || [];
      const workerIds = [...new Set(records.map(r => r.worker_id))];
      const blockIds = [...new Set(records.map(r => r.block_id))];

      const [{ data: workers }, { data: blocks }] = await Promise.all([
        supabase.from('workers').select('id, full_name').in('id', workerIds.length ? workerIds : ['x']),
        supabase.from('blocks').select('id, name').in('id', blockIds.length ? blockIds : ['x']),
      ]);

      const workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
      const blockMap = Object.fromEntries((blocks || []).map(b => [b.id, b.name]));

      return records.map(r => ({
        ...r,
        worker_name: workerMap[r.worker_id] || '—',
        block_name: blockMap[r.block_id] || '—',
        total: Number(r.quantity) * Number(r.rate_amount_snapshot),
      }));
    },
  });

  const maxUnits = Math.max(...(ranking || []).map(w => w.units), 1);

  function openWorkerDrill(worker: { id: string; name: string; units: number }) {
    setDrilldown({ type: 'worker', title: `Detalle — ${worker.name}`, data: { workerId: worker.id } });
  }

  function openBlockDrill(block: { id: string; name: string }) {
    setDrilldown({ type: 'block', title: `Detalle — ${block.name}`, data: { blockId: block.id } });
  }

  function openDayDrill(day: { fullDate: string; date: string }) {
    setDrilldown({ type: 'day', title: `Producción — ${day.fullDate}`, data: { date: day.fullDate } });
  }

  function openKpiDrill(type: string, title: string) {
    setDrilldown({ type, title, data: {} });
  }

  return (
    <div>
      {/* Header */}
      <FadeIn direction="none" duration={0.3}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Producción en tiempo real — {today}
            <span className="inline-flex items-center ml-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="ml-1.5 text-xs text-emerald-600 font-medium">En vivo</span>
            </span>
          </p>
        </div>
      </FadeIn>

      {/* KPI Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <KpiCardSkeleton key={i} />)}
        </div>
      ) : (
        <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StaggerItem>
            <KpiCard
              title="Producción"
              value={metrics?.totalUnits || 0}
              unit="cajas hoy"
              gradient="from-emerald-500/10 to-teal-500/5"
              iconBg="bg-emerald-500/10"
              iconColor="text-emerald-600"
              icon={<Package size={20} />}
              onClick={() => openKpiDrill('production', 'Todos los registros de hoy')}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              title="Estimado"
              value={metrics?.totalAmount || 0}
              unit="jornada"
              prefix="$"
              gradient="from-blue-500/10 to-cyan-500/5"
              iconBg="bg-blue-500/10"
              iconColor="text-blue-600"
              icon={<DollarSign size={20} />}
              onClick={() => openKpiDrill('production', 'Detalle de costos del día')}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              title="Trabajadores"
              value={metrics?.activeWorkers || 0}
              unit="activos hoy"
              gradient="from-violet-500/10 to-purple-500/5"
              iconBg="bg-violet-500/10"
              iconColor="text-violet-600"
              icon={<Users size={20} />}
              onClick={() => openKpiDrill('workers-active', 'Trabajadores activos hoy')}
            />
          </StaggerItem>
          <StaggerItem>
            <KpiCard
              title="Paños"
              value={metrics?.activeBlocks || 0}
              unit="en cosecha"
              gradient="from-amber-500/10 to-orange-500/5"
              iconBg="bg-amber-500/10"
              iconColor="text-amber-600"
              icon={<Grid3X3 size={20} />}
              onClick={() => openKpiDrill('blocks-active', 'Paños en cosecha hoy')}
            />
          </StaggerItem>
        </StaggerContainer>
      )}

      {/* Charts Row */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Weekly trend */}
        {trendLoading ? (
          <ChartSkeleton />
        ) : (
          <FadeIn delay={0.2} className="rounded-2xl border border-border bg-card p-5 glow-card">
            <h3 className="text-sm font-semibold text-foreground mb-1">Producción últimos 7 días</h3>
            <p className="text-xs text-muted-foreground mb-4">Click en un día para ver detalle</p>
            {weeklyTrend && weeklyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={weeklyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} onClick={(e) => { if (e?.activePayload?.[0]?.payload) openDayDrill(e.activePayload[0].payload); }}>
                  <defs>
                    <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(152, 60%, 28%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(152, 60%, 28%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(140, 10%, 91%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(160, 5%, 45%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(160, 5%, 45%)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(140, 10%, 91%)', fontSize: '12px' }} formatter={(value: number) => [`${value} cajas`, 'Producción']} />
                  <Area type="monotone" dataKey="units" stroke="hsl(152, 60%, 28%)" fillOpacity={1} fill="url(#colorUnits)" strokeWidth={2} style={{ cursor: 'pointer' }} animationDuration={1200} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-xs text-muted-foreground">Sin datos de tendencia</p>
              </div>
            )}
          </FadeIn>
        )}

        {/* Block production */}
        {blocksLoading ? (
          <ChartSkeleton />
        ) : (
          <FadeIn delay={0.3} className="rounded-2xl border border-border bg-card p-5 glow-card">
            <h3 className="text-sm font-semibold text-foreground mb-1">Producción por paño (hoy)</h3>
            <p className="text-xs text-muted-foreground mb-4">Click en una barra para ver detalle</p>
            {blockProduction && blockProduction.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={blockProduction} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} onClick={(e) => { if (e?.activePayload?.[0]?.payload) openBlockDrill(e.activePayload[0].payload); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(140, 10%, 91%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(160, 5%, 45%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(160, 5%, 45%)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(140, 10%, 91%)', fontSize: '12px' }} formatter={(value: number) => [`${value} cajas`, 'Producción']} />
                  <Bar dataKey="units" radius={[6, 6, 0, 0]} style={{ cursor: 'pointer' }} animationDuration={1000} animationEasing="ease-out">
                    {blockProduction.map((_, idx) => (
                      <Cell key={idx} fill={idx === 0 ? 'hsl(152, 60%, 30%)' : 'hsl(152, 50%, 42%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-xs text-muted-foreground">Sin producción por paño</p>
              </div>
            )}
          </FadeIn>
        )}
      </div>

      {/* Ranking */}
      <FadeIn delay={0.35} className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Ranking del día</h2>
        {rankingLoading ? (
          <RankingSkeleton rows={5} />
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden glow-card">
            {(ranking || []).length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users size={20} className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">Sin producción registrada hoy</p>
                <p className="text-muted-foreground text-xs mt-1">Los datos aparecerán cuando se registren cajas</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(ranking || []).map((w, i) => (
                  <motion.div
                    key={w.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                    onClick={() => openWorkerDrill(w)}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors cursor-pointer group"
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform group-hover:scale-110 ${
                      i === 0 ? 'bg-amber-100 text-amber-700 shadow-sm shadow-amber-200' :
                      i === 1 ? 'bg-gray-100 text-gray-600' :
                      i === 2 ? 'bg-orange-50 text-orange-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">{w.name}</span>
                    <div className="hidden sm:flex w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(w.units / maxUnits) * 100}%` }}
                        transition={{ delay: 0.6 + i * 0.05, duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-sm font-bold text-primary tabular-nums min-w-[3rem] text-right">{w.units}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </FadeIn>

      {/* Drilldown Modal */}
      <Modal open={!!drilldown} onClose={() => setDrilldown(null)} title={drilldown?.title || ''} size="lg">
        {drilldown && (
          <DrilldownTable records={drilldownRecords || []} loading={drillLoading} type={drilldown.type} />
        )}
      </Modal>
    </div>
  );
}

function DrilldownTable({ records, loading, type }: { records: any[]; loading: boolean; type: string }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <Package size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Sin registros</p>
      </div>
    );
  }

  // Summary stats
  const totalUnits = records.reduce((s, r) => s + Number(r.quantity), 0);
  const totalAmount = records.reduce((s, r) => s + r.total, 0);
  const uniqueWorkers = new Set(records.map(r => r.worker_id)).size;
  const uniqueBlocks = new Set(records.map(r => r.block_id)).size;

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-600">Total cajas</p>
          <p className="text-lg font-bold text-emerald-800">{totalUnits}</p>
        </div>
        <div className="rounded-xl bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-600">Total $</p>
          <p className="text-lg font-bold text-blue-800">${totalAmount.toLocaleString()}</p>
        </div>
        {type !== 'worker' && (
          <div className="rounded-xl bg-violet-50 px-3 py-2">
            <p className="text-xs text-violet-600">Trabajadores</p>
            <p className="text-lg font-bold text-violet-800">{uniqueWorkers}</p>
          </div>
        )}
        {type !== 'block' && (
          <div className="rounded-xl bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-600">Paños</p>
            <p className="text-lg font-bold text-amber-800">{uniqueBlocks}</p>
          </div>
        )}
      </div>

      {/* Records table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {type !== 'worker' && <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Trabajador</th>}
              {type !== 'block' && <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Paño</th>}
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Cajas</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Tarifa</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((r, i) => (
              <tr key={r.id || i} className="hover:bg-accent/20 transition-colors">
                {type !== 'worker' && <td className="px-3 py-2 text-foreground">{r.worker_name}</td>}
                {type !== 'block' && <td className="px-3 py-2 text-foreground">{r.block_name}</td>}
                <td className="px-3 py-2 text-right font-medium tabular-nums">{r.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">${Number(r.rate_amount_snapshot).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">${r.total.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {new Date(r.recorded_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ title, value, unit, gradient, iconBg, iconColor, icon, prefix, onClick }: {
  title: string; value: number; unit: string; gradient: string; iconBg: string; iconColor?: string; icon: React.ReactNode; prefix?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`glow-card rounded-2xl border border-border bg-gradient-to-br ${gradient} p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className="mt-2">
            <AnimatedCounter
              value={value}
              prefix={prefix || ''}
              className="text-2xl font-bold text-foreground tracking-tight"
            />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{unit}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} ${iconColor || ''}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
