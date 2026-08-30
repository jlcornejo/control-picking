'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTransition } from '@/components/ui/animations';
import { useParams, useRouter } from 'next/navigation';
import { Building2, Users, MapPin, Package, Truck, ClipboardList, FileText, Wallet, ArrowLeft } from 'lucide-react';

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

  const cards = [
    { label: 'Trabajadores', value: counts.workers, icon: Users },
    { label: 'Campos', value: counts.fields, icon: MapPin },
    { label: 'Productos', value: counts.products, icon: Package },
    { label: 'Cuadrillas', value: counts.crews, icon: Truck },
    { label: 'Registros de picking', value: counts.picking_records, icon: ClipboardList },
    { label: 'Liquidaciones', value: counts.settlements, icon: FileText },
    { label: 'Pagos', value: counts.payments, icon: Wallet },
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
              {cards.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.label} className="rounded-2xl border border-border bg-white/60 p-4">
                    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                      <Icon size={14} /> <span className="text-xs">{c.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{c.value ?? 0}</p>
                  </div>
                );
              })}
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
        </div>
      )}
    </PageTransition>
  );
}
