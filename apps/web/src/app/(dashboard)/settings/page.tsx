'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/components/ui/Toast';
import { PageTransition } from '@/components/ui/animations';
import { notifyBrandingUpdated } from '@/hooks/useBranding';
import { useState, useEffect } from 'react';
import { Palette, Users, Tag } from 'lucide-react';

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Paletas prediseñadas (punto de partida). El cliente puede ajustar libremente
// después con el color picker.
const BRAND_PRESETS: { name: string; primary: string; secondary: string }[] = [
  { name: 'Verde Agro', primary: '#1b5e20', secondary: '#4caf50' },
  { name: 'Arándano', primary: '#3730a3', secondary: '#6366f1' },
  { name: 'Cereza', primary: '#9f1239', secondary: '#fb7185' },
  { name: 'Cítrico', primary: '#c2410c', secondary: '#fb923c' },
  { name: 'Océano', primary: '#0e7490', secondary: '#22d3ee' },
  { name: 'Vid', primary: '#6b21a8', secondary: '#c084fc' },
  { name: 'Tierra', primary: '#78350f', secondary: '#d97706' },
  { name: 'Pizarra', primary: '#334155', secondary: '#94a3b8' },
];

const ROLE_KEYS = ['admin', 'supervisor', 'crew_lead', 'worker'] as const;
const ROLE_DEFAULTS: Record<(typeof ROLE_KEYS)[number], string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  crew_lead: 'Encargado',
  worker: 'Trabajador',
};

export default function SettingsPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: org, isLoading } = useQuery({
    queryKey: ['my-organization'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, logo_url, brand_primary_color, brand_secondary_color, crew_mode_enabled, role_labels')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!org?.id) throw new Error('no org');
      const { error } = await supabase.from('organizations').update(updates).eq('id', org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organization'] });
      queryClient.invalidateQueries({ queryKey: ['branding'] });
      // Re-aplica los colores/logo de marca al instante (sin recargar).
      notifyBrandingUpdated();
      toast('Configuración guardada', 'success');
    },
    onError: () => toast('Error al guardar', 'error'),
  });

  if (isLoading) {
    return (
      <PageTransition>
        <PageHeader title="Configuración" description="Marca, jerarquía y modo de operación" />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageHeader title="Configuración" description="Marca, jerarquía y modo de operación de tu empresa" />
      <div className="space-y-6 max-w-2xl">
        <BrandingCard org={org} onSave={(u) => save.mutate(u)} saving={save.isPending} />
        <CrewModeCard org={org} onSave={(u) => save.mutate(u)} saving={save.isPending} />
        <RoleLabelsCard org={org} onSave={(u) => save.mutate(u)} saving={save.isPending} />
      </div>
    </PageTransition>
  );
}

function Card({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white/60 p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function BrandingCard({ org, onSave, saving }: { org: any; onSave: (u: Record<string, unknown>) => void; saving: boolean }) {
  const [name, setName] = useState(org?.name ?? '');
  const [logoUrl, setLogoUrl] = useState(org?.logo_url ?? '');
  const [primary, setPrimary] = useState(org?.brand_primary_color ?? '#1b5e20');
  const [secondary, setSecondary] = useState(org?.brand_secondary_color ?? '#4caf50');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) { setErr('El nombre es requerido'); return; }
    if (primary && !HEX_RE.test(primary)) { setErr('Color primario inválido (#RRGGBB)'); return; }
    if (secondary && !HEX_RE.test(secondary)) { setErr('Color secundario inválido (#RRGGBB)'); return; }
    setErr(null);
    onSave({
      name: name.trim(),
      logo_url: logoUrl.trim() || null,
      brand_primary_color: primary || null,
      brand_secondary_color: secondary || null,
    });
  }

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  return (
    <Card icon={<Palette size={18} />} title="Marca" description="Nombre, logo y colores de tu empresa">
      <div className="space-y-4">
        <FormField label="Nombre visible" required error={err && err.includes('nombre') ? err : undefined}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="URL del logo">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className={inputClass} />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Paletas</p>
          <div className="flex flex-wrap gap-2">
            {BRAND_PRESETS.map((p) => {
              const selected = primary.toLowerCase() === p.primary.toLowerCase() && secondary.toLowerCase() === p.secondary.toLowerCase();
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => { setPrimary(p.primary); setSecondary(p.secondary); setErr(null); }}
                  title={p.name}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition-all ${
                    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="flex">
                    <span className="h-4 w-4 rounded-l-full" style={{ backgroundColor: p.primary }} />
                    <span className="h-4 w-4 rounded-r-full" style={{ backgroundColor: p.secondary }} />
                  </span>
                  <span className="text-foreground">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Color primario" error={err && err.includes('primario') ? err : undefined}>
            <div className="flex items-center gap-2">
              <input type="color" value={HEX_RE.test(primary) ? primary.slice(0, 7) : '#1b5e20'} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-12 rounded-lg border border-border" />
              <input value={primary} onChange={(e) => setPrimary(e.target.value)} className={inputClass} />
            </div>
          </FormField>
          <FormField label="Color secundario" error={err && err.includes('secundario') ? err : undefined}>
            <div className="flex items-center gap-2">
              <input type="color" value={HEX_RE.test(secondary) ? secondary.slice(0, 7) : '#4caf50'} onChange={(e) => setSecondary(e.target.value)} className="h-10 w-12 rounded-lg border border-border" />
              <input value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inputClass} />
            </div>
          </FormField>
        </div>
        <button onClick={submit} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
          {saving ? 'Guardando…' : 'Guardar marca'}
        </button>
      </div>
    </Card>
  );
}

function CrewModeCard({ org, onSave, saving }: { org: any; onSave: (u: Record<string, unknown>) => void; saving: boolean }) {
  const [enabled, setEnabled] = useState<boolean>(!!org?.crew_mode_enabled);

  useEffect(() => { setEnabled(!!org?.crew_mode_enabled); }, [org?.crew_mode_enabled]);

  return (
    <Card icon={<Users size={18} />} title="Modo Capataz" description="Activa la figura del Encargado y las cuadrillas">
      <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Usar cuadrillas y encargados</p>
          <p className="text-xs text-muted-foreground">
            Cuando está activo, los campos pueden operar con un encargado que gestiona y paga a su cuadrilla.
            Puedes sobreescribir esto por campo en la sección Campos.
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const val = e.target.checked;
              setEnabled(val);
              onSave({ crew_mode_enabled: val });
            }}
            disabled={saving}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-gray-300 peer-checked:bg-primary transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5"></div>
        </label>
      </div>
    </Card>
  );
}

function RoleLabelsCard({ org, onSave, saving }: { org: any; onSave: (u: Record<string, unknown>) => void; saving: boolean }) {
  const initial = (org?.role_labels ?? {}) as Record<string, string>;
  const [labels, setLabels] = useState<Record<string, string>>(initial);

  const inputClass = 'block w-full rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all';

  function submit() {
    // Solo guardar etiquetas no vacías; las vacías usan el default.
    const clean: Record<string, string> = {};
    for (const k of ROLE_KEYS) {
      const v = (labels[k] ?? '').trim();
      if (v) clean[k] = v;
    }
    onSave({ role_labels: clean });
  }

  return (
    <Card icon={<Tag size={18} />} title="Etiquetas de rol" description="Personaliza cómo se muestran los roles en tu empresa (no cambia la seguridad)">
      <div className="space-y-3">
        {ROLE_KEYS.map((k) => (
          <FormField key={k} label={`${ROLE_DEFAULTS[k]} (por defecto)`}>
            <input
              value={labels[k] ?? ''}
              placeholder={ROLE_DEFAULTS[k]}
              onChange={(e) => setLabels({ ...labels, [k]: e.target.value })}
              className={inputClass}
            />
          </FormField>
        ))}
        <button onClick={submit} disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
          {saving ? 'Guardando…' : 'Guardar etiquetas'}
        </button>
      </div>
    </Card>
  );
}
