import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Branding resuelto para la organización del usuario actual. */
export interface Branding {
  name: string;
  logo_url: string | null;
  brand_primary_color: string;
  brand_secondary_color: string;
}

// Defaults locales (evita acoplar el paquete shared al bundler de Expo).
// Deben coincidir con DEFAULT_BRANDING de @fundo360/shared.
const DEFAULT_BRANDING: Branding = {
  name: 'Fundo360',
  logo_url: null,
  brand_primary_color: '#1b5e20',
  brand_secondary_color: '#4caf50',
};

/**
 * Carga el branding de la organización del usuario autenticado.
 * RLS garantiza que un miembro solo puede leer su propia organización.
 * Si no hay sesión u organización, devuelve el branding por defecto.
 */
export function useBranding() {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from('organizations')
        .select('name, logo_url, brand_primary_color, brand_secondary_color')
        .limit(1)
        .maybeSingle();

      if (!active) return;

      if (error || !data) {
        setBranding(DEFAULT_BRANDING);
      } else {
        setBranding({
          name: data.name ?? DEFAULT_BRANDING.name,
          logo_url: data.logo_url ?? DEFAULT_BRANDING.logo_url,
          brand_primary_color: data.brand_primary_color ?? DEFAULT_BRANDING.brand_primary_color,
          brand_secondary_color: data.brand_secondary_color ?? DEFAULT_BRANDING.brand_secondary_color,
        });
      }
      setLoading(false);
    }

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { branding, loading };
}
