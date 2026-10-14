/** Format number as Chilean currency (dot separator, no decimals) */
export function formatMoney(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0';
  return '$' + Math.round(num).toLocaleString('es-CL');
}

/** Format number with thousands separator */
export function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('es-CL');
}

/** Short label for a payment unit ('box' | 'kg'). */
export function unitLabel(unit: string | null | undefined): string {
  return unit === 'kg' ? 'kg' : 'cajas';
}

/**
 * Format a payable base with its unit. Boxes render as integers; kilograms keep
 * up to 3 decimals (the registration precision) without forcing trailing zeros.
 */
export function formatUnit(base: number | string, unit: string | null | undefined): string {
  const num = typeof base === 'string' ? parseFloat(base) : base;
  if (isNaN(num)) return unit === 'kg' ? '0 kg' : '0 cajas';
  if (unit === 'kg') {
    const kg = Math.round(num * 1000) / 1000;
    return `${kg.toLocaleString('es-CL', { maximumFractionDigits: 3 })} kg`;
  }
  return `${Math.round(num).toLocaleString('es-CL')} cajas`;
}
