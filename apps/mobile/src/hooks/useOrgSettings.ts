import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type Role = 'admin' | 'supervisor' | 'crew_lead' | 'worker';
type RoleLabels = Partial<Record<Role, string>>;

/** Configuración operativa de la organización del usuario actual. */
export interface OrgSettings {
  crew_mode_enabled: boolean;
  role_labels: RoleLabels;
}

const DEFAULT_ROLE_LABELS: Record<Role, string> = {
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
 * Expone roleLabel() con las etiquetas configuradas (fallback a defaults).
 *
 * Usa React Query (`['org-settings']`) para compartir caché entre pantallas
 * (p. ej. el drawer y Configuración) y refrescar la visibilidad de Cuadrillas
 * tras invalidar la clave. Se recarga en cada cambio de sesión
 * (`onAuthStateChange`) para no servir el caché del tenant anterior.
 */
export function useOrgSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async (): Promise<OrgSettings> => {
      const { data: row, error } = await supabase
        .from('organizations')
        .select('crew_mode_enabled, role_labels')
        .limit(1)
        .maybeSingle();

      if (error || !row) return DEFAULT_SETTINGS;
      return {
        crew_mode_enabled: row.crew_mode_enabled ?? false,
        role_labels: (row.role_labels as RoleLabels) ?? {},
      };
    },
  });

  // Recarga por sesión: al cambiar de usuario/tenant se invalida la query para
  // no servir el caché del tenant anterior (hallazgo 3 del diseño).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const settings = data ?? DEFAULT_SETTINGS;

  function roleLabel(role: Role): string {
    return settings.role_labels[role] || DEFAULT_ROLE_LABELS[role];
  }

  return { settings, roleLabel, crewModeEnabled: settings.crew_mode_enabled, loading: isLoading };
}
