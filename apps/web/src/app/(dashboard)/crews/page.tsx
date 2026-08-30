'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { FormField } from '@/components/ui/FormField';
import { useFormValidation } from '@/hooks/useFormValidation';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { z } from 'zod';
import { Truck, UserMinus, Users } from 'lucide-react';
import { PageTransition } from '@/components/ui/animations';

export default function CrewsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editCrew, setEditCrew] = useState<any | null>(null);
  const [toggleCrew, setToggleCrew] = useState<any | null>(null);
  const [membersCrew, setMembersCrew] = useState<any | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { roleLabel, crewModeEnabled, loading: settingsLoading } = useOrgSettings();

  const crewTerm = roleLabel('crew_lead'); // etiqueta configurable (ej. "Capataz")

  const { data, isLoading } = useQuery({
    queryKey: ['crews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crews')
        .select('*, crew_lead:workers!crews_crew_lead_id_fkey(id, full_name), supervisor:workers!fk_crews_supervisor_org(id, full_name), members:workers!fk_workers_crew_org(id)')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (crew: any) => {
      const newStatus = crew.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('crews').update({ status: newStatus }).eq('id', crew.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crews'] });
      toast('Estado actualizado', 'success');
      setToggleCrew(null);
    },
    onError: () => toast('Error al actualizar', 'error'),
  });

  // Si el Modo Capataz está desactivado, esta sección no aplica.
  if (!settingsLoading && !crewModeEnabled) {
    return (
      <PageTransition>
        <PageHeader title="Cuadrillas" description="Gestión de cuadrillas y encargados" />
        <div className="rounded-xl border border-border bg-muted/20 p-8 text-center">
          <Truck className="mx-auto mb-3 text-muted-foreground" size={32} />
          <p className="text-sm text-muted-foreground">
            El Modo Capataz no está activo en tu organización. Actívalo en la configuración
            para gestionar cuadrillas y encargados.
          </p>
        </div>
      </PageTransition>
    );
  }

  const columns = [
    { key: 'name', label: 'Cuadrilla', render: (row: any) => (
      <span className="inline-flex items-center gap-2 font-medium text-foreground">
        <Truck size={14} className="text-primary" /> {row.name}
      </span>
    )},
    { key: 'crew_lead', label: crewTerm, render: (row: any) => (
      <span className="text-foreground">{row.crew_lead?.full_name || '—'}</span>
    )},
    { key: 'supervisor', label: 'Supervisor', sortable: false, render: (row: any) => (
      <span className="text-foreground">{row.supervisor?.full_name || <span className="text-muted-foreground">Sin asignar</span>}</span>
    )},
    { key: 'members', label: 'Trabajadores', sortable: false, render: (row: any) => (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        <Users size={12} /> {(row.members || []).length}
      </span>
    )},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Cuadrillas"
        description={`Gestión de cuadrillas y ${crewTerm.toLowerCase()}s`}
        action={<ActionButton onClick={() => setShowCreate(true)}>+ Nueva Cuadrilla</ActionButton>}
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay cuadrillas registradas"
        searchPlaceholder="Buscar cuadrillas..."
        searchKeys={['name']}
        actions={(row: any) => (
          <>
            <button onClick={() => setMembersCrew(row)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors" title="Gestionar trabajadores">
              <Users size={14} />
            </button>
            <button onClick={() => setEditCrew(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button onClick={() => setToggleCrew(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva Cuadrilla">
        <CrewForm crewTerm={crewTerm} onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['crews'] }); toast('Cuadrilla creada', 'success'); }} />
      </Modal>

      <Modal open={!!editCrew} onClose={() => setEditCrew(null)} title="Editar Cuadrilla">
        {editCrew && (
          <CrewForm crewTerm={crewTerm} initial={editCrew} onSuccess={() => { setEditCrew(null); queryClient.invalidateQueries({ queryKey: ['crews'] }); toast('Cuadrilla actualizada', 'success'); }} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toggleCrew}
        onClose={() => setToggleCrew(null)}
        onConfirm={() => toggleCrew && toggleStatus.mutate(toggleCrew)}
        title={toggleCrew?.status === 'active' ? 'Desactivar cuadrilla' : 'Activar cuadrilla'}
        message={`¿Estás seguro de ${toggleCrew?.status === 'active' ? 'desactivar' : 'activar'} "${toggleCrew?.name}"?`}
        confirmLabel={toggleCrew?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={toggleCrew?.status === 'active' ? 'danger' : 'default'}
        loading={toggleStatus.isPending}
      />

      <Modal open={!!membersCrew} onClose={() => setMembersCrew(null)} title={`Trabajadores — ${membersCrew?.name || ''}`} size="lg">
        {membersCrew && (
          <CrewMembers crewId={membersCrew.id} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crews'] })} />
        )}
      </Modal>
    </PageTransition>
  );
}

function CrewForm({ onSuccess, initial, crewTerm }: { onSuccess: () => void; initial?: any; crewTerm: string }) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  // Encargados disponibles (workers con rol crew_lead)
  const { data: leads } = useQuery({
    queryKey: ['crew-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('role', 'crew_lead')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Supervisores disponibles (el encargado queda a cargo de un supervisor)
  const { data: supervisors } = useQuery({
    queryKey: ['crew-supervisors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('role', 'supervisor')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const schema = z.object({
    name: z.string().min(1, 'Nombre es requerido').max(120, 'Máximo 120 caracteres'),
    crew_lead_id: z.string().uuid('Seleccione un encargado'),
    supervisor_id: z.string().uuid('Seleccione un supervisor'),
  });
  const { errors, validate, clearField } = useFormValidation({ schema });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = { name: form.get('name') as string, crew_lead_id: form.get('crew_lead_id') as string, supervisor_id: form.get('supervisor_id') as string };
    const result = validate(raw);
    if (!result.success) return;

    setLoading(true);
    if (initial) {
      const { error } = await supabase.from('crews')
        .update({ name: result.data.name, crew_lead_id: result.data.crew_lead_id, supervisor_id: result.data.supervisor_id })
        .eq('id', initial.id);
      if (error) { toast('Error al actualizar', 'error'); setLoading(false); return; }
    } else {
      const { error } = await supabase.from('crews')
        .insert({ name: result.data.name, crew_lead_id: result.data.crew_lead_id, supervisor_id: result.data.supervisor_id });
      if (error) { toast('Error al crear', 'error'); setLoading(false); return; }
    }
    setLoading(false);
    onSuccess();
  }

  const inputClass = (field: string) =>
    `block w-full rounded-xl border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 transition-all ${
      errors[field] ? 'border-red-300 bg-red-50/30 focus:ring-red-200 focus:border-red-400' : 'border-border bg-muted/30 focus:ring-primary/30 focus:border-primary/50'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre de la cuadrilla" required error={errors.name}>
        <input name="name" defaultValue={initial?.name || ''} placeholder="Ej. Furgón 1" onChange={() => clearField('name')} className={inputClass('name')} />
      </FormField>
      <FormField label={crewTerm} required error={errors.crew_lead_id}>
        <select name="crew_lead_id" defaultValue={initial?.crew_lead_id || ''} onChange={() => clearField('crew_lead_id')} className={inputClass('crew_lead_id')}>
          <option value="">Seleccione…</option>
          {(leads || []).map((l: any) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
        </select>
      </FormField>
      {(leads || []).length === 0 && (
        <p className="text-xs text-amber-600">
          No hay trabajadores con rol {crewTerm.toLowerCase()}. Crea uno en Trabajadores antes de armar la cuadrilla.
        </p>
      )}
      <FormField label="Supervisor a cargo" required error={errors.supervisor_id}>
        <select name="supervisor_id" defaultValue={initial?.supervisor_id || ''} onChange={() => clearField('supervisor_id')} className={inputClass('supervisor_id')}>
          <option value="">Seleccione…</option>
          {(supervisors || []).map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </FormField>
      {(supervisors || []).length === 0 && (
        <p className="text-xs text-amber-600">
          No hay trabajadores con rol supervisor. Crea uno en Trabajadores para que quede a cargo del {crewTerm.toLowerCase()}.
        </p>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Cuadrilla'}
      </button>
    </form>
  );
}

function CrewMembers({ crewId, onUpdate }: { crewId: string; onUpdate: () => void }) {
  const supabase = createClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  // Miembros actuales de la cuadrilla
  const { data: members, refetch: refetchMembers } = useQuery({
    queryKey: ['crew-members', crewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('crew_id', crewId)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Trabajadores disponibles (rol worker, sin cuadrilla)
  const { data: available, refetch: refetchAvailable } = useQuery({
    queryKey: ['crew-available', crewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name')
        .eq('role', 'worker')
        .eq('status', 'active')
        .is('crew_id', null)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  async function addMember() {
    if (!selected) return;
    setLoading(true);
    const { error } = await supabase.from('workers').update({ crew_id: crewId }).eq('id', selected);
    setLoading(false);
    if (error) { toast('Error al asignar', 'error'); return; }
    setSelected('');
    toast('Trabajador asignado', 'success');
    refetchMembers(); refetchAvailable(); onUpdate();
  }

  async function removeMember(workerId: string) {
    const { error } = await supabase.from('workers').update({ crew_id: null }).eq('id', workerId).eq('crew_id', crewId);
    if (error) { toast('Error al quitar', 'error'); return; }
    toast('Trabajador removido', 'success');
    refetchMembers(); refetchAvailable(); onUpdate();
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all">
          <option value="">Seleccione un trabajador…</option>
          {(available || []).map((w: any) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
        </select>
        <button onClick={addMember} disabled={loading || !selected} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all whitespace-nowrap">
          {loading ? '...' : 'Asignar'}
        </button>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Miembros ({(members || []).length})
        </p>
        {(members || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin trabajadores asignados</p>
        ) : (
          <div className="rounded-xl border border-border divide-y divide-border">
            {(members || []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-foreground">{m.full_name}</span>
                <button onClick={() => removeMember(m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title="Quitar de la cuadrilla">
                  <UserMinus size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
