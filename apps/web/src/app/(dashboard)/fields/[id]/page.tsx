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
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Box, Scale, MapPin, Ruler, Rows3 } from 'lucide-react';

export default function FieldDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fieldId = params.id as string;
  const [showCreate, setShowCreate] = useState(false);
  const [editBlock, setEditBlock] = useState<any | null>(null);
  const [toggleBlock, setToggleBlock] = useState<any | null>(null);
  const [rowsBlock, setRowsBlock] = useState<any | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: field, isLoading: fieldLoading } = useQuery({
    queryKey: ['field', fieldId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fields')
        .select('*')
        .eq('id', fieldId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: blocks, isLoading: blocksLoading } = useQuery({
    queryKey: ['blocks', fieldId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocks')
        .select('*, products(name, unit_measure)')
        .eq('field_id', fieldId)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit_measure')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Default de uso de melgas de la organización (para resolver el efectivo del campo).
  const { data: org } = useQuery({
    queryKey: ['org-rows-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('rows_enabled')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Modo Melga efectivo del campo: override del campo, o default de la organización.
  const rowsEnabledEffective =
    field?.rows_enabled === null || field?.rows_enabled === undefined
      ? (org?.rows_enabled ?? false)
      : field.rows_enabled;

  const toggleStatusMutation = useMutation({
    mutationFn: async (block: any) => {
      const newStatus = block.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('blocks').update({ status: newStatus }).eq('id', block.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocks', fieldId] });
      toast('Estado del paño actualizado', 'success');
      setToggleBlock(null);
    },
    onError: () => toast('Error al actualizar estado', 'error'),
  });

  const columns = [
    { key: 'name', label: 'Paño', render: (row: any) => (
      rowsEnabledEffective ? (
        <Link href={`/fields/${fieldId}/blocks/${row.id}`} className="font-medium text-primary hover:underline">
          {row.name}
        </Link>
      ) : (
        <span className="font-medium text-foreground">{row.name}</span>
      )
    )},
    { key: 'products', label: 'Producto', render: (row: any) => (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        {row.products?.unit_measure === 'box' ? <Box size={12} className="text-amber-600" /> : <Scale size={12} className="text-blue-600" />} {row.products?.name || '—'}
      </span>
    )},
    { key: 'area', label: 'Superficie', render: (row: any) => (
      <span className="tabular-nums">{row.area} ha</span>
    )},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  if (fieldLoading) {
    return (
      <div className="animate-in">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg mb-4" />
        <div className="h-4 w-32 bg-muted animate-pulse rounded mb-8" />
        <div className="h-64 bg-muted animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!field) {
    return (
      <div className="animate-in text-center py-16">
        <p className="text-muted-foreground">Campo no encontrado</p>
        <Link href="/fields" className="text-primary text-sm mt-2 inline-block hover:underline">← Volver a campos</Link>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Breadcrumb */}
      <nav className="mb-4">
        <Link href="/fields" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Campos
        </Link>
      </nav>

      {/* Field header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{field.name}</h1>
            <div className="mt-2 flex items-center gap-4">
              {field.location && (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  {field.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                {field.total_area} ha
              </span>
              <StatusBadge status={field.status} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Blocks section */}
      <PageHeader
        title="Paños"
        description={`${(blocks || []).length} paño(s) en este campo`}
        action={
          <ActionButton onClick={() => setShowCreate(true)}>
            + Nuevo Paño
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={blocks || []}
        loading={blocksLoading}
        emptyMessage="No hay paños registrados en este campo"
        searchPlaceholder="Buscar paños..."
        searchKeys={['name']}
        actions={(row: any) => (
          <>
            {rowsEnabledEffective && (
              <button onClick={() => setRowsBlock(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Melgas">
                <Rows3 size={15} />
              </button>
            )}
            <button onClick={() => setEditBlock(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button onClick={() => setToggleBlock(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </button>
          </>
        )}
      />

      {/* Create block modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Paño">
        <BlockForm
          fieldId={fieldId}
          products={products || []}
          onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['blocks', fieldId] }); toast('Paño creado', 'success'); }}
        />
      </Modal>

      {/* Edit block modal */}
      <Modal open={!!editBlock} onClose={() => setEditBlock(null)} title="Editar Paño">
        {editBlock && (
          <BlockForm
            fieldId={fieldId}
            products={products || []}
            initial={editBlock}
            onSuccess={() => { setEditBlock(null); queryClient.invalidateQueries({ queryKey: ['blocks', fieldId] }); toast('Paño actualizado', 'success'); }}
          />
        )}
      </Modal>

      {/* Toggle status dialog */}
      <ConfirmDialog
        open={!!toggleBlock}
        onClose={() => setToggleBlock(null)}
        onConfirm={() => toggleBlock && toggleStatusMutation.mutate(toggleBlock)}
        title={toggleBlock?.status === 'active' ? 'Desactivar paño' : 'Activar paño'}
        message={`¿Estás seguro de ${toggleBlock?.status === 'active' ? 'desactivar' : 'activar'} el paño "${toggleBlock?.name}"?`}
        confirmLabel={toggleBlock?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={toggleBlock?.status === 'active' ? 'danger' : 'default'}
        loading={toggleStatusMutation.isPending}
      />

      {/* Rows (melgas) manager modal */}
      <Modal open={!!rowsBlock} onClose={() => setRowsBlock(null)} title={rowsBlock ? `Melgas · ${rowsBlock.name}` : 'Melgas'}>
        {rowsBlock && <RowsManager block={rowsBlock} />}
      </Modal>
    </div>
  );
}

/** CRUD de melgas (field_rows) de un paño puntual. */
function RowsManager({ block }: { block: { id: string; name: string } }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editRow, setEditRow] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['field-rows', block.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_rows')
        .select('*')
        .eq('block_id', block.id)
        .order('row_number', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (row: any) => {
      const newStatus = row.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('field_rows').update({ status: newStatus }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-rows', block.id] });
      toast('Estado de la melga actualizado', 'success');
    },
    onError: () => toast('Error al actualizar estado', 'error'),
  });

  return (
    <div className="space-y-4">
      {(creating || editRow) ? (
        <RowForm
          blockId={block.id}
          initial={editRow}
          onCancel={() => { setCreating(false); setEditRow(null); }}
          onSuccess={() => {
            setCreating(false); setEditRow(null);
            queryClient.invalidateQueries({ queryKey: ['field-rows', block.id] });
            toast(editRow ? 'Melga actualizada' : 'Melga creada', 'success');
          }}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <button onClick={() => setCreating(true)} className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all">
              + Nueva Melga
            </button>
          </div>

          {isLoading ? (
            <div className="h-24 bg-muted animate-pulse rounded-xl" />
          ) : (rows || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay melgas en este paño.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {(rows || []).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {r.row_number != null && (
                      <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary tabular-nums">
                        {r.row_number}
                      </span>
                    )}
                    <span className="text-sm font-medium text-foreground">{r.name}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditRow(r)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button onClick={() => toggleStatus.mutate(r)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={r.status === 'active' ? 'Desactivar' : 'Activar'}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Form de creación/edición de una melga (field_row). */
function RowForm({ blockId, initial, onSuccess, onCancel }: {
  blockId: string;
  initial?: any;
  onSuccess: () => void;
  onCancel: () => void;
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

  const inputClass = (fieldName: string) =>
    `block w-full rounded-xl border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 transition-all ${
      errors[fieldName] ? 'border-red-300 bg-red-50/30 focus:ring-red-200 focus:border-red-400' : 'border-border bg-muted/30 focus:ring-primary/30 focus:border-primary/50'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre de la melga" required error={errors.name}>
        <input name="name" defaultValue={initial?.name || ''} placeholder="Ej: Melga 1, Hilera 12-A" onChange={() => clearField('name')} className={`${inputClass('name')} placeholder:text-muted-foreground/60`} />
      </FormField>
      <FormField label="Número de melga (opcional)" error={errors.row_number}>
        <input name="row_number" type="number" min="1" step="1" defaultValue={initial?.row_number ?? ''} onChange={() => clearField('row_number')} className={inputClass('row_number')} placeholder="Ej: 1" />
      </FormField>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-all">
          Cancelar
        </button>
        <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
          {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Melga'}
        </button>
      </div>
    </form>
  );
}

function BlockForm({ fieldId, products, onSuccess, initial }: {
  fieldId: string;
  products: { id: string; name: string; unit_measure: string }[];
  onSuccess: () => void;
  initial?: any;
}) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  const blockSchema = z.object({
    name: z.string().min(1, 'Nombre es requerido').max(100, 'Máximo 100 caracteres'),
    product_id: z.string().min(1, 'Seleccione un producto'),
    area: z.coerce.number().positive('Superficie debe ser mayor a 0'),
  });

  const { errors, validate, clearField } = useFormValidation({ schema: blockSchema });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = {
      name: form.get('name') as string,
      product_id: form.get('product_id') as string,
      area: form.get('area') as string,
    };

    const result = validate(raw);
    if (!result.success) return;

    setLoading(true);
    const payload = { name: result.data.name, product_id: result.data.product_id, area: result.data.area, field_id: fieldId };

    if (initial) {
      const { error } = await supabase.from('blocks').update({
        name: payload.name, product_id: payload.product_id, area: payload.area,
      }).eq('id', initial.id);
      if (error) { toast('Error al actualizar', 'error'); setLoading(false); return; }
    } else {
      const { error } = await supabase.from('blocks').insert(payload);
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
      <FormField label="Nombre del paño" required error={errors.name}>
        <input name="name" defaultValue={initial?.name || ''} placeholder="Ej: Paño Norte A" onChange={() => clearField('name')} className={`${inputClass('name')} placeholder:text-muted-foreground/60`} />
      </FormField>
      <FormField label="Producto" required error={errors.product_id}>
        <select name="product_id" defaultValue={initial?.product_id || ''} onChange={() => clearField('product_id')} className={inputClass('product_id')}>
          <option value="">Seleccione producto...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.unit_measure === 'box' ? 'Caja' : 'Kilo'})
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Superficie (ha)" required error={errors.area}>
        <input name="area" type="number" step="0.01" defaultValue={initial?.area || ''} onChange={() => clearField('area')} className={inputClass('area')} />
      </FormField>
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Paño'}
      </button>
    </form>
  );
}
