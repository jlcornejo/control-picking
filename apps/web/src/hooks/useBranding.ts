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
    // Re-cargar y re-aplicar cuando la marca se guarda desde Configuración,
    // sin necesidad de recargar la página.
    const onBrandingUpdated = () => load();
    window.addEventListener('branding:updated', onBrandingUpdated);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('branding:updated', onBrandingUpdated);
    };
  }, []);

  return { branding, loading };
}

/** Notifica a useBranding que la marca cambió, para re-aplicar sin recargar. */
export function notifyBrandingUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('branding:updated'));
  }
}

/**
 * Convierte un color hex (#RRGGBB / #RRGGBBAA) al formato "H S% L%" que usan
 * las CSS variables del tema (consumidas por Tailwind como hsl(var(--x))).
 * Devuelve null si el hex no es válido.
 */
function hexToHslParts(hex: string | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Aplica los colores de marca sobreescribiendo las CSS variables reales del
 * tema (las que consume Tailwind: --primary, --ring, --secondary). Sin esto,
 * el branding se guardaba pero no se reflejaba en la UI.
 */
function applyCssVars(b: Branding) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const primary = hexToHslParts(b.brand_primary_color);
  if (primary) {
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--ring', primary);
  } else {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--ring');
  }

  const secondary = hexToHslParts(b.brand_secondary_color);
  if (secondary) {
    root.style.setProperty('--glow', secondary);
  } else {
    root.style.removeProperty('--glow');
  }
}
