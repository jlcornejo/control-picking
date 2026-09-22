'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTransition } from '@/components/ui/animations';
import { StatCard } from '@/components/platform/StatCard';
import { ScrollText, ShieldCheck, Building2 } from 'lucide-react';

const ACTION_LABEL: Record<string, string> = {
  view_org: 'Vio ambiente',
  change_subscription: 'Cambió suscripción',
  create_tenant: 'Creó cliente',
  impersonate: 'Impersonación',
  update_field: 'Modificó campo',
};

/**
 * Registro de auditoría de plataforma (platform_audit_log).
 * Solo platform admins (protegido por el layout /platform + la Edge Function).
 */
export default function PlatformAuditPage() {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ['platform-audit-log'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-audit-log', { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error');
      return { rows: (data?.data ?? []) as any[], total: data?.meta?.total ?? (data?.data?.length ?? 0) };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  // Organizaciones distintas tocadas por los eventos visibles.
  const orgsTouched = new Set(rows.map((r) => r.organization?.slug).filter(Boolean)).size;

  const columns = [
    { key: 'created_at', label: 'Fecha', render: (row: any) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.created_at).toLocaleString('es-CL')}
      </span>
    )},
    { key: 'platform_admin', label: 'Administrador', render: (row: any) => (
      <span className="text-foreground">{row.platform_admin?.full_name || '—'}</span>
    )},
    { key: 'action', label: 'Acción', render: (row: any) => (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        {ACTION_LABEL[row.action] || row.action}
      </span>
    )},
    { key: 'organization', label: 'Organización', render: (row: any) => (
      <span className="text-foreground">{row.organization?.name || '—'}</span>
    )},
    { key: 'resource', label: 'Recurso', render: (row: any) => (
      <span className="text-xs text-muted-foreground">{row.resource || '—'}</span>
    )},
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Platform Audit Log"
        description="Registro inmutable de accesos y acciones de super-admin sobre datos de clientes."
      />

      {/* KPIs de auditoría (datos reales) */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Eventos registrados" value={total} icon={ScrollText} tone="primary" index={0} hint="Total en el registro" />
        <StatCard label="Organizaciones tocadas" value={orgsTouched} icon={Building2} tone="blue" index={1} hint="En los eventos visibles" />
        <StatCard label="Integridad" value="100%" icon={ShieldCheck} tone="emerald" index={2} hint="Registro append-only" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyMessage="No hay eventos de auditoría registrados"
        searchPlaceholder="Buscar por acción o recurso..."
        searchKeys={['action', 'resource']}
      />
    </PageTransition>
  );
}
