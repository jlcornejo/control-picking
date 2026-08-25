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
import { z } from 'zod';
import { Box, Scale } from 'lucide-react';
import { PageTransition } from '@/components/ui/animations';

export default function ProductsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editProduct, setEditProduct] = useState<any | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<any | null>(null);
  const [rateProduct, setRateProduct] = useState<any | null>(null);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, rates(amount, status), blocks(name, status, fields(name))')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (product: any) => {
      const newStatus = product.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('products').update({ status: newStatus }).eq('id', product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast('Estado actualizado', 'success');
      setDeleteProduct(null);
    },
    onError: () => toast('Error al actualizar', 'error'),
  });

  const columns = [
    { key: 'name', label: 'Producto' },
    { key: 'unit_measure', label: 'Unidad', render: (row: any) => (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        {row.unit_measure === 'box' ? <><Box size={12} className="text-amber-600" /> Caja</> : <><Scale size={12} className="text-blue-600" /> Kilo</>}
      </span>
    )},
    {
      key: 'blocks',
      label: 'Usado en',
      sortable: false,
      render: (row: any) => {
        const activeBlocks = (row.blocks || []).filter((b: any) => b.status === 'active');
        if (activeBlocks.length === 0) return <span className="text-muted-foreground text-xs">Sin asignar</span>;
        const fieldNames = [...new Set(activeBlocks.map((b: any) => b.fields?.name).filter(Boolean))] as string[];
        return (
          <div className="flex flex-wrap gap-1 max-w-[250px]">
            {fieldNames.map((f: string) => {
              const blocksInField = activeBlocks.filter((b: any) => b.fields?.name === f);
              return (
                <span key={f} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700" title={blocksInField.map((b: any) => b.name).join(', ')}>
                  {f} <span className="text-emerald-500">({blocksInField.length})</span>
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'rates',
      label: 'Tarifa vigente',
      render: (row: any) => {
        const currentRate = row.rates?.find((r: any) => r.status === 'current');
        return currentRate
          ? <span className="font-semibold text-foreground tabular-nums">${currentRate.amount}</span>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Productos"
        description="Cultivos y sus tarifas de recolección"
        action={
          <ActionButton onClick={() => setShowCreate(true)}>
            + Nuevo Producto
          </ActionButton>
        }
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay productos registrados"
        searchPlaceholder="Buscar productos..."
        searchKeys={['name']}
        actions={(row: any) => (
          <>
            <button onClick={() => setRateProduct(row)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors" title="Gestionar tarifas">
              $
            </button>
            <button onClick={() => setEditProduct(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button onClick={() => setDeleteProduct(row)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title={row.status === 'active' ? 'Desactivar' : 'Activar'}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </button>
          </>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Producto">
        <ProductForm onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['products'] }); toast('Producto creado', 'success'); }} />
      </Modal>

      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title="Editar Producto">
        {editProduct && (
          <ProductForm initial={editProduct} onSuccess={() => { setEditProduct(null); queryClient.invalidateQueries({ queryKey: ['products'] }); toast('Producto actualizado', 'success'); }} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteProduct}
        onClose={() => setDeleteProduct(null)}
        onConfirm={() => deleteProduct && toggleStatus.mutate(deleteProduct)}
        title={deleteProduct?.status === 'active' ? 'Desactivar producto' : 'Activar producto'}
        message={`¿Estás seguro de ${deleteProduct?.status === 'active' ? 'desactivar' : 'activar'} "${deleteProduct?.name}"?`}
        confirmLabel={deleteProduct?.status === 'active' ? 'Desactivar' : 'Activar'}
        variant={deleteProduct?.status === 'active' ? 'danger' : 'default'}
        loading={toggleStatus.isPending}
      />

      <Modal open={!!rateProduct} onClose={() => setRateProduct(null)} title={`Tarifas — ${rateProduct?.name || ''}`} size="lg">
        {rateProduct && (
          <RateManager productId={rateProduct.id} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['products'] })} />
        )}
      </Modal>
    </PageTransition>
  );
}

function ProductForm({ onSuccess, initial }: { onSuccess: () => void; initial?: any }) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  const productSchema = z.object({
    name: z.string().min(1, 'Nombre es requerido').max(100, 'Máximo 100 caracteres'),
    unit_measure: z.enum(['box', 'kg'], { required_error: 'Seleccione unidad' }),
    rate: z.coerce.number().min(0, 'Tarifa no puede ser negativa').optional(),
  });

  const { errors, validate, clearField } = useFormValidation({ schema: productSchema });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const raw = {
      name: form.get('name') as string,
      unit_measure: form.get('unit_measure') as string,
      rate: (form.get('rate') as string) || '0',
    };

    const result = validate(raw);
    if (!result.success) return;

    setLoading(true);

    if (initial) {
      const { error } = await supabase.from('products').update({
        name: result.data.name,
        unit_measure: result.data.unit_measure,
      }).eq('id', initial.id);
      if (error) { toast('Error al actualizar', 'error'); setLoading(false); return; }
    } else {
      const { data: product, error: pErr } = await supabase.from('products').insert({
        name: result.data.name,
        unit_measure: result.data.unit_measure,
      }).select().single();

      if (pErr || !product) { toast('Error al crear', 'error'); setLoading(false); return; }

      if (result.data.rate && result.data.rate > 0) {
        await supabase.from('rates').insert({
          product_id: product.id,
          amount: result.data.rate,
          status: 'current',
        });
      }
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
      <FormField label="Unidad de medida" required error={errors.unit_measure}>
        <select name="unit_measure" defaultValue={initial?.unit_measure || 'box'} onChange={() => clearField('unit_measure')} className={inputClass('unit_measure')}>
          <option value="box">Caja</option>
          <option value="kg">Kilo</option>
        </select>
      </FormField>
      {!initial && (
        <FormField label="Tarifa inicial ($)" error={errors.rate}>
          <input name="rate" type="number" step="0.01" min="0" placeholder="Opcional" onChange={() => clearField('rate')} className={`${inputClass('rate')} placeholder:text-muted-foreground/60`} />
        </FormField>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Producto'}
      </button>
    </form>
  );
}

function RateManager({ productId, onUpdate }: { productId: string; onUpdate: () => void }) {
  const [newRate, setNewRate] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rates, isLoading, refetch } = useQuery({
    queryKey: ['rates', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rates')
        .select('id, amount, status, effective_from, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleSetRate(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(newRate);
    if (!amount || amount <= 0) { toast('Ingrese un monto válido', 'error'); return; }

    setLoading(true);

    // Mark current rate as historical
    await supabase
      .from('rates')
      .update({ status: 'historical' })
      .eq('product_id', productId)
      .eq('status', 'current');

    // Insert new current rate
    const { error } = await supabase.from('rates').insert({
      product_id: productId,
      amount,
      status: 'current',
    });

    setLoading(false);
    if (error) { toast('Error al actualizar tarifa', 'error'); return; }

    setNewRate('');
    toast('Tarifa actualizada', 'success');
    refetch();
    onUpdate();
  }

  const currentRate = (rates || []).find(r => r.status === 'current');
  const historicalRates = (rates || []).filter(r => r.status === 'historical');

  return (
    <div className="space-y-5">
      {/* Current rate */}
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">Tarifa vigente</p>
        <p className="text-3xl font-bold text-emerald-800 tabular-nums">
          {currentRate ? `$${Number(currentRate.amount).toLocaleString()}` : 'Sin tarifa'}
        </p>
        {currentRate && (
          <p className="text-xs text-emerald-600 mt-1">
            Desde {new Date(currentRate.created_at).toLocaleDateString('es-CL')}
          </p>
        )}
      </div>

      {/* New rate form */}
      <form onSubmit={handleSetRate} className="flex gap-2">
        <input
          type="number"
          step="1"
          min="1"
          value={newRate}
          onChange={(e) => setNewRate(e.target.value)}
          placeholder="Nueva tarifa ($)"
          className="flex-1 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !newRate}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all whitespace-nowrap"
        >
          {loading ? '...' : 'Actualizar'}
        </button>
      </form>

      {/* History */}
      {historicalRates.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Historial</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Monto</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historicalRates.map((r) => (
                  <tr key={r.id} className="text-muted-foreground">
                    <td className="px-4 py-2 tabular-nums">${Number(r.amount).toLocaleString()}</td>
                    <td className="px-4 py-2 tabular-nums">{new Date(r.created_at).toLocaleDateString('es-CL')}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-500/10">
                        Histórica
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground text-center">Cargando historial...</p>}
    </div>
  );
}
