import { describe, it, expect } from 'vitest';
import { toCSV, type CsvColumn } from './csv';

type Row = {
  name: string;
  qty: number | null;
  note?: string | null;
};

const columns: CsvColumn<Row>[] = [
  { header: 'Nombre', value: (row) => row.name },
  { header: 'Cantidad', value: (row) => row.qty },
  { header: 'Nota', value: (row) => row.note },
];

/**
 * Reads the raw bytes of the Blob and decodes them WITHOUT stripping the BOM,
 * so assertions can see the leading U+FEFF. `Blob.text()` would silently drop
 * it because its TextDecoder ignores a leading BOM by default.
 */
async function rawText(rows: Row[], cols: CsvColumn<Row>[] = columns): Promise<string> {
  const buffer = await toCSV(rows, cols).arrayBuffer();
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(buffer);
}

/** Decoded text with the BOM removed, for line-oriented assertions. */
async function body(rows: Row[], cols: CsvColumn<Row>[] = columns): Promise<string> {
  return (await rawText(rows, cols)).replace(/^\uFEFF/, '');
}

describe('toCSV', () => {
  it('prefixes the content with a UTF-8 BOM', async () => {
    const text = await rawText([]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
  });

  it('uses text/csv;charset=utf-8 as the Blob type', () => {
    const blob = toCSV<Row>([], columns);
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('writes the header on the first line respecting column order', async () => {
    const [header] = (await body([])).split('\r\n');
    expect(header).toBe('Nombre;Cantidad;Nota');
  });

  it('separates columns with ; and rows with CRLF', async () => {
    const text = await body([
      { name: 'Ana', qty: 1, note: 'a' },
      { name: 'Beto', qty: 2, note: 'b' },
    ]);
    expect(text).toBe('Nombre;Cantidad;Nota\r\nAna;1;a\r\nBeto;2;b');
  });

  it('emits numbers exactly as returned by value', async () => {
    const lines = (await body([{ name: 'Ana', qty: 1234.5, note: null }])).split('\r\n');
    expect(lines[1]).toBe('Ana;1234.5;');
  });

  it('renders null and undefined cells as empty', async () => {
    const lines = (await body([{ name: 'Ana', qty: null }])).split('\r\n');
    expect(lines[1]).toBe('Ana;;');
  });

  it('quotes fields that contain the separator', async () => {
    const lines = (await body([{ name: 'Ana;Luisa', qty: 1, note: 'x' }])).split('\r\n');
    expect(lines[1]).toBe('"Ana;Luisa";1;x');
  });

  it('quotes fields that contain a line break', async () => {
    // The field keeps its embedded LF; only the CRLF record separators split rows.
    const lines = (await body([{ name: 'line1\nline2', qty: 1, note: 'x' }])).split('\r\n');
    expect(lines[1]).toBe('"line1\nline2";1;x');
  });

  it('quotes fields with double quotes and doubles the inner quotes', async () => {
    const lines = (await body([{ name: 'say "hi"', qty: 1, note: 'x' }])).split('\r\n');
    expect(lines[1]).toBe('"say ""hi""";1;x');
  });
});
