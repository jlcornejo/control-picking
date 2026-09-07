import React, { createContext, useContext, useMemo } from 'react';
import { useBranding } from '../hooks/useBranding';
import { applyBrandColors, colors } from '../constants/theme';

interface ThemeContextValue {
  /** Color primario de marca actualmente aplicado. */
  primary: string;
  /** Nombre de la organización (branding). */
  brandName: string;
  logoUrl: string | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  primary: colors.primary,
  brandName: 'Fundo360',
  logoUrl: null,
});

/**
 * Aplica el branding de la organización a la paleta global (`colors`) y re-monta
 * el árbol hijo cuando el color de marca cambia, para que los StyleSheet estáticos
 * tomen los nuevos valores. Opción A: la app REFLEJA la marca configurada en el
 * dashboard web (multi-tenant). No edita nada; solo lee vía RLS.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { branding } = useBranding();

  // Muta `colors` in-place ANTES de que se monten los hijos con la nueva key.
  applyBrandColors(branding.brand_primary_color, branding.brand_secondary_color);

  // La key fuerza el remonte del subárbol cuando cambia el primario resuelto,
  // garantizando que los StyleSheet.create relean la paleta actualizada.
  const themeKey = colors.primary;

  const value = useMemo<ThemeContextValue>(
    () => ({
      primary: colors.primary,
      brandName: branding.name,
      logoUrl: branding.logo_url,
    }),
    [branding.name, branding.logo_url, themeKey],
  );

  return (
    <ThemeContext.Provider value={value}>
      <React.Fragment key={themeKey}>{children}</React.Fragment>
    </ThemeContext.Provider>
  );
}

/** Acceso reactivo al branding aplicado (color primario, nombre, logo). */
export function useTheme() {
  return useContext(ThemeContext);
}
