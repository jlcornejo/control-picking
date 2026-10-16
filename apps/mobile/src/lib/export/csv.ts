/**
 * Pure, DOM-free CSV helpers for report export on mobile (React Native).
 *
 * Mirrors the web helper (`apps/web/src/lib/export/csv.ts`) byte-for-byte in
 * format so the exported file is identical across platforms:
 * - UTF-8 BOM prefix so accents render correctly in Excel/LibreOffice.
 * - Semicolon field separator (comma is the decimal separator in es-CL).
 * - CRLF line endings.
 * - RFC 4180 style escaping for fields containing the separator, double quotes
 *   or line breaks.
 *
 * Unlike the web helper this returns a plain string (no Blob/DOM): the caller
 * writes it to the filesystem with expo-file-system and shares it.
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
 * Serializes `rows` into a CSV string using `columns` for the header order and
 * per-cell value extraction. The result is prefixed with a UTF-8 BOM.
 */
export function toCSV<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const headerLine = columns.map((column) => escapeField(column.header)).join(SEPARATOR);

  const bodyLines = rows.map((row) =>
    columns.map((column) => escapeField(column.value(row))).join(SEPARATOR),
  );

  return BOM + [headerLine, ...bodyLines].join(EOL);
}
