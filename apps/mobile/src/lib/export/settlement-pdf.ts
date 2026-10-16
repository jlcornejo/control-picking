import { formatNumber } from '../../utils/format';

/**
 * Settlement PDF generation for mobile (G5-AC3).
 *
 * The web uses jsPDF + jspdf-autotable (DOM/canvas), which does not run in
 * React Native. We reproduce the same `SettlementPDF` content as an HTML
 * template with inline styles and render it to a PDF with expo-print, then
 * share it with expo-sharing. `settlementHtml` is a pure function (no native
 * imports, no DOM) so it can be unit tested; `printSettlement` dynamically
 * imports the native modules only when invoked.
 */

const statusLabels: Record<string, string> = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado' };

/** A single breakdown row of a settlement (period picking records). */
export interface SettlementPdfRecord {
  work_day: string;
  worker_name?: string | null;
  block_name: string;
  product_name: string;
  variety_name?: string | null;
  /** 'box' | 'kg'. Determines the displayed unit and the paid base. */
  payment_unit?: string;
  /** Paid base: boxes or kilos according to payment_unit. */
  base?: number;
  rate: number;
  subtotal: number;
}

/** A single payment made against the settlement. */
export interface SettlementPdfPayment {
  date: string;
  amount: number;
  notes: string;
}

/** Fully-typed input for the settlement PDF (no any). */
export interface SettlementPdfData {
  workerName: string;
  workerRut: string | null;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  status: string;
  payeeType?: 'worker' | 'crew';
  records: SettlementPdfRecord[];
  payments?: SettlementPdfPayment[];
}

/** Kilos with up to 3 decimals, es-CL formatting (Hermes-safe via formatNumber for integers). */
function formatKg(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) return `${formatNumber(rounded)}`;
  const [intPart, decPart] = rounded.toFixed(3).replace(/0+$/, '').split('.');
  return decPart ? `${formatNumber(Number(intPart))},${decPart}` : `${formatNumber(Number(intPart))}`;
}

/** "Cant." cell according to the payment unit (whole boxes or kilos with decimals). */
function formatQty(r: SettlementPdfRecord): string {
  const base = r.base ?? 0;
  if (r.payment_unit === 'kg') return `${formatKg(base)} kg`;
  return `${formatNumber(Math.round(base))} cajas`;
}

/** Product + variety (when present). */
function formatProduct(r: SettlementPdfRecord): string {
  return r.variety_name ? `${r.product_name} · ${r.variety_name}` : r.product_name;
}

/** HTML-escape a cell value to keep the template safe for arbitrary names/notes. */
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number): string {
  return `$${formatNumber(n)}`;
}

/**
 * Builds the settlement HTML document (inline styles) reproducing the content
 * of the web `SettlementPDF`: beneficiary (worker/crew), period, production
 * breakdown table, per-unit summary, total and payments table. Pure function.
 */
export function settlementHtml(data: SettlementPdfData): string {
  const isCrew = data.payeeType === 'crew';

  // Per-unit summary: boxes from non-kg records, kilos from kg records.
  const boxes = data.records
    .filter((r) => r.payment_unit !== 'kg')
    .reduce((sum, r) => sum + (r.base ?? 0), 0);
  const kg = data.records
    .filter((r) => r.payment_unit === 'kg')
    .reduce((sum, r) => sum + (r.base ?? 0), 0);

  const payments = data.payments ?? [];
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = data.totalAmount - totalPaid;

  const headCells = isCrew
    ? ['Fecha', 'Trabajador', 'Paño', 'Producto', 'Cant.', 'Tarifa', 'Subtotal']
    : ['Fecha', 'Paño', 'Producto', 'Cant.', 'Tarifa', 'Subtotal'];

  const recordRows = data.records
    .map((r) => {
      const cells = isCrew
        ? [
            esc(r.work_day),
            esc(r.worker_name || '—'),
            esc(r.block_name),
            esc(formatProduct(r)),
            esc(formatQty(r)),
            money(r.rate),
            money(r.subtotal),
          ]
        : [
            esc(r.work_day),
            esc(r.block_name),
            esc(formatProduct(r)),
            esc(formatQty(r)),
            money(r.rate),
            money(r.subtotal),
          ];
      const numericFrom = isCrew ? 4 : 3;
      return `<tr>${cells
        .map((c, i) => `<td class="${i >= numericFrom ? 'num' : ''}">${c}</td>`)
        .join('')}</tr>`;
    })
    .join('');

  const paymentsBlock =
    payments.length > 0
      ? `
      <h2>Detalle de Pagos</h2>
      <table class="pay">
        <thead><tr><th>Fecha</th><th class="num">Monto</th><th>Notas</th></tr></thead>
        <tbody>
          ${payments
            .map(
              (p) =>
                `<tr><td>${esc(p.date)}</td><td class="num">${money(p.amount)}</td><td>${esc(p.notes || '—')}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <div class="paysummary">
        <span>Total pagado: <strong>${money(totalPaid)}</strong></span>
        <span>Saldo pendiente: <strong class="${remaining > 0 ? 'due' : 'ok'}">${money(remaining)}</strong></span>
      </div>`
      : `<p class="nopay">Sin pagos registrados</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 0 24px 24px; font-size: 12px; }
  .header { background: #1b5e20; color: #fff; margin: 0 -24px 20px; padding: 16px 24px; }
  .header h1 { font-size: 18px; margin: 0; }
  .header p { font-size: 10px; margin: 4px 0 0; opacity: 0.9; }
  h2 { font-size: 13px; color: #111; margin: 18px 0 6px; }
  .meta { font-size: 11px; line-height: 1.6; }
  .meta .label { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #1b5e20; color: #fff; font-size: 10px; text-align: left; padding: 6px; }
  td { font-size: 10px; padding: 6px; border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #f5f7f5; }
  .num { text-align: right; }
  table.pay th { background: #3b82f6; }
  table.pay tbody tr:nth-child(even) { background: #f5f7ff; }
  .summary { margin-top: 10px; color: #666; font-size: 11px; }
  .total { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #1b5e20; margin-top: 10px; padding-top: 8px; }
  .total .label { font-size: 13px; font-weight: bold; }
  .total .amount { font-size: 16px; font-weight: bold; color: #1b5e20; }
  .paysummary { margin-top: 8px; font-size: 11px; display: flex; gap: 24px; }
  .paysummary .due { color: #dc2626; }
  .paysummary .ok { color: #1b5e20; }
  .nopay { color: #999; font-size: 11px; }
  .footer { margin-top: 24px; text-align: center; color: #999; font-size: 9px; }
</style>
</head>
<body>
  <div class="header">
    <h1>Liquidación de Producción</h1>
    <p>Fundo360 — Gestión Integral de Campo</p>
  </div>

  <h2>${isCrew ? 'Datos de la Cuadrilla' : 'Datos del Trabajador'}</h2>
  <div class="meta">
    <div><span class="label">Nombre:</span> <strong>${esc(data.workerName)}</strong></div>
    ${data.workerRut ? `<div><span class="label">RUT:</span> ${esc(data.workerRut)}</div>` : ''}
  </div>

  <h2>Período</h2>
  <div class="meta">
    <div><span class="label">Desde:</span> ${esc(data.periodStart)} &nbsp;&nbsp; <span class="label">Hasta:</span> ${esc(data.periodEnd)}</div>
    <div><span class="label">Estado:</span> ${esc(statusLabels[data.status] || data.status)}</div>
  </div>

  <h2>Detalle de Producción</h2>
  <table>
    <thead><tr>${headCells.map((h, i) => `<th class="${i >= (isCrew ? 4 : 3) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${recordRows}</tbody>
  </table>

  <div class="summary">Cajas: ${formatNumber(boxes)} · Kilos: ${formatKg(kg)}</div>

  <div class="total">
    <span class="label">TOTAL A PAGAR</span>
    <span class="amount">${money(data.totalAmount)}</span>
  </div>

  ${paymentsBlock}

  <div class="footer">Documento generado automáticamente — Fundo360</div>
</body>
</html>`;
}

/**
 * Renders the settlement HTML to a PDF and opens the native share sheet.
 * Native modules are imported dynamically so this file stays importable in a
 * plain Node (test) environment for `settlementHtml`.
 */
export async function printSettlement(data: SettlementPdfData): Promise<void> {
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html: settlementHtml(data) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}
