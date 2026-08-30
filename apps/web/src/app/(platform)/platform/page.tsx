'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';

const SUBSCRIPTION = [
  { value: 'trial', label: 'Prueba' },
  { value: 'active', label: 'Activa' },
  { value: 'suspended', label: 'Suspendida' },
  { value: 'cancelled', label: 'Cancelada' },
];
const SUB_LABEL: Record<string, string> = Object.fromEntries(SUBSCRIPTION.map((s) => [s.value, s.label]));

export default function PlatformPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [subOrg, setSubOrg] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: async () => {
      // Edge Function GET /organizations (solo platform admin; usa service role internamente)
      const { data, error } = await supabase.functions.invoke('organizations', { method: 'GET' });
      if (error) throw error;
      return (data?.data ?? []) as any[];
    },
  });

  const columns = [
    { key: 'name', label: 'Organización', render: (row: any) => (
      <span className="inline-flex items-center gap-2 font-medium text-foreground">
        <Building2 size={14} className="text-primary" /> {row.name}
      </span>
    )},
    { key: 'slug', label: 'Slug', render: (row: any) => <span className="text-sm text-muted-foreground">{row.slug}</span> },
    { key: 'subscription_status', label: 'Suscripción', render: (row: any) => {
      const s = row.subscription_status;
      const cls = s === 'active' ? 'bg-emerald-50 text-emerald-700'
        : s === 'trial' ? 'bg-blue-50 text-blue-700'
        : s === 'suspended' ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700';
      return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{SUB_LABEL[s] || s}</span>;
    }},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Organizaciones"
        description="Clientes del SaaS y sus suscripciones"
        action={<ActionButton onClick={() => setShowCreate(true)}>+ Nuevo cliente</ActionButton>}
      />

      <DataTable
        columns={columns}
        data={data || []}
        loading={isLoading}
        emptyMessage="No hay organizaciones registradas"
        searchPlaceholder="Buscar por nombre o slug..."
        searchKeys={['name', 'slug']}
        actions={(row: any) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/platform/${row.id}`)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent transition-colors"
            >
              Ver ambiente
            </button>
            <button
              onClick={() => setSubOrg(row)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              Suscripción
            </button>
          </div>
        )}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo cliente">
        <CreateOrgForm onSuccess={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['platform-organizations'] }); toast('Organización creada', 'success'); }} />
      </Modal>

      <Modal open={!!subOrg} onClose={() => setSubOrg(null)} title={`Suscripción — ${subOrg?.name || ''}`}>
        {subOrg && (
          <SubscriptionForm org={subOrg} onSuccess={() => { setSubOrg(null); queryClient.invalidateQueries({ queryKey: ['platform-organizations'] }); toast('Suscripción actualizada', 'success'); }} />
        )}
      </Modal>
    </PageTransition>
  );
}

function CreateOrgForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  function slugify(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = (form.get('name') as string).trim();
    const slug = ((form.get('slug') as string) || slugify(name)).trim();

    if (!name) { setError('El nombre es requerido'); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { setError('Slug inválido (minúsculas, números y guiones)'); return; }

    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke('organizations', {
      method: 'POST',
      body: { name, slug, subscription_status: form.get('subscription_status') || 'trial' },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'Error al crear la organización');
      return;
    }
    setTimeout(onSuccess, 400);
  }

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre de la empresa" required>
        <input name="name" className={inputClass} placeholder="Campos del Sur SpA" />
      </FormField>
      <FormField label="Slug (opcional)">
        <input name="slug" className={inputClass} placeholder="Se genera del nombre si se deja vacío" />
      </FormField>
      <FormField label="Suscripción inicial">
        <select name="subscription_status" defaultValue="trial" className={inputClass}>
          {SUBSCRIPTION.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </FormField>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Creando…' : 'Crear cliente'}
      </button>
    </form>
  );
}

function SubscriptionForm({ org, onSuccess }: { org: any; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const status = form.get('subscription_status') as string;

    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke(`organizations/${org.id}/subscription`, {
      method: 'PATCH',
      body: { subscription_status: status },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'Error al actualizar la suscripción');
      return;
    }
    setTimeout(onSuccess, 400);
  }

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">Suscripción actual</p>
        <p className="text-sm font-semibold text-foreground">{SUB_LABEL[org.subscription_status] || org.subscription_status}</p>
      </div>
      <FormField label="Nuevo estado de suscripción">
        <select name="subscription_status" defaultValue={org.subscription_status} className={inputClass}>
          {SUBSCRIPTION.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </FormField>
      <p className="text-xs text-muted-foreground">
        Suspender o cancelar bloquea el acceso de los usuarios de la organización, pero conserva sus datos.
      </p>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando…' : 'Actualizar suscripción'}
      </button>
    </form>
  );
}
