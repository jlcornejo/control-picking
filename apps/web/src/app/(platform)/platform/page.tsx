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
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Clock, Ban, Boxes, Users, FileText, Wallet } from 'lucide-react';
import { StatCard } from '@/components/platform/StatCard';
import { formatMoney, formatNumber } from '@/lib/format';

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

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: async () => {
      // Edge Function GET /organizations (solo platform admin; usa service role internamente)
      const { data, error } = await supabase.functions.invoke('organizations', { method: 'GET' });
      if (error) throw error;
      return (data?.data ?? []) as any[];
    },
  });

  const orgs = data || [];

  // Métricas agregadas de plataforma (datos reales, últimos 30 días).
  const { data: metrics } = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-metrics', { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error');
      return data.data as {
        window_days: number;
        harvest: { quantity: number; value: number; records: number };
        active_workers: number;
        settlements: { pending_amount: number; paid_amount: number };
        payments_30d_amount: number;
      };
    },
  });

  // KPIs derivados de datos reales (conteos por estado de suscripción).
  const stats = useMemo(() => {
    const total = orgs.length;
    const active = orgs.filter((o) => o.subscription_status === 'active').length;
    const trial = orgs.filter((o) => o.subscription_status === 'trial').length;
    const suspended = orgs.filter((o) => o.subscription_status === 'suspended').length;
    return { total, active, trial, suspended };
  }, [orgs]);

  const filters = [
    { key: 'all', label: 'Todas', count: stats.total },
    { key: 'active', label: 'Activas', count: stats.active },
    { key: 'trial', label: 'Prueba', count: stats.trial },
    { key: 'suspended', label: 'Suspendidas', count: stats.suspended },
  ];

  const filteredOrgs = useMemo(
    () => (statusFilter === 'all' ? orgs : orgs.filter((o) => o.subscription_status === statusFilter)),
    [orgs, statusFilter],
  );

  const columns = [
    { key: 'name', label: 'Organización & Razón Social', render: (row: any) => (
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
          {row.name?.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{row.slug}</span>
            <span className="mx-1.5 text-border">·</span>
            <span className="font-mono">{String(row.id).slice(0, 8)}</span>
          </p>
        </div>
      </div>
    )},
    { key: 'subscription_status', label: 'Plan / Suscripción', render: (row: any) => {
      const s = row.subscription_status;
      const cls = s === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : s === 'trial' ? 'bg-blue-50 text-blue-700 border-blue-200'
        : s === 'suspended' ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';
      return (
        <div>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{SUB_LABEL[s] || s}</span>
          {row.subscription_plan && <p className="mt-1 text-xs text-muted-foreground">{row.subscription_plan}</p>}
        </div>
      );
    }},
    { key: 'created_at', label: 'Alta', render: (row: any) => (
      <span className="tabular-nums text-xs text-muted-foreground">
        {row.created_at ? new Date(row.created_at).toLocaleDateString('es-CL') : '—'}
      </span>
    )},
    { key: 'status', label: 'Estado', render: (row: any) => <StatusBadge status={row.status} /> },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Organizaciones (Tenants)"
        description="Clientes del SaaS: gestión multi-tenant, suscripciones y acceso de soporte."
        action={<ActionButton onClick={() => setShowCreate(true)}>+ Nuevo cliente</ActionButton>}
      />

      {/* KPIs de plataforma (datos reales) */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tenants en plataforma" value={stats.total} icon={Building2} tone="primary" index={0} hint="Organizaciones registradas" />
        <StatCard label="Suscripciones activas" value={stats.active} icon={CheckCircle2} tone="emerald" index={1} hint="Clientes al día" />
        <StatCard label="En prueba (trial)" value={stats.trial} icon={Clock} tone="blue" index={2} hint="Periodo de evaluación" />
        <StatCard label="Suspendidas" value={stats.suspended} icon={Ban} tone="amber" index={3} hint="Acceso bloqueado" />
      </div>

      {/* KPIs de operación agregada (datos reales, últimos 30 días) */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Cosecha (30 días)"
          value={metrics ? formatNumber(metrics.harvest.quantity) : '—'}
          icon={Boxes}
          tone="primary"
          index={0}
          hint={metrics ? `${formatMoney(metrics.harvest.value)} · ${formatNumber(metrics.harvest.records)} registros` : 'Cargando…'}
        />
        <StatCard
          label="Cosecheros activos"
          value={metrics ? formatNumber(metrics.active_workers) : '—'}
          icon={Users}
          tone="emerald"
          index={1}
          hint="En toda la plataforma"
        />
        <StatCard
          label="Liquidaciones pendientes"
          value={metrics ? formatMoney(metrics.settlements.pending_amount) : '—'}
          icon={FileText}
          tone="amber"
          index={2}
          hint={metrics ? `${formatMoney(metrics.settlements.paid_amount)} ya pagado` : 'Cargando…'}
        />
        <StatCard
          label="Pagos (30 días)"
          value={metrics ? formatMoney(metrics.payments_30d_amount) : '—'}
          icon={Wallet}
          tone="blue"
          index={3}
          hint="Desembolsos recientes"
        />
      </div>

      {/* Filtros por estado de suscripción */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredOrgs}
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
        <CreateOrgForm
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['platform-organizations'] })}
          onClose={() => setShowCreate(false)}
        />
      </Modal>

      <Modal open={!!subOrg} onClose={() => setSubOrg(null)} title={`Suscripción — ${subOrg?.name || ''}`}>
        {subOrg && (
          <SubscriptionForm org={subOrg} onSuccess={() => { setSubOrg(null); queryClient.invalidateQueries({ queryKey: ['platform-organizations'] }); toast('Suscripción actualizada', 'success'); }} />
        )}
      </Modal>
    </PageTransition>
  );
}

interface CreatedCredentials {
  orgName: string;
  email: string;
  password: string;
}

function CreateOrgForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
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
    const adminName = (form.get('admin_name') as string).trim();
    const adminEmail = (form.get('admin_email') as string).trim();
    const adminPassword = (form.get('admin_password') as string) || '';

    if (!name) { setError('El nombre es requerido'); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { setError('Slug inválido (minúsculas, números y guiones)'); return; }
    if (!adminName) { setError('El nombre del administrador es requerido'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) { setError('Email del administrador inválido'); return; }
    if (adminPassword.length < 8) { setError('La contraseña del administrador debe tener al menos 8 caracteres'); return; }

    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke('organizations', {
      method: 'POST',
      body: {
        name,
        slug,
        subscription_status: form.get('subscription_status') || 'trial',
        admin: { full_name: adminName, email: adminEmail, password: adminPassword },
      },
    });
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'Error al crear el cliente');
      return;
    }

    // Refrescar la lista y mostrar las credenciales para entregar al cliente.
    onSuccess();
    setCreated({ orgName: name, email: adminEmail, password: adminPassword });
  }

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  // Pantalla de éxito: credenciales del admin recién creado.
  if (created) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">Cliente creado</p>
          <p className="text-xs text-emerald-700 mt-1">
            Entrega estas credenciales al administrador de <span className="font-medium">{created.orgName}</span>.
            Deberá cambiar la contraseña en su primer inicio de sesión.
          </p>
        </div>
        <div className="rounded-xl bg-muted/30 px-4 py-3 space-y-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-foreground break-all">{created.email}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contraseña inicial</p>
            <p className="text-sm font-mono text-foreground">{created.password}</p>
          </div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5">
          <p className="text-xs text-amber-800">
            Esta contraseña no se volverá a mostrar. Cópiala ahora si la necesitas.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
        >
          Listo
        </button>
      </div>
    );
  }

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

      <div className="pt-2 border-t border-border/60">
        <p className="text-xs font-semibold text-foreground mb-1">Administrador del cliente</p>
        <p className="text-[11px] text-muted-foreground mb-3">
          Cuenta con la que el cliente iniciará sesión. Deberá cambiar la contraseña en su primer acceso.
        </p>
      </div>
      <FormField label="Nombre del administrador" required>
        <input name="admin_name" className={inputClass} placeholder="María Pérez" />
      </FormField>
      <FormField label="Email del administrador" required>
        <input name="admin_email" type="email" className={inputClass} placeholder="admin@camposdelsur.cl" />
      </FormField>
      <FormField label="Contraseña inicial" required>
        <input name="admin_password" type="text" className={inputClass} placeholder="Mínimo 8 caracteres" autoComplete="off" />
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
