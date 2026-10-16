import { describe, it, expect } from 'vitest';
import { toCSV, type CsvColumn } from '../csv';

interface Row {
  work_day: string;
  worker_name: string;
  national_id: string | null;
  net_weight_kg: number | null;
  base: number;
  payment_unit: 'box' | 'kg';
  is_correction: boolean;
}

/** Columns matching the web records export (literal headers). */
const columns: CsvColumn<Row>[] = [
  { header: 'Fecha', value: (r) => r.work_day },
  { header: 'Trabajador', value: (r) => r.worker_name },
  { header: 'RUT', value: (r) => r.national_id ?? '' },
  { header: 'Cantidad', value: (r) => r.base },
  { header: 'Unidad', value: (r) => (r.payment_unit === 'kg' ? 'Kilo' : 'Caja') },
  { header: 'Peso neto (kg)', value: (r) => (r.net_weight_kg === null ? '' : Number(r.net_weight_kg)) },
  { header: 'Tipo', value: (r) => (r.is_correction ? 'Corrección' : 'Original') },
];

const row: Row = {
  work_day: '2025-01-10',
  worker_name: 'Juan Pérez',
  national_id: '12.345.678-9',
  net_weight_kg: 12.5,
  base: 3,
  payment_unit: 'box',
  is_correction: false,
};

/** Lines without the leading BOM, for line-oriented assertions. */
function lines(rows: Row[], cols: CsvColumn<Row>[] = columns): string[] {
  return toCSV(rows, cols).replace(/^\uFEFF/, '').split('\r\n');
}

describe('toCSV', () => {
  it('prefixes the content with a UTF-8 BOM', () => {
    expect(toCSV<Row>([], columns).startsWith('\uFEFF')).toBe(true);
  });

  it('emits the headers in order on the first line', () => {
    expect(lines([])[0]).toBe('Fecha;Trabajador;RUT;Cantidad;Unidad;Peso neto (kg);Tipo');
  });

  it('uses the literal "Peso neto (kg)" header', () => {
    expect((lines([])[0] ?? '').split(';')).toContain('Peso neto (kg)');
  });

  it('uses CRLF line endings and a semicolon separator', () => {
    expect(toCSV([row], columns).includes('\r\n')).toBe(true);
    expect(lines([row])[1]).toBe('2025-01-10;Juan Pérez;12.345.678-9;3;Caja;12.5;Original');
  });

  it('serializes null and empty values as empty cells', () => {
    expect(lines([{ ...row, national_id: null, net_weight_kg: null }])[1]).toBe(
      '2025-01-10;Juan Pérez;;3;Caja;;Original',
    );
  });

  it('escapes fields containing the separator or quotes (RFC 4180)', () => {
    // The separator and the double quotes force quoting; inner quotes are doubled.
    expect(lines([{ ...row, worker_name: 'Pérez; "El Rápido"' }])[1]).toContain('"Pérez; ""El Rápido"""');
  });

  it('maps the kg unit label and keeps the weight value', () => {
    expect(lines([{ ...row, payment_unit: 'kg', base: 10.25, net_weight_kg: 10.25 }])[1]).toBe(
      '2025-01-10;Juan Pérez;12.345.678-9;10.25;Kilo;10.25;Original',
    );
  });

  it('marks correction rows as "Corrección"', () => {
    expect((lines([{ ...row, is_correction: true }])[1] ?? '').endsWith(';Corrección')).toBe(true);
  });
});
