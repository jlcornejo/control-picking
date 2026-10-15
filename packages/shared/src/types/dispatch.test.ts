import { describe, it, expect } from 'vitest';
import {
  DispatchWeightSource,
  aggregateDispatchWeight,
  compareDispatch,
  type DispatchWeightInput,
} from './index';

describe('aggregateDispatchWeight', () => {
  it('scale-only -> source scale and weight_precise true (sums net_weight_kg)', () => {
    const records: DispatchWeightInput[] = [
      { quantity: 10, net_weight_kg: 48.5, box_type_target_net_kg: 5 },
      { quantity: 5, net_weight_kg: 24.25, box_type_target_net_kg: 5 },
    ];
    const result = aggregateDispatchWeight(records);
    expect(result.total_trays).toBe(15);
    expect(result.total_weight_kg).toBe(72.75);
    expect(result.weight_source).toBe(DispatchWeightSource.SCALE);
    expect(result.weight_precise).toBe(true);
  });

  it('estimated-only -> source estimated using quantity * box_type_target_net_kg', () => {
    const records: DispatchWeightInput[] = [
      { quantity: 10, net_weight_kg: null, box_type_target_net_kg: 5 },
      { quantity: 4, net_weight_kg: null, box_type_target_net_kg: 2.5 },
    ];
    const result = aggregateDispatchWeight(records);
    expect(result.total_trays).toBe(14);
    // 10*5 + 4*2.5 = 50 + 10 = 60
    expect(result.total_weight_kg).toBe(60);
    expect(result.weight_source).toBe(DispatchWeightSource.ESTIMATED);
    expect(result.weight_precise).toBe(false);
  });

  it('estimated with null target contributes 0 to the weight', () => {
    const records: DispatchWeightInput[] = [
      { quantity: 8, net_weight_kg: null, box_type_target_net_kg: null },
    ];
    const result = aggregateDispatchWeight(records);
    expect(result.total_trays).toBe(8);
    expect(result.total_weight_kg).toBe(0);
    expect(result.weight_source).toBe(DispatchWeightSource.ESTIMATED);
    expect(result.weight_precise).toBe(false);
  });

  it('mixed -> source mixed and weight_precise false', () => {
    const records: DispatchWeightInput[] = [
      { quantity: 10, net_weight_kg: 50, box_type_target_net_kg: 5 },
      { quantity: 4, net_weight_kg: null, box_type_target_net_kg: 5 },
    ];
    const result = aggregateDispatchWeight(records);
    expect(result.total_trays).toBe(14);
    // 50 (scale) + 4*5 (estimated) = 70
    expect(result.total_weight_kg).toBe(70);
    expect(result.weight_source).toBe(DispatchWeightSource.MIXED);
    expect(result.weight_precise).toBe(false);
  });

  it('empty input -> zeros and estimated source', () => {
    const result = aggregateDispatchWeight([]);
    expect(result.total_trays).toBe(0);
    expect(result.total_weight_kg).toBe(0);
    expect(result.weight_source).toBe(DispatchWeightSource.ESTIMATED);
    expect(result.weight_precise).toBe(false);
  });
});

describe('compareDispatch', () => {
  it('computes positive merma when received is less than dispatched', () => {
    const c = compareDispatch(100, 500, 90, 480);
    expect(c.trays_diff).toBe(10);
    expect(c.weight_diff_kg).toBe(20);
    // 20 / 500 * 100 = 4
    expect(c.weight_shrinkage_pct).toBe(4);
    expect(c.has_receipt).toBe(true);
  });

  it('computes negative diff (sobrante) when received exceeds dispatched', () => {
    const c = compareDispatch(100, 500, 105, 520);
    expect(c.trays_diff).toBe(-5);
    expect(c.weight_diff_kg).toBe(-20);
    expect(c.weight_shrinkage_pct).toBe(-4);
    expect(c.has_receipt).toBe(true);
  });

  it('returns pct 0 when the dispatched weight divisor is zero', () => {
    const c = compareDispatch(0, 0, 0, 0);
    expect(c.weight_shrinkage_pct).toBe(0);
    expect(c.weight_diff_kg).toBe(0);
    expect(c.trays_diff).toBe(0);
    // zeros are not null -> has_receipt true
    expect(c.has_receipt).toBe(true);
  });

  it('has_receipt is false when both received values are null', () => {
    const c = compareDispatch(100, 500, null, null);
    expect(c.received_trays).toBe(0);
    expect(c.received_weight_kg).toBe(0);
    expect(c.trays_diff).toBe(100);
    expect(c.weight_diff_kg).toBe(500);
    expect(c.weight_shrinkage_pct).toBe(100);
    expect(c.has_receipt).toBe(false);
  });

  it('has_receipt is true when only one received value is provided', () => {
    const c = compareDispatch(100, 500, 95, null);
    expect(c.received_trays).toBe(95);
    expect(c.received_weight_kg).toBe(0);
    expect(c.has_receipt).toBe(true);
  });
});
