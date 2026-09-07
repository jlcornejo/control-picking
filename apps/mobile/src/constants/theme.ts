// Paleta de la app. Los colores de MARCA (primary y derivados) son dinámicos:
// se recalculan en runtime desde el branding de la organización vía
// `applyBrandColors()`. Los neutrales/acentos son fijos.
//
// IMPORTANTE: `colors` es un objeto MUTABLE. Los componentes lo importan y lo
// leen dentro de StyleSheet.create al montar. Para que un cambio de marca se
// refleje, `applyBrandColors()` muta el objeto in-place y el ThemeProvider
// re-monta el árbol (via key) para que los StyleSheet tomen los nuevos valores.

// Default de marca (coincide con DEFAULT_BRANDING del hook useBranding).
export const DEFAULT_BRAND_PRIMARY = '#1b5e20';
export const DEFAULT_BRAND_SECONDARY = '#4caf50';

export const colors = {
  // Primary palette (DINÁMICA — derivada de la marca de la organización)
  primary: DEFAULT_BRAND_PRIMARY,
  primaryDark: '#124016',
  primaryLight: '#4caf50',
  primaryBg: '#e8f5e9',
  primaryMuted: '#c8e6c9',

  // Neutral (fijos)
  background: '#fafbfc',
  card: '#ffffff',
  cardBorder: '#f0f2f5',
  surface: '#f8f9fb',

  // Text (fijos)
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textWhite: '#ffffff',

  // Accents (fijos)
  blue: '#3b82f6',
  blueBg: '#eff6ff',
  violet: '#8b5cf6',
  violetBg: '#f5f3ff',
  amber: '#f59e0b',
  amberBg: '#fffbeb',
  red: '#ef4444',
  redBg: '#fef2f2',
  orange: '#f97316',

  // Legacy compat
  white: '#ffffff',

  // Shadows
  shadow: 'rgba(15, 23, 42, 0.06)',
  shadowMd: 'rgba(15, 23, 42, 0.1)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const font = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

// ---------------------------------------------------------------------------
// Derivación de color de marca (equivalente RN del applyCssVars del web).
// ---------------------------------------------------------------------------

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Convierte #RRGGBB (o #RRGGBBAA) a HSL. Devuelve null si el hex es inválido. */
function hexToHsl(hex: string | null | undefined): Hsl | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(hex.trim());
  if (!m || !m[1]) return null;
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
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex({ h, s, l }: Hsl): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const clampL = (l: number) => Math.max(0, Math.min(100, l));

/**
 * Aplica los colores de marca mutando `colors` in-place. Deriva las variantes
 * (dark/light/bg/muted) desde el tono del color primario, manteniendo el hue
 * y ajustando la luminosidad — igual criterio que el web.
 *
 * Devuelve true si los colores cambiaron respecto al estado actual.
 */
export function applyBrandColors(
  primaryHex: string | null | undefined,
  secondaryHex?: string | null | undefined,
): boolean {
  const p = hexToHsl(primaryHex);
  if (!p) return false;

  const primary = hslToHex(p);
  const primaryDark = hslToHex({ h: p.h, s: p.s, l: clampL(p.l - 12) });
  const secondaryHsl = hexToHsl(secondaryHex);
  const primaryLight = secondaryHsl
    ? hslToHex(secondaryHsl)
    : hslToHex({ h: p.h, s: p.s, l: clampL(p.l + 20) });
  // Fondos suaves: mismo hue, saturación reducida, muy claro.
  const primaryBg = hslToHex({ h: p.h, s: Math.round(p.s * 0.45), l: 95 });
  const primaryMuted = hslToHex({ h: p.h, s: Math.round(p.s * 0.4), l: 85 });

  const changed = colors.primary !== primary;

  colors.primary = primary;
  colors.primaryDark = primaryDark;
  colors.primaryLight = primaryLight;
  colors.primaryBg = primaryBg;
  colors.primaryMuted = primaryMuted;

  return changed;
}
