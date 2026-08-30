'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

type RoleLabels = Partial<Record<'admin' | 'supervisor' | 'crew_lead' | 'worker', string>>;

/** Configuración operativa de la organización del usuario actual. */
export interface OrgSettings {
  crew_mode_enabled: boolean;
  role_labels: RoleLabels;
}

const DEFAULT_ROLE_LABELS: Record<'admin' | 'supervisor' | 'crew_lead' | 'worker', string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  crew_lead: 'Encargado',
  worker: 'Trabajador',
};

const DEFAULT_SETTINGS: OrgSettings = {
  crew_mode_enabled: false,
  role_labels: {},
};

/**
 * Carga crew_mode_enabled y role_labels de la organización del usuario.
 * Expone un helper roleLabel() que aplica las etiquetas configuradas por
 * la organización con fallback a los nombres por defecto.
 */
export function useOrgSettings() {
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function load() {
      const { data, error } = await supabase
        .from('organizations')
        .select('crew_mode_enabled, role_labels')
        .limit(1)
        .maybeSingle();

      if (!active) return;

      setSettings(
        error || !data
          ? DEFAULT_SETTINGS
          : {
              crew_mode_enabled: data.crew_mode_enabled ?? false,
              role_labels: (data.role_labels as RoleLabels) ?? {},
            },
      );
      setLoading(false);
    }

    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  /** Etiqueta configurable del rol (fallback a nombre por defecto). */
  function roleLabel(role: keyof typeof DEFAULT_ROLE_LABELS): string {
    return settings.role_labels[role] || DEFAULT_ROLE_LABELS[role];
  }

  return { settings, roleLabel, crewModeEnabled: settings.crew_mode_enabled, loading };
}
