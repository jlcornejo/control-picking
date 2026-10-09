import { useQuery } from '@tanstack/react-query';
import { hasCapability, type Capability } from '@fundo360/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Capacidades efectivas del usuario actual (RBAC configurable, KAN-5).
 *
 * Lee el perfil de permisos asignado al worker (si tiene). Un worker SIN perfil
 * conserva todas las capacidades de su rol → `has()` devuelve true para todo.
 * Con perfil, solo las capacidades listadas están habilitadas.
 *
 * Esto es gating de UI (ocultar/deshabilitar); la barrera real es el backend
 * (requirePermission) y, en Fase B, RLS con has_permission().
 */
export function usePermissions() {
  const { worker } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-permissions', worker?.id],
    enabled: !!worker?.id,
    queryFn: async (): Promise<Capability[] | null> => {
      // Traer el perfil asignado al worker (si lo tiene).
      const { data: w } = await supabase
        .from('workers')
        .select('permission_profile_id, permission_profiles(capabilities, status)')
        .eq('id', worker!.id)
        .maybeSingle();

      const profile = (w as any)?.permission_profiles;
      // Sin perfil o perfil inactivo → sin restricción (null = capacidades completas).
      if (!w?.permission_profile_id || !profile || profile.status !== 'active') return null;
      return (profile.capabilities as Capability[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // undefined mientras carga → tratamos como sin restricción para no ocultar UI
  // prematuramente; el backend igual protege.
  const capabilities = data ?? null;

  return {
    /** Capacidades del perfil, o null si no hay restricción. */
    capabilities,
    /** true si el usuario puede ejecutar la capacidad. */
    has: (cap: Capability) => hasCapability(capabilities, cap),
    loading: isLoading,
  };
}
