'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { FormField } from '@/components/ui/FormField';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Box, Scale } from 'lucide-react';

/** Detalle de un paño (block): lista completa de sus melgas (field_rows) con CRUD. */
export default function BlockRowsPage() {
  const params = useParams();
  const fieldId = params.id as string;
  const blockId = params.blockId as string;
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [toggleRow, setToggleRow] = useState<any | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: block, isLoading: blockLoading } = useQuery({
    queryKey: ['block', blockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('*, products(name, unit_measure), fields(name)')
        .eq('id', blockId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows, isLoading: rowsLoading } = useQuery({
    queryKey: ['field-rows', blockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_rows')
        .select('*')
        .eq('block_id', blockId)
        .order('row_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (row: any) => {
      const newStatus = row.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('field_rows').update({ status: newStatus }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-rows', blockId] });
      toast('Estado de la melga actualizado', 'success');
      setToggleRow(null);
    },
    onError: () => toast('Error al actualizar estado', 'error'),
  });

  const columns = [
    { key: 'row_number', label: 'N°', render: (row: any) => (
      row.row_number != null
        ? <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary tabular-nums">{row.row_number}</span>
        : <span className="text-muted-foreground">—</span>
    )},
    { key: 'name', label: 'Melga', render: (row: any) => (
      <span className="font-medium text-foreground">{row.name}</span>
    )},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  if (blockLoading) {
    return (
      <div className="animate-in">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg mb-4" />
        <div className="h-4 w-32 bg-muted animate-pulse rounded mb-8" />
        <div className="h-64 bg-muted animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!block) {
    return (
      <div className="animate-in text-center py-16">
        <p className="text-muted-foreground">Paño no encontrado</p>
        <Link href={`/fields/${fieldId}`} className="text-primary text-sm mt-2 inline-block hover:underline">← Volver al campo</Link>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/fields" className="hover:text-foreground transition-colors">Campos</Link>
        <span>/</span>
        <Link href={`/fields/${fieldId}`} className="hover:text-foreground transition-colors">{block.fields?.name || 'Campo'}</Link>
        <span>/</span>
        <span className="text-foreground">{block.name}</span>
      </nav>

      {/* Block header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{block.name}</h1>
        <div className="mt-2 flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            {block.products?.unit_measure === 'box' ? <Box size={12} className="text-amber-600" /> : <Scale size={12} className="text-blue-600" />} {block.products?.name || '—'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">{block.area} ha</span>
          <StatusBadge status={block.status} />
        </div>
      </motion.div>

      {/* Rows (melgas) section */}
      <PageHeader
        title="Melgas"
        description={`${(rows || []).length} melga(s) en este paño`}
        action={
          <ActionButton onClick={() => setShowCreate(true)}>
            + Nueva Melga
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={rows || []}
        loading={rowsLoading}
        emptyMessage="No hay melgas registradas en este paño"
        searchPlaceholder="Buscar melgas..."
        searchKeys={['name']}
        actions={(row: any) => (
          <>
            <button onClick={() => setEditRow(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button onClick={() => setToggleRow(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </button>
          </>
        )}
      />

      {/* Create melga modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva Melga">
        <RowForm
          blockId={blockId}
          onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['field-rows', blockId] }); toast('Melga creada', 'success'); }}
        />
      </Modal>

      {/* Edit melga modal */}
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Editar Melga">
        {editRow && (
          <RowForm
            blockId={blockId}
            initial={editRow}
            onSuccess={() => { setEditRow(null); queryClient.invalidateQueries({ queryKey: ['field-rows', blockId] }); toast('Melga actualizada', 'success'); }}
          />
        )}
      </Modal>

      {/* Toggle status dialog */}
      <ConfirmDialog
        open={!!toggleRow}
        onClose={() => setToggleRow(null)}
        onConfirm={() => toggleRow && toggleStatusMutation.mutate(toggleRow)}
        title={toggleRow?.status === 'active' ? 'Desactivar melga' : 'Activar melga'}
        message={`¿Estás seguro de ${toggleRow?.status === 'active' ? 'desactivar' : 'activar'} la melga "${toggleRow?.name}"?`}
        confirmLabel={toggleRow?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={toggleRow?.status === 'active' ? 'danger' : 'default'}
        loading={toggleStatusMutation.isPending}
      />
    </div>
  );
}

/** Form de creación/edición de una melga (field_row). */
function RowForm({ blockId, initial, onSuccess }: {
  blockId: string;
  initial?: any;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  const rowSchema = z.object({
    name: z.string().min(1, 'Nombre es requerido').max(100, 'Máximo 100 caracteres'),
    row_number: z.union([z.coerce.number().int().positive('Debe ser mayor a 0'), z.literal('')]).optional(),
  });

  const { errors, validate, clearField } = useFormValidation({ schema: rowSchema });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = {
      name: form.get('name') as string,
      row_number: form.get('row_number') as string,
    };

    const result = validate(raw);
    if (!result.success) return;

    const rowNumber = result.data.row_number === '' || result.data.row_number === undefined
      ? null
      : Number(result.data.row_number);

    setLoading(true);
    if (initial) {
      const { error } = await supabase.from('field_rows').update({ name: result.data.name, row_number: rowNumber }).eq('id', initial.id);
      if (error) { toast('Error al actualizar', 'error'); setLoading(false); return; }
    } else {
      // organization_id lo completa el trigger set_organization_id desde el JWT.
      const { error } = await supabase.from('field_rows').insert({ name: result.data.name, row_number: rowNumber, block_id: blockId });
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
      <FormField label="Nombre de la melga" required error={errors.name}>
        <input name="name" defaultValue={initial?.name || ''} placeholder="Ej: Melga 1, Hilera 12-A" onChange={() => clearField('name')} className={`${inputClass('name')} placeholder:text-muted-foreground/60`} />
      </FormField>
      <FormField label="Número de melga (opcional)" error={errors.row_number}>
        <input name="row_number" type="number" min="1" step="1" defaultValue={initial?.row_number ?? ''} onChange={() => clearField('row_number')} className={inputClass('row_number')} placeholder="Ej: 1" />
      </FormField>
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Melga'}
      </button>
    </form>
  );
}
