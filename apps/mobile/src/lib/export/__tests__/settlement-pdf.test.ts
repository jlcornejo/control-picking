import { describe, it, expect } from 'vitest';
import { settlementHtml, type SettlementPdfData } from '../settlement-pdf';

const base: SettlementPdfData = {
  workerName: 'Juan Pérez',
  workerRut: '12.345.678-9',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  totalAmount: 150000,
  status: 'partial',
  payeeType: 'worker',
  records: [
    {
      work_day: '2025-01-05',
      block_name: 'Paño A',
      product_name: 'Arándano',
      variety_name: 'Duke',
      payment_unit: 'box',
      base: 10,
      rate: 1500,
      subtotal: 15000,
    },
    {
      work_day: '2025-01-06',
      block_name: 'Paño B',
      product_name: 'Arándano',
      variety_name: null,
      payment_unit: 'kg',
      base: 20,
      rate: 500,
      subtotal: 10000,
    },
  ],
  payments: [{ date: '10-01-2025', amount: 50000, notes: 'Abono' }],
};

describe('settlementHtml', () => {
  it('renders the document header and worker name', () => {
    const html = settlementHtml(base);
    expect(html).toContain('Liquidación de Producción');
    expect(html).toContain('Datos del Trabajador');
    expect(html).toContain('Juan Pérez');
  });

  it('includes the RUT only when present', () => {
    expect(settlementHtml(base)).toContain('12.345.678-9');
    expect(settlementHtml({ ...base, workerRut: null })).not.toContain('RUT:');
  });

  it('renders the period and status label', () => {
    const html = settlementHtml(base);
    expect(html).toContain('2025-01-01');
    expect(html).toContain('2025-01-31');
    expect(html).toContain('Parcial');
  });

  it('renders a row per breakdown record with product and variety', () => {
    const html = settlementHtml(base);
    expect(html).toContain('Arándano · Duke');
    expect(html).toContain('Paño A');
    expect(html).toContain('Paño B');
    expect(html).toContain('10 cajas');
    expect(html).toContain('20 kg');
  });

  it('shows the per-unit summary and total to pay', () => {
    const html = settlementHtml(base);
    expect(html).toContain('Cajas: 10 · Kilos: 20');
    expect(html).toContain('TOTAL A PAGAR');
    expect(html).toContain('$150.000');
  });

  it('renders the payments table with totals and balance', () => {
    const html = settlementHtml(base);
    expect(html).toContain('Detalle de Pagos');
    expect(html).toContain('Abono');
    expect(html).toContain('$50.000');
    // Remaining balance = 150000 - 50000.
    expect(html).toContain('$100.000');
  });

  it('shows the no-payments notice when there are none', () => {
    const html = settlementHtml({ ...base, payments: [] });
    expect(html).toContain('Sin pagos registrados');
    expect(html).not.toContain('Detalle de Pagos');
  });

  it('uses the crew header and the extra worker column for crew payees', () => {
    const html = settlementHtml({
      ...base,
      payeeType: 'crew',
      records: [
        {
          work_day: '2025-01-05',
          worker_name: 'Pedro Soto',
          block_name: 'Paño A',
          product_name: 'Arándano',
          variety_name: 'Duke',
          payment_unit: 'box',
          base: 10,
          rate: 1500,
          subtotal: 15000,
        },
      ],
    });
    expect(html).toContain('Datos de la Cuadrilla');
    expect(html).toContain('Pedro Soto');
  });
});
