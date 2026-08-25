export const colors = {
  // Primary green palette
  primary: '#059669',
  primaryDark: '#047857',
  primaryLight: '#10b981',
  primaryBg: '#ecfdf5',
  primaryMuted: '#d1fae5',

  // Neutral
  background: '#fafbfc',
  card: '#ffffff',
  cardBorder: '#f0f2f5',
  surface: '#f8f9fb',

  // Text
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textWhite: '#ffffff',

  // Accents
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
