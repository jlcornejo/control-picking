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
