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
import { QRBadge } from '@/components/ui/QRBadge';
import { FormField } from '@/components/ui/FormField';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { PageTransition } from '@/components/ui/animations';

export default function WorkersPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editWorker, setEditWorker] = useState<any | null>(null);
  const [deleteWorker, setDeleteWorker] = useState<any | null>(null);
  const [badgeWorker, setBadgeWorker] = useState<any | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, national_id, phone, role, status, qr_badge_url, created_at')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (worker: any) => {
      const newStatus = worker.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('workers').update({ status: newStatus }).eq('id', worker.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      toast('Estado actualizado', 'success');
      setDeleteWorker(null);
    },
    onError: () => toast('Error al actualizar estado', 'error'),
  });

  const roleLabels: Record<string, string> = { admin: 'Administrador', supervisor: 'Supervisor', crew_lead: 'Encargado', worker: 'Trabajador' };

  const columns = [
    { key: 'full_name', label: 'Nombre' },
    { key: 'national_id', label: 'RUT', render: (row: any) => row.national_id || '—' },
    { key: 'role', label: 'Rol', render: (row: any) => roleLabels[row.role] || row.role },
    { key: 'phone', label: 'Teléfono', render: (row: any) => row.phone || '—' },
    { key: 'qr_badge_url', label: 'Badge QR', render: (row: any) => row.qr_badge_url ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={14} /></span> : <span className="text-muted-foreground">—</span> },
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Trabajadores"
        description="Gestión del personal de campo"
        action={
          <ActionButton onClick={() => setShowCreate(true)}>
            + Nuevo Trabajador
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay trabajadores registrados"
        searchPlaceholder="Buscar por nombre, RUT, teléfono..."
        searchKeys={['full_name', 'national_id', 'phone', 'role']}
        actions={(row: any) => (
          <>
            <button onClick={() => setBadgeWorker(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Ver Badge QR">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
            </button>
            <button onClick={() => setEditWorker(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button onClick={() => setDeleteWorker(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Trabajador">
        <WorkerForm onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['workers'] }); toast('Trabajador creado', 'success'); }} />
      </Modal>

      <Modal open={!!editWorker} onClose={() => setEditWorker(null)} title="Editar Trabajador">
        {editWorker && (
          <WorkerForm
            initial={editWorker}
            onSuccess={() => { setEditWorker(null); queryClient.invalidateQueries({ queryKey: ['workers'] }); toast('Trabajador actualizado', 'success'); }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteWorker}
        onClose={() => setDeleteWorker(null)}
        onConfirm={() => deleteWorker && toggleStatus.mutate(deleteWorker)}
        title={deleteWorker?.status === 'active' ? 'Desactivar trabajador' : 'Activar trabajador'}
        message={`¿Estás seguro de ${deleteWorker?.status === 'active' ? 'desactivar' : 'activar'} a ${deleteWorker?.full_name}?`}
        confirmLabel={deleteWorker?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={deleteWorker?.status === 'active' ? 'danger' : 'default'}
        loading={toggleStatus.isPending}
      />

      <Modal open={!!badgeWorker} onClose={() => setBadgeWorker(null)} title="Badge QR">
        {badgeWorker && (
          <QRBadge
            badgeId={badgeWorker.qr_badge_url || ''}
            workerName={badgeWorker.full_name}
            role={roleLabels[badgeWorker.role] || badgeWorker.role}
          />
        )}
      </Modal>
    </PageTransition>
  );
}

function WorkerForm({ onSuccess, initial }: { onSuccess: () => void; initial?: any }) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  const workerSchema = z.object({
    full_name: z.string().min(1, 'Nombre es requerido').max(150, 'Máximo 150 caracteres'),
    national_id: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
    phone: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
    role: z.enum(['worker', 'supervisor', 'admin'], { required_error: 'Seleccione un rol' }),
  });

  const { errors, validate, clearField } = useFormValidation({ schema: workerSchema });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = {
      full_name: form.get('full_name') as string,
      national_id: form.get('national_id') as string,
      phone: form.get('phone') as string,
      role: form.get('role') as string,
    };

    const result = validate(raw);
    if (!result.success) return;

    setLoading(true);
    const payload = {
      full_name: result.data.full_name,
      national_id: result.data.national_id || null,
      phone: result.data.phone || null,
      role: result.data.role,
    };

    if (initial) {
      const { error } = await supabase.from('workers').update(payload).eq('id', initial.id);
      if (error) { toast('Error al actualizar', 'error'); setLoading(false); return; }
    } else {
      const { error } = await supabase.from('workers').insert({ ...payload, qr_badge_url: crypto.randomUUID() });
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
      <FormField label="Nombre completo" required error={errors.full_name}>
        <input name="full_name" defaultValue={initial?.full_name || ''} onChange={() => clearField('full_name')} className={inputClass('full_name')} />
      </FormField>
      <FormField label="RUT" error={errors.national_id}>
        <input name="national_id" defaultValue={initial?.national_id || ''} placeholder="12.345.678-9" onChange={() => clearField('national_id')} className={`${inputClass('national_id')} placeholder:text-muted-foreground/60`} />
      </FormField>
      <FormField label="Teléfono" error={errors.phone}>
        <input name="phone" defaultValue={initial?.phone || ''} placeholder="+56 9 1234 5678" onChange={() => clearField('phone')} className={`${inputClass('phone')} placeholder:text-muted-foreground/60`} />
      </FormField>
      <FormField label="Rol" required error={errors.role}>
        <select name="role" defaultValue={initial?.role || 'worker'} onChange={() => clearField('role')} className={inputClass('role')}>
          <option value="worker">Trabajador</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Administrador</option>
        </select>
      </FormField>
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Trabajador'}
      </button>
    </form>
  );
}
