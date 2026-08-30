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
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/ui/FormField';
import { useFormValidation } from '@/hooks/useFormValidation';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { z } from 'zod';
import { PageTransition } from '@/components/ui/animations';

export default function FieldsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editField, setEditField] = useState<any | null>(null);
  const [deleteField, setDeleteField] = useState<any | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['fields'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fields')
        .select('*, blocks(count)')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (field: any) => {
      const newStatus = field.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('fields').update({ status: newStatus }).eq('id', field.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] });
      toast('Estado actualizado', 'success');
      setDeleteField(null);
    },
    onError: () => toast('Error al actualizar', 'error'),
  });

  const columns = [
    { key: 'name', label: 'Nombre', render: (row: any) => (
      <button onClick={() => router.push(`/fields/${row.id}`)} className="font-medium text-primary hover:underline text-left">
        {row.name}
      </button>
    )},
    { key: 'location', label: 'Ubicación', render: (row: any) => row.location || '—' },
    { key: 'total_area', label: 'Hectáreas', render: (row: any) => <span className="tabular-nums">{row.total_area} ha</span> },
    { key: 'blocks', label: 'Paños', render: (row: any) => <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary">{row.blocks?.[0]?.count || 0}</span> },
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Campos"
        description="Gestión de campos y terrenos productivos"
        action={
          <ActionButton onClick={() => setShowCreate(true)}>
            + Nuevo Campo
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay campos registrados"
        searchPlaceholder="Buscar por nombre, ubicación..."
        searchKeys={['name', 'location']}
        actions={(row: any) => (
          <>
            <button onClick={() => router.push(`/fields/${row.id}`)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Ver paños">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            </button>
            <button onClick={() => setEditField(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button onClick={() => setDeleteField(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Campo">
        <FieldForm onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['fields'] }); toast('Campo creado', 'success'); }} />
      </Modal>

      <Modal open={!!editField} onClose={() => setEditField(null)} title="Editar Campo">
        {editField && (
          <FieldForm initial={editField} onSuccess={() => { setEditField(null); queryClient.invalidateQueries({ queryKey: ['fields'] }); toast('Campo actualizado', 'success'); }} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteField}
        onClose={() => setDeleteField(null)}
        onConfirm={() => deleteField && toggleStatus.mutate(deleteField)}
        title={deleteField?.status === 'active' ? 'Desactivar campo' : 'Activar campo'}
        message={`¿Estás seguro de ${deleteField?.status === 'active' ? 'desactivar' : 'activar'} el campo "${deleteField?.name}"?`}
        confirmLabel={deleteField?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={deleteField?.status === 'active' ? 'danger' : 'default'}
        loading={toggleStatus.isPending}
      />
    </PageTransition>
  );
}

function FieldForm({ onSuccess, initial }: { onSuccess: () => void; initial?: any }) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();
  const { crewModeEnabled } = useOrgSettings();

  const fieldSchema = z.object({
    name: z.string().min(1, 'Nombre es requerido').max(100, 'Máximo 100 caracteres'),
    location: z.string().max(200, 'Máximo 200 caracteres').optional().or(z.literal('')),
    total_area: z.coerce.number().positive('Superficie debe ser mayor a 0'),
  });

  const { errors, validate, clearField } = useFormValidation({ schema: fieldSchema });

  // Override de Modo Capataz por campo: '' = heredar org, 'on' = true, 'off' = false
  function crewModeToValue(v: boolean | null | undefined): string {
    return v === true ? 'on' : v === false ? 'off' : '';
  }
  function crewModeFromValue(s: string): boolean | null {
    return s === 'on' ? true : s === 'off' ? false : null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = {
      name: form.get('name') as string,
      location: form.get('location') as string,
      total_area: form.get('total_area') as string,
    };

    const result = validate(raw);
    if (!result.success) return;

    setLoading(true);
    const payload: Record<string, unknown> = {
      name: result.data.name,
      location: result.data.location || null,
      total_area: result.data.total_area,
    };
    if (crewModeEnabled) {
      payload.crew_mode_enabled = crewModeFromValue(form.get('crew_mode') as string);
    }

    if (initial) {
      const { error } = await supabase.from('fields').update(payload).eq('id', initial.id);
      if (error) { toast('Error al actualizar', 'error'); setLoading(false); return; }
    } else {
      const { error } = await supabase.from('fields').insert(payload);
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
      <FormField label="Nombre" required error={errors.name}>
        <input name="name" defaultValue={initial?.name || ''} onChange={() => clearField('name')} className={inputClass('name')} />
      </FormField>
      <FormField label="Ubicación" error={errors.location}>
        <input name="location" defaultValue={initial?.location || ''} onChange={() => clearField('location')} className={inputClass('location')} />
      </FormField>
      <FormField label="Superficie (ha)" required error={errors.total_area}>
        <input name="total_area" type="number" step="0.01" defaultValue={initial?.total_area || ''} onChange={() => clearField('total_area')} className={inputClass('total_area')} />
      </FormField>
      {crewModeEnabled && (
        <FormField label="Modo Capataz en este campo">
          <select name="crew_mode" defaultValue={crewModeToValue(initial?.crew_mode_enabled)} className={inputClass('crew_mode')}>
            <option value="">Heredar de la organización</option>
            <option value="on">Activado (usa cuadrillas)</option>
            <option value="off">Desactivado (pago directo)</option>
          </select>
        </FormField>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Campo'}
      </button>
    </form>
  );
}
