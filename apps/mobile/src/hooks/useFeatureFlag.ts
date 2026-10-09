import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Resuelve el valor efectivo de un feature flag para la organización actual.
 *
 * Modelo de resolución (igual que en la base de datos):
 *   1) Si existe override en organization_feature_flags para (org, flag) →
 *      manda override.enabled.
 *   2) Si no hay override → manda platform_feature_flags.enabled (default global).
 *
 * RLS garantiza que solo se lean el catálogo global y los overrides de la
 * organización del usuario. El resultado se cachea con TanStack Query.
 */
export function useFeatureFlag(key: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['feature-flag', key],
    queryFn: async () => {
      // Default global del catálogo.
      const { data: globalFlag } = await supabase
        .from('platform_feature_flags')
        .select('enabled')
        .eq('key', key)
        .maybeSingle();

      // Override de la organización (si existe).
      const { data: override } = await supabase
        .from('organization_feature_flags')
        .select('enabled')
        .eq('flag_key', key)
        .maybeSingle();

      if (override) return override.enabled as boolean;
      return (globalFlag?.enabled as boolean) ?? false;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { enabled: data ?? false, loading: isLoading };
}
