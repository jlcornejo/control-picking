'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { StatCard } from '@/components/platform/StatCard';
import { useState } from 'react';
import { Flag, ToggleRight, Zap, Building2, Trash2 } from 'lucide-react';

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

export default function FeatureFlagsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
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

  const columns = [
    { key: 'name', label: 'Flag', render: (row: FeatureFlag) => (
      <div>
        <p className="font-medium text-foreground">{row.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{row.key}</p>
        {row.description && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{row.description}</p>}
      </div>
    )},
    { key: 'category', label: 'Categoría', render: (row: FeatureFlag) => (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground capitalize">{row.category}</span>
    )},
    { key: 'strategy', label: 'Estrategia', render: (row: FeatureFlag) => {
      const cls = row.strategy === 'kill_switch' ? 'bg-red-50 text-red-700 border-red-200'
        : row.strategy === 'global' ? 'bg-blue-50 text-blue-700 border-blue-200'
        : 'bg-muted text-muted-foreground border-border';
      return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{STRATEGY_LABEL[row.strategy]}</span>;
    }},
    { key: 'override_count', label: 'Overrides', render: (row: FeatureFlag) => (
      row.override_count > 0
        ? <span className="text-xs text-foreground tabular-nums">{row.override_enabled_count}/{row.override_count} orgs on</span>
        : <span className="text-xs text-muted-foreground">—</span>
    )},
    { key: 'enabled', label: 'Default global', render: (row: FeatureFlag) => (
      <button
        onClick={() => toggleMutation.mutate(row)}
        disabled={toggleMutation.isPending}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${row.enabled ? 'bg-primary' : 'bg-muted-foreground/30'} disabled:opacity-50`}
        aria-label={row.enabled ? 'Desactivar' : 'Activar'}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${row.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    )},
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Global Feature Flags"
        description="Activación progresiva de funcionalidades, kill-switches y overrides por tenant."
        action={<ActionButton onClick={() => setShowCreate(true)}>+ Nuevo flag</ActionButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Flags registrados" value={stats.total} icon={Flag} tone="primary" index={0} />
        <StatCard label="Activos (default on)" value={stats.enabled} icon={ToggleRight} tone="emerald" index={1} />
        <StatCard label="Kill-switches" value={stats.killSwitches} icon={Zap} tone="amber" index={2} />
        <StatCard label="Con overrides" value={stats.withOverrides} icon={Building2} tone="blue" index={3} />
      </div>

      <DataTable
        columns={columns as any}
        data={flags as any}
        loading={isLoading}
        emptyMessage="No hay feature flags registrados"
        searchPlaceholder="Buscar por nombre o key..."
        searchKeys={['name', 'key', 'category']}
        actions={((row: FeatureFlag) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOverridesFlag(row)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              Overrides
            </button>
            <button
              onClick={() => setEditFlag(row)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent transition-colors"
            >
              Editar
            </button>
          </div>
        )) as any}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo feature flag">
        <FlagForm
          onSuccess={() => { invalidate(); toast('Flag creado', 'success'); }}
          onClose={() => setShowCreate(false)}
        />
      </Modal>

      <Modal open={!!editFlag} onClose={() => setEditFlag(null)} title={`Editar — ${editFlag?.name || ''}`}>
        {editFlag && (
          <FlagForm
            flag={editFlag}
            onSuccess={() => { invalidate(); toast('Flag actualizado', 'success'); }}
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

const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

/** Formulario de crear/editar flag */
function FlagForm({ flag, onSuccess, onClose }: { flag?: FeatureFlag; onSuccess: () => void; onClose: () => void }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!flag;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = (form.get('name') as string).trim();
    const key = (form.get('key') as string || '').trim();
    const description = (form.get('description') as string || '').trim();
    const category = (form.get('category') as string || '').trim();
    const strategy = form.get('strategy') as string;
    const enabled = form.get('enabled') === 'on';

    if (!name) { setError('El nombre es requerido'); return; }
    if (!isEdit && !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(key)) { setError('Key inválido (minúsculas, números y guion bajo)'); return; }

    setLoading(true);
    const body: Record<string, unknown> = { name, description, category, strategy, enabled };
    if (!isEdit) body.key = key;

    const { data, error: fnErr } = await supabase.functions.invoke(
      isEdit ? `platform-feature-flags/${flag!.key}` : 'platform-feature-flags',
      { method: isEdit ? 'PATCH' : 'POST', body },
    );
    setLoading(false);

    if (fnErr || data?.success === false) {
      setError(data?.error?.message || 'Error al guardar el flag');
      return;
    }
    onSuccess();
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Nombre" required>
        <input name="name" defaultValue={flag?.name} className={inputClass} placeholder="Báscula Bluetooth" />
      </FormField>
      {!isEdit && (
        <FormField label="Key" required>
          <input name="key" className={inputClass} placeholder="bluetooth_scale" />
        </FormField>
      )}
      <FormField label="Descripción">
        <textarea name="description" defaultValue={flag?.description ?? ''} rows={2} className={inputClass} placeholder="Qué habilita este flag" />
      </FormField>
      <FormField label="Categoría">
        <input name="category" defaultValue={flag?.category ?? 'general'} className={inputClass} placeholder="cosecha" />
      </FormField>
      <FormField label="Estrategia">
        <select name="strategy" defaultValue={flag?.strategy ?? 'org_override'} className={inputClass}>
          {STRATEGY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </FormField>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="enabled" defaultChecked={flag?.enabled ?? false} className="h-4 w-4 rounded border-border" />
        Activo por defecto (global)
      </label>
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {loading ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear flag'}
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
