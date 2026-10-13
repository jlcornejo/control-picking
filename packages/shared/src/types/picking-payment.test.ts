import { describe, it, expect } from 'vitest';
import {
  UnitMeasure,
  pickingPayableBase,
  pickingSubtotal,
  resolveFeatureFlag,
  type PickingPaymentInput,
} from './index';

describe('pickingPayableBase', () => {
  it('returns box quantity when paid by box', () => {
    const record: PickingPaymentInput = {
      payment_unit: UnitMeasure.BOX,
      quantity: 12,
      paid_quantity_kg: null,
      rate_amount_snapshot: 500,
    };
    expect(pickingPayableBase(record)).toBe(12);
  });

  it('returns paid kilograms when paid by kg', () => {
    const record: PickingPaymentInput = {
      payment_unit: UnitMeasure.KG,
      quantity: 1,
      paid_quantity_kg: 7.5,
      rate_amount_snapshot: 300,
    };
    expect(pickingPayableBase(record)).toBe(7.5);
  });

  it('treats missing kg as 0 when paid by kg', () => {
    const record: PickingPaymentInput = {
      payment_unit: UnitMeasure.KG,
      quantity: 1,
      paid_quantity_kg: null,
      rate_amount_snapshot: 300,
    };
    expect(pickingPayableBase(record)).toBe(0);
  });
});

describe('pickingSubtotal', () => {
  it('computes quantity * rate exactly for box payment', () => {
    const record: PickingPaymentInput = {
      payment_unit: UnitMeasure.BOX,
      quantity: 12,
      paid_quantity_kg: null,
      rate_amount_snapshot: 500,
    };
    expect(pickingSubtotal(record)).toBe(6000);
  });

  it('computes paid_quantity_kg * rate for kg payment', () => {
    const record: PickingPaymentInput = {
      payment_unit: UnitMeasure.KG,
      quantity: 1,
      paid_quantity_kg: 7.5,
      rate_amount_snapshot: 300,
    };
    expect(pickingSubtotal(record)).toBe(2250);
  });

  it('rounds the subtotal to 2 decimals', () => {
    const record: PickingPaymentInput = {
      payment_unit: UnitMeasure.KG,
      quantity: 1,
      paid_quantity_kg: 3.333,
      rate_amount_snapshot: 1.005,
    };
    // 3.333 * 1.005 = 3.349665 -> 3.35
    expect(pickingSubtotal(record)).toBe(3.35);
  });

  it.each([
    { quantity: 1, paid_quantity_kg: 0.1, rate: 10, expected: 1 },
    { quantity: 1, paid_quantity_kg: 2.25, rate: 4, expected: 9 },
    { quantity: 1, paid_quantity_kg: 10, rate: 123.45, expected: 1234.5 },
  ])(
    'kg invariant: positive paid_quantity_kg ($paid_quantity_kg) * rate ($rate) = $expected',
    ({ quantity, paid_quantity_kg, rate, expected }) => {
      const record: PickingPaymentInput = {
        payment_unit: UnitMeasure.KG,
        quantity,
        paid_quantity_kg,
        rate_amount_snapshot: rate,
      };
      expect(paid_quantity_kg).toBeGreaterThan(0);
      expect(pickingSubtotal(record)).toBe(expected);
    },
  );

  it.each([
    { quantity: 1, rate: 500, expected: 500 },
    { quantity: 20, rate: 450, expected: 9000 },
  ])(
    'box invariant: positive quantity ($quantity) * rate ($rate) = $expected',
    ({ quantity, rate, expected }) => {
      const record: PickingPaymentInput = {
        payment_unit: UnitMeasure.BOX,
        quantity,
        paid_quantity_kg: null,
        rate_amount_snapshot: rate,
      };
      expect(quantity).toBeGreaterThan(0);
      expect(pickingSubtotal(record)).toBe(expected);
    },
  );
});

describe('resolveFeatureFlag', () => {
  it('uses the org override when it is true', () => {
    expect(resolveFeatureFlag(false, true)).toBe(true);
  });

  it('uses the org override when it is false', () => {
    expect(resolveFeatureFlag(true, false)).toBe(false);
  });

  it('falls back to the global value when override is null', () => {
    expect(resolveFeatureFlag(true, null)).toBe(true);
    expect(resolveFeatureFlag(false, null)).toBe(false);
  });

  it('falls back to the global value when override is undefined', () => {
    expect(resolveFeatureFlag(true, undefined)).toBe(true);
    expect(resolveFeatureFlag(false)).toBe(false);
  });

  it('defaults to false when the global value is unset', () => {
    expect(resolveFeatureFlag()).toBe(false);
    expect(resolveFeatureFlag(null, null)).toBe(false);
    expect(resolveFeatureFlag(undefined, undefined)).toBe(false);
  });
});
