'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageTransition } from '@/components/ui/animations';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, Users, MapPin, Package, Truck, ClipboardList, FileText, Wallet, ArrowLeft, Eye } from 'lucide-react';
import { StatCard } from '@/components/platform/StatCard';
import { formatMoney, formatNumber } from '@/lib/format';

const SUB_LABEL: Record<string, string> = {
  trial: 'Prueba', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada',
};
const ROLE_LABEL: Record<string, string> = {
  admin: 'Administradores', supervisor: 'Supervisores', crew_lead: 'Encargados', worker: 'Trabajadores',
};

/**
 * Vista de soporte del ambiente de una organización (solo-lectura).
 * El acceso queda registrado en platform_audit_log (impersonación de soporte).
 */
export default function PlatformOrgViewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const orgId = params.orgId as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-org-view', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`platform-org-view/${orgId}`, { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error');
      return data.data;
    },
  });

  const counts = data?.counts || {};
  const roleCounts = data?.role_counts || {};

  const cards: { label: string; value: number; icon: typeof Users; tone: 'primary' | 'emerald' | 'blue' | 'amber' | 'red' }[] = [
    { label: 'Trabajadores', value: counts.workers, icon: Users, tone: 'primary' },
    { label: 'Campos', value: counts.fields, icon: MapPin, tone: 'emerald' },
    { label: 'Productos', value: counts.products, icon: Package, tone: 'blue' },
    { label: 'Cuadrillas', value: counts.crews, icon: Truck, tone: 'amber' },
    { label: 'Registros de picking', value: counts.picking_records, icon: ClipboardList, tone: 'primary' },
    { label: 'Liquidaciones', value: counts.settlements, icon: FileText, tone: 'blue' },
    { label: 'Pagos', value: counts.payments, icon: Wallet, tone: 'emerald' },
  ];

  return (
    <PageTransition>
      <button onClick={() => router.push('/platform')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={15} /> Volver a organizaciones
      </button>

      <PageHeader
        title={data?.organization?.name || 'Organización'}
        description="Vista de soporte (solo lectura). Este acceso queda registrado en la auditoría."
      />

      {/* Banner: sesión de inspección auditada */}
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <FileText size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-800">Sesión de inspección auditada</p>
          <p className="text-xs text-amber-700">
            Toda consulta a los datos de esta organización queda registrada en el Platform Audit Log. Vista de solo lectura.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {error && <p className="text-sm text-red-600">No se pudo cargar la organización.</p>}

      {data && (
        <div className="space-y-6">
          {/* Datos de la organización */}
          <section className="rounded-2xl border border-border bg-white/60 p-5">
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Building2 size={16} /> <span className="text-sm font-medium">Datos de la organización</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div><dt className="text-xs text-muted-foreground">Slug</dt><dd className="text-foreground">{data.organization.slug}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Suscripción</dt><dd className="text-foreground">{SUB_LABEL[data.organization.subscription_status] || data.organization.subscription_status}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Modo Capataz</dt><dd className="text-foreground">{data.organization.crew_mode_enabled ? 'Activo' : 'Inactivo'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Estado</dt><dd className="text-foreground">{data.organization.status}</dd></div>
            </dl>
          </section>

          {/* Resumen de operación */}
          <section>
            <p className="mb-3 text-sm font-medium text-foreground">Resumen de operación</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cards.map((c, i) => (
                <StatCard key={c.label} label={c.label} value={c.value ?? 0} icon={c.icon} tone={c.tone} index={i} />
              ))}
            </div>
          </section>

          {/* Jerarquía (distribución de roles) */}
          <section className="rounded-2xl border border-border bg-white/60 p-5">
            <p className="mb-3 text-sm font-medium text-foreground">Jerarquía de usuarios</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(roleCounts).length === 0 ? (
                <span className="text-sm text-muted-foreground">Sin usuarios</span>
              ) : (
                Object.entries(roleCounts).map(([role, n]) => (
                  <span key={role} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1 text-xs font-medium text-foreground">
                    {ROLE_LABEL[role] || role} <span className="text-muted-foreground tabular-nums">{n as number}</span>
                  </span>
                ))
              )}
            </div>
          </section>

          {/* Detalle de soporte (solo-lectura, navegable por pestañas) */}
          <SupportDetail orgId={orgId} />
        </div>
      )}
    </PageTransition>
  );
}

type ResourceKey = 'workers' | 'fields' | 'settlements' | 'recent-picking';

const TABS: { key: ResourceKey; label: string; icon: typeof Users }[] = [
  { key: 'workers', label: 'Trabajadores', icon: Users },
  { key: 'fields', label: 'Campos', icon: MapPin },
  { key: 'settlements', label: 'Liquidaciones', icon: FileText },
  { key: 'recent-picking', label: 'Picking reciente', icon: ClipboardList },
];

const SETTLEMENT_STATUS: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' };
const ROLE_SHORT: Record<string, string> = { admin: 'Admin', supervisor: 'Supervisor', crew_lead: 'Encargado', worker: 'Trabajador' };

/** Navegador de detalle en solo-lectura del cliente (modo soporte). */
function SupportDetail({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const [tab, setTab] = useState<ResourceKey>('workers');

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-org-detail', orgId, tab],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`platform-org-detail/${orgId}/${tab}`, { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error');
      return { rows: (data?.data ?? []) as any[], total: data?.meta?.total ?? 0 };
    },
  });

  const rows = data?.rows ?? [];

  const columnsByTab: Record<ResourceKey, any[]> = {
    workers: [
      { key: 'full_name', label: 'Nombre', render: (r: any) => <span className="font-medium text-foreground">{r.full_name}</span> },
      { key: 'role', label: 'Rol', render: (r: any) => <span className="text-sm text-muted-foreground">{ROLE_SHORT[r.role] || r.role}</span> },
      { key: 'phone', label: 'Teléfono', render: (r: any) => <span className="text-sm text-muted-foreground">{r.phone || '—'}</span> },
      { key: 'status', label: 'Estado', render: (r: any) => <StatusBadge status={r.status} /> },
    ],
    fields: [
      { key: 'name', label: 'Campo', render: (r: any) => <span className="font-medium text-foreground">{r.name}</span> },
      { key: 'location', label: 'Ubicación', render: (r: any) => <span className="text-sm text-muted-foreground">{r.location || '—'}</span> },
      { key: 'total_area', label: 'Superficie (ha)', render: (r: any) => <span className="tabular-nums text-sm text-foreground">{formatNumber(r.total_area)}</span> },
      { key: 'status', label: 'Estado', render: (r: any) => <StatusBadge status={r.status} /> },
    ],
    settlements: [
      { key: 'worker', label: 'Trabajador', render: (r: any) => <span className="font-medium text-foreground">{r.worker?.full_name || '—'}</span> },
      { key: 'period', label: 'Período', render: (r: any) => <span className="tabular-nums text-xs text-muted-foreground">{r.period_start} → {r.period_end}</span> },
      { key: 'total_amount', label: 'Monto', render: (r: any) => <span className="tabular-nums text-sm text-foreground">{formatMoney(r.total_amount)}</span> },
      { key: 'status', label: 'Estado', render: (r: any) => <span className="text-sm text-muted-foreground">{SETTLEMENT_STATUS[r.status] || r.status}</span> },
    ],
    'recent-picking': [
      { key: 'worker', label: 'Trabajador', render: (r: any) => <span className="font-medium text-foreground">{r.worker?.full_name || '—'}</span> },
      { key: 'quantity', label: 'Cantidad', render: (r: any) => <span className="tabular-nums text-sm text-foreground">{formatNumber(r.quantity)}</span> },
      { key: 'work_day', label: 'Jornada', render: (r: any) => <span className="tabular-nums text-xs text-muted-foreground">{r.work_day}</span> },
      { key: 'value', label: 'Valor', render: (r: any) => <span className="tabular-nums text-sm text-foreground">{formatMoney((Number(r.quantity) || 0) * (Number(r.rate_amount_snapshot) || 0))}</span> },
    ],
  };

  return (
    <section className="rounded-2xl border border-border bg-white/60 p-5">
      <div className="mb-4 flex items-center gap-2 text-primary">
        <Eye size={16} /> <span className="text-sm font-medium">Modo soporte — datos del cliente (solo lectura)</span>
      </div>

      {/* Pestañas */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="text-sm text-red-600">No se pudo cargar el detalle.</p>
      ) : (
        <DataTable
          columns={columnsByTab[tab]}
          data={rows}
          loading={isLoading}
          searchable={false}
          emptyMessage="Sin registros"
        />
      )}
    </section>
  );
}
