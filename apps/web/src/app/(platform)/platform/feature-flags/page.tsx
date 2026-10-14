'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { StatCard } from '@/components/platform/StatCard';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Flag, ToggleRight, Zap, Building2, Trash2, Search, Settings2, Pencil } from 'lucide-react';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  strategy: 'global' | 'org_override' | 'kill_switch';
  enabled: boolean;
  override_count: number;
  override_enabled_count: number;
}

const STRATEGY = [
  { value: 'org_override', label: 'Override por tenant' },
  { value: 'global', label: 'Global (mismo valor)' },
  { value: 'kill_switch', label: 'Kill-switch (emergencia)' },
];
const STRATEGY_LABEL: Record<string, string> = Object.fromEntries(STRATEGY.map((s) => [s.value, s.label]));

const STRATEGY_BADGE: Record<FeatureFlag['strategy'], string> = {
  kill_switch: 'bg-red-50 text-red-700 border-red-200',
  global: 'bg-blue-50 text-blue-700 border-blue-200',
  org_override: 'bg-muted text-muted-foreground border-border',
};

export default function FeatureFlagsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editFlag, setEditFlag] = useState<FeatureFlag | null>(null);
  const [overridesFlag, setOverridesFlag] = useState<FeatureFlag | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-feature-flags'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-feature-flags', { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error');
      return (data?.data ?? []) as FeatureFlag[];
    },
  });

  const flags = data || [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['platform-feature-flags'] });

  // Toggle rápido del default global desde la tabla.
  const toggleMutation = useMutation({
    mutationFn: async (flag: FeatureFlag) => {
      const { data, error } = await supabase.functions.invoke(`platform-feature-flags/${flag.key}`, {
        method: 'PATCH',
        body: { enabled: !flag.enabled },
      });
      if (error || data?.success === false) throw new Error(data?.error?.message || 'Error al cambiar el flag');
      return data;
    },
    onSuccess: () => { invalidate(); toast('Flag actualizado', 'success'); },
    onError: (e: any) => toast(e.message || 'No se pudo actualizar', 'error'),
  });

  const stats = {
    total: flags.length,
    enabled: flags.filter((f) => f.enabled).length,
    killSwitches: flags.filter((f) => f.strategy === 'kill_switch').length,
    withOverrides: flags.filter((f) => f.override_count > 0).length,
  };

  const [search, setSearch] = useState('');
  const filteredFlags = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return flags;
    return flags.filter((f) =>
      [f.name, f.key, f.category].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [flags, search]);

  return (
    <PageTransition>
      <PageHeader
        title="Global Feature Flags"
        description="Activación progresiva de funcionalidades, kill-switches y overrides por tenant. El catálogo lo define el equipo de desarrollo: desde aquí se activa/desactiva y se gestionan overrides por organización."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Flags registrados" value={stats.total} icon={Flag} tone="primary" index={0} />
        <StatCard label="Activos (default on)" value={stats.enabled} icon={ToggleRight} tone="emerald" index={1} />
        <StatCard label="Kill-switches" value={stats.killSwitches} icon={Zap} tone="amber" index={2} />
        <StatCard label="Con overrides" value={stats.withOverrides} icon={Building2} tone="blue" index={3} />
      </div>

      {/* Barra de búsqueda */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, key o categoría..."
            className="h-10 w-full rounded-xl border border-border bg-muted/30 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>
        <p className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {filteredFlags.length} flag{filteredFlags.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid de flags */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-border bg-card shadow-sm" />
          ))}
        </div>
      ) : filteredFlags.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Flag size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {flags.length === 0 ? 'No hay feature flags registrados' : 'Ningún flag coincide con la búsqueda'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredFlags.map((flag, i) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              index={i}
              toggling={toggleMutation.isPending}
              onToggle={() => toggleMutation.mutate(flag)}
              onOverrides={() => setOverridesFlag(flag)}
              onEdit={() => setEditFlag(flag)}
            />
          ))}
        </div>
      )}

      <Modal open={!!editFlag} onClose={() => setEditFlag(null)} title={`Editar descripción — ${editFlag?.name || ''}`}>
        {editFlag && (
          <FlagDescriptionForm
            flag={editFlag}
            onSuccess={() => { invalidate(); toast('Descripción actualizada', 'success'); }}
            onClose={() => setEditFlag(null)}
          />
        )}
      </Modal>

      <Modal open={!!overridesFlag} onClose={() => setOverridesFlag(null)} title={`Overrides — ${overridesFlag?.name || ''}`} size="lg">
        {overridesFlag && (
          <OverridesManager
            flag={overridesFlag}
            onChange={invalidate}
          />
        )}
      </Modal>
    </PageTransition>
  );
}

/** Tarjeta de un feature flag en el listado */
function FlagCard({
  flag,
  index,
  toggling,
  onToggle,
  onOverrides,
  onEdit,
}: {
  flag: FeatureFlag;
  index: number;
  toggling: boolean;
  onToggle: () => void;
  onOverrides: () => void;
  onEdit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
      className="glow-card flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      {/* Cabecera: nombre + key, y el toggle de default global */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground" title={flag.name}>{flag.name}</h3>
          <p className="truncate font-mono text-xs text-muted-foreground" title={flag.key}>{flag.key}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            onClick={onToggle}
            disabled={toggling}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${flag.enabled ? 'bg-primary' : 'bg-muted-foreground/30'} disabled:opacity-50`}
            aria-label={flag.enabled ? 'Desactivar default global' : 'Activar default global'}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${flag.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Default global</span>
        </div>
      </div>

      {/* Descripción: hasta 2 líneas, el texto completo en el tooltip */}
      <p
        className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground"
        title={flag.description ?? undefined}
      >
        {flag.description || 'Sin descripción'}
      </p>

      {/* Badges: categoría + estrategia + overrides */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">
          {flag.category}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STRATEGY_BADGE[flag.strategy]}`}>
          {STRATEGY_LABEL[flag.strategy]}
        </span>
        {flag.override_count > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground">
            <Building2 size={12} className="text-muted-foreground" />
            <span className="tabular-nums">{flag.override_enabled_count}/{flag.override_count}</span> orgs on
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin overrides</span>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
        <button
          onClick={onOverrides}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Settings2 size={14} />
          Overrides
        </button>
        <button
          onClick={onEdit}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Pencil size={14} />
          Editar
        </button>
      </div>
    </motion.div>
  );
}

const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

/**
 * Formulario para editar SOLO la descripción de un flag.
 *
 * El catálogo de flags (key, nombre, categoría, estrategia) lo define el equipo de
 * desarrollo por migración/seed, atado al código que consume cada flag. El super-admin
 * no puede crear flags nuevos (serían "flags muertos" sin código que los lea) ni cambiar
 * su identidad; solo ajustar el texto de ayuda, además de activar/desactivar y gestionar
 * overrides por organización desde la tarjeta.
 */
function FlagDescriptionForm({ flag, onSuccess, onClose }: { flag: FeatureFlag; onSuccess: () => void; onClose: () => void }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const description = (form.get('description') as string || '').trim();

    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke(
      `platform-feature-flags/${flag.key}`,
      { method: 'PATCH', body: { description } },
    );
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'Error al guardar la descripción');
      return;
    }
    onSuccess();
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Identidad del flag: solo lectura (la define el equipo de desarrollo) */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{flag.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{flag.key}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">{flag.category}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STRATEGY_BADGE[flag.strategy]}`}>{STRATEGY_LABEL[flag.strategy]}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          El nombre, key, categoría y estrategia los define el código. Aquí solo editas el texto de ayuda.
        </p>
      </div>

      <FormField label="Descripción">
        <textarea name="description" defaultValue={flag.description ?? ''} rows={3} className={inputClass} placeholder="Qué habilita este flag" />
      </FormField>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando…' : 'Guardar descripción'}
      </button>
    </form>
  );
}

/** Gestor de overrides por organización de un flag */
function OverridesManager({ flag, onChange }: { flag: FeatureFlag; onChange: () => void }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: orgs } = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('organizations', { method: 'GET' });
      if (error) throw error;
      return (data?.data ?? []) as any[];
    },
  });

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['feature-flag-overrides', flag.key],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`platform-feature-flags/${flag.key}/overrides`, { method: 'GET' });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || 'Error');
      return (data?.data ?? []) as any[];
    },
  });

  const overrideByOrg: Record<string, { enabled: boolean }> = {};
  for (const o of overrides || []) overrideByOrg[o.organization_id] = { enabled: o.enabled };

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['feature-flag-overrides', flag.key] });
    onChange();
  }

  async function setOverride(orgId: string, enabled: boolean) {
    const { data, error } = await supabase.functions.invoke(`platform-feature-flags/${flag.key}/overrides/${orgId}`, {
      method: 'PUT',
      body: { enabled },
    });
    if (error || data?.success === false) { toast(data?.error?.message || 'Error', 'error'); return; }
    refresh();
    toast('Override aplicado', 'success');
  }

  async function clearOverride(orgId: string) {
    const { data, error } = await supabase.functions.invoke(`platform-feature-flags/${flag.key}/overrides/${orgId}`, {
      method: 'DELETE',
    });
    if (error || data?.success === false) { toast(data?.error?.message || 'Error', 'error'); return; }
    refresh();
    toast('Override eliminado (hereda global)', 'success');
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Default global: <span className={`font-medium ${flag.enabled ? 'text-emerald-600' : 'text-foreground'}`}>{flag.enabled ? 'Activo' : 'Inactivo'}</span>.
          Sin override, cada organización hereda este valor.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {(orgs || []).map((org: any) => {
            const ov = overrideByOrg[org.id];
            const effective = ov ? ov.enabled : flag.enabled;
            return (
              <div key={org.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ov ? <span className="text-primary">Override: {ov.enabled ? 'on' : 'off'}</span> : <span>Hereda global ({flag.enabled ? 'on' : 'off'})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOverride(org.id, !effective)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${effective ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    aria-label="Alternar override"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${effective ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  {ov && (
                    <button
                      onClick={() => clearOverride(org.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label="Quitar override"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
