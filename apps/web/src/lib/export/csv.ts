/**
 * Pure, dependency-free CSV helpers for client-side report export.
 *
 * Output format targets spreadsheets in es-CL locale (Excel/LibreOffice):
 * - UTF-8 BOM prefix so accents render correctly.
 * - Semicolon field separator (comma is the decimal separator in es-CL).
 * - CRLF line endings.
 * - RFC 4180 style escaping for fields containing the separator, double
 *   quotes or line breaks.
 */

const BOM = '\uFEFF';
const SEPARATOR = ';';
const EOL = '\r\n';

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escapeField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);

  if (text.includes(SEPARATOR) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * Serializes `rows` into a CSV Blob using `columns` for the header order and
 * per-cell value extraction.
 */
export function toCSV<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): Blob {
  const headerLine = columns.map((column) => escapeField(column.header)).join(SEPARATOR);

  const bodyLines = rows.map((row) =>
    columns.map((column) => escapeField(column.value(row))).join(SEPARATOR),
  );

  const content = BOM + [headerLine, ...bodyLines].join(EOL);

  return new Blob([content], { type: 'text/csv;charset=utf-8' });
}

/**
 * Triggers a browser download for `blob` under `filename`.
 * No-op safe to call only in a DOM environment.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
