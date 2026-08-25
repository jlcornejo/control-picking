/** Format number as Chilean currency (dot separator, no decimals) */
export function formatMoney(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0';
  return '$' + formatNumber(num);
}

/** Format number with thousands separator (dot for CL) */
export function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  // Manual formatting since Hermes doesn't support toLocaleString with locales
  const rounded = Math.round(num);
  const str = Math.abs(rounded).toString();
  let formatted = '';
  for (let i = str.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) formatted = '.' + formatted;
    formatted = str[i] + formatted;
  }
  return rounded < 0 ? '-' + formatted : formatted;
}
