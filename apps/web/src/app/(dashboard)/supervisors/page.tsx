'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { PageTransition } from '@/components/ui/animations';

export default function SupervisorsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [assignModal, setAssignModal] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, phone, status')
        .eq('role', 'supervisor')
        .order('full_name');
      if (error) throw error;

      const results = [];
      for (const sup of data || []) {
        const { data: workerAssignments } = await supabase
          .from('supervisor_assignments')
          .select('id, worker_id, workers!fk_assignment_worker_org(full_name)')
          .eq('supervisor_id', sup.id)
          .not('worker_id', 'is', null);

        const { data: blockAssignments } = await supabase
          .from('supervisor_assignments')
          .select('id, block_id, blocks(name, fields(name))')
          .eq('supervisor_id', sup.id)
          .not('block_id', 'is', null);

        results.push({
          ...sup,
          worker_assignments: (workerAssignments || []).map((a: any) => ({ id: a.id, worker_id: a.worker_id, name: a.workers?.full_name })),
          block_assignments: (blockAssignments || []).map((a: any) => ({ id: a.id, block_id: a.block_id, name: a.blocks?.name, field: a.blocks?.fields?.name })),
        });
      }
      return results;
    },
  });

  const columns = [
    { key: 'full_name', label: 'Supervisor', render: (row: any) => (
      <span className="font-medium text-foreground">{row.full_name}</span>
    )},
    { key: 'phone', label: 'Teléfono', render: (row: any) => (
      <span className="tabular-nums">{row.phone || '—'}</span>
    )},
    { key: 'worker_assignments', label: 'Trabajadores', sortable: false, render: (row: any) => (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {row.worker_assignments.length === 0
          ? <span className="text-xs text-muted-foreground">Sin asignar</span>
          : row.worker_assignments.map((a: any) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
              {a.name}
            </span>
          ))
        }
      </div>
    )},
    { key: 'block_assignments', label: 'Paños', sortable: false, render: (row: any) => (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {row.block_assignments.length === 0
          ? <span className="text-xs text-muted-foreground">Sin asignar</span>
          : row.block_assignments.map((a: any) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs text-amber-700" title={a.field}>
              {a.name}
            </span>
          ))
        }
      </div>
    )},
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Supervisores"
        description="Asignación de supervisores a trabajadores y paños"
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay supervisores registrados"
        searchPlaceholder="Buscar supervisores..."
        searchKeys={['full_name']}
        actions={(row: any) => (
          <button onClick={() => setAssignModal(row)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors">
            Gestionar
          </button>
        )}
      />

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Asignaciones — ${assignModal?.full_name || ''}`}>
        {assignModal && (
          <AssignmentManager
            supervisor={assignModal}
            onUpdate={() => { queryClient.invalidateQueries({ queryKey: ['supervisors'] }); }}
          />
        )}
      </Modal>
    </PageTransition>
  );
}

function AssignmentManager({ supervisor, onUpdate }: { supervisor: any; onUpdate: () => void }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<'workers' | 'blocks'>('workers');

  // Fetch current assignments (local query that refreshes independently)
  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ['supervisor-assignments', supervisor.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('supervisor_assignments')
        .select('id, worker_id, block_id')
        .eq('supervisor_id', supervisor.id);

      const rows = data || [];
      const workerIds = rows.filter(a => a.worker_id).map(a => a.worker_id!);
      const blockIds = rows.filter(a => a.block_id).map(a => a.block_id!);

      let workerMap: Record<string, string> = {};
      let blockMap: Record<string, { name: string; field: string }> = {};

      if (workerIds.length > 0) {
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        workerMap = Object.fromEntries((workers || []).map(w => [w.id, w.full_name]));
      }
      if (blockIds.length > 0) {
        const { data: blocks } = await supabase.from('blocks').select('id, name, fields(name)').in('id', blockIds);
        blockMap = Object.fromEntries((blocks || []).map((b: any) => [b.id, { name: b.name, field: b.fields?.name || '' }]));
      }

      const workerAssignments = rows.filter(a => a.worker_id).map(a => ({ id: a.id, worker_id: a.worker_id, name: workerMap[a.worker_id!] || '—' }));
      const blockAssignments = rows.filter(a => a.block_id).map(a => ({ id: a.id, block_id: a.block_id, name: blockMap[a.block_id!]?.name || '—', field_name: blockMap[a.block_id!]?.field || '' }));
      return { workerAssignments, blockAssignments };
    },
  });

  // Available workers (not yet assigned to this supervisor)
  const { data: availableWorkers } = useQuery({
    queryKey: ['available-workers', supervisor.id, assignments?.workerAssignments],
    enabled: !!assignments,
    queryFn: async () => {
      const { data } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('role', 'worker')
        .eq('status', 'active')
        .order('full_name');
      const assignedIds = (assignments?.workerAssignments || []).map((a: any) => a.worker_id);
      return (data || []).filter((w: any) => !assignedIds.includes(w.id));
    },
  });

  // Available blocks (not yet assigned to this supervisor)
  const { data: availableBlocks } = useQuery({
    queryKey: ['available-blocks', supervisor.id, assignments?.blockAssignments],
    enabled: !!assignments,
    queryFn: async () => {
      const { data } = await supabase
        .from('blocks')
        .select('id, name, fields(name)')
        .eq('status', 'active')
        .order('name');
      const assignedIds = (assignments?.blockAssignments || []).map((a: any) => a.block_id);
      return (data || []).filter((b: any) => !assignedIds.includes(b.id));
    },
  });

  const assignWorker = useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await supabase.from('supervisor_assignments').insert({
        supervisor_id: supervisor.id,
        worker_id: workerId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast('Trabajador asignado', 'success'); refetchAssignments(); onUpdate(); },
    onError: () => toast('Error al asignar', 'error'),
  });

  const unassignWorker = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('supervisor_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => { toast('Trabajador desasignado', 'success'); refetchAssignments(); onUpdate(); },
    onError: () => toast('Error al desasignar', 'error'),
  });

  const assignBlock = useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase.from('supervisor_assignments').insert({
        supervisor_id: supervisor.id,
        block_id: blockId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast('Paño asignado', 'success'); refetchAssignments(); onUpdate(); },
    onError: () => toast('Error al asignar', 'error'),
  });

  const unassignBlock = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('supervisor_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => { toast('Paño desasignado', 'success'); refetchAssignments(); onUpdate(); },
    onError: () => toast('Error al desasignar', 'error'),
  });

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        <button
          onClick={() => setTab('workers')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'workers' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Trabajadores ({assignments?.workerAssignments?.length || 0})
        </button>
        <button
          onClick={() => setTab('blocks')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'blocks' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          Paños ({assignments?.blockAssignments?.length || 0})
        </button>
      </div>

      {tab === 'workers' && (
        <div className="space-y-3">
          {/* Current assignments */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Asignados</p>
            {(assignments?.workerAssignments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Ninguno</p>
            ) : (
              <div className="space-y-1">
                {(assignments?.workerAssignments || []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2">
                    <span className="text-sm text-violet-800 font-medium">{a.name}</span>
                    <button onClick={() => unassignWorker.mutate(a.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add worker */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Agregar</p>
            <select
              onChange={(e) => { if (e.target.value) assignWorker.mutate(e.target.value); e.target.value = ''; }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            >
              <option value="">Seleccionar trabajador...</option>
              {(availableWorkers || []).map((w: any) => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {tab === 'blocks' && (
        <div className="space-y-3">
          {/* Current block assignments */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Asignados</p>
            {(assignments?.blockAssignments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Ninguno</p>
            ) : (
              <div className="space-y-1">
                {(assignments?.blockAssignments || []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                    <div>
                      <span className="text-sm text-amber-800 font-medium">{a.name}</span>
                      <span className="text-xs text-amber-600 ml-2">({a.field_name})</span>
                    </div>
                    <button onClick={() => unassignBlock.mutate(a.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add block */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Agregar</p>
            <select
              onChange={(e) => { if (e.target.value) assignBlock.mutate(e.target.value); e.target.value = ''; }}
              className="block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            >
              <option value="">Seleccionar paño...</option>
              {(availableBlocks || []).map((b: any) => (
                <option key={b.id} value={b.id}>{b.name} — {(b as any).fields?.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
