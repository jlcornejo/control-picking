'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

/** Branding resuelto para la organización del usuario actual. */
export interface Branding {
  name: string;
  logo_url: string | null;
  brand_primary_color: string;
  brand_secondary_color: string;
}

// Debe coincidir con DEFAULT_BRANDING de @fundo360/shared.
const DEFAULT_BRANDING: Branding = {
  name: 'Fundo360',
  logo_url: null,
  brand_primary_color: '#1b5e20',
  brand_secondary_color: '#4caf50',
};

/**
 * Carga el branding de la organización del usuario autenticado.
 * RLS garantiza que un miembro solo puede leer su propia organización.
 * Aplica los colores como CSS custom properties en :root.
 */
export function useBranding() {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function load() {
      const { data, error } = await supabase
        .from('organizations')
        .select('name, logo_url, brand_primary_color, brand_secondary_color')
        .limit(1)
        .maybeSingle();

      if (!active) return;

      const resolved: Branding = error || !data
        ? DEFAULT_BRANDING
        : {
            name: data.name ?? DEFAULT_BRANDING.name,
            logo_url: data.logo_url ?? DEFAULT_BRANDING.logo_url,
            brand_primary_color: data.brand_primary_color ?? DEFAULT_BRANDING.brand_primary_color,
            brand_secondary_color: data.brand_secondary_color ?? DEFAULT_BRANDING.brand_secondary_color,
          };

      setBranding(resolved);
      applyCssVars(resolved);
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

/** Aplica los colores de marca como CSS custom properties. */
function applyCssVars(b: Branding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', b.brand_primary_color);
  root.style.setProperty('--brand-secondary', b.brand_secondary_color);
}
