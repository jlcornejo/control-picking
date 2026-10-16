import { describe, it, expect } from 'vitest';
import { resolveFeatureFlag } from './index';
import { FEATURE_FLAGS, PAYMENT_EVIDENCE } from '../constants/index';
import { createPaymentEvidenceSchema } from '../validation/index';

describe('payment photo evidence contract', () => {
  it('exposes the max-images and bucket constants', () => {
    expect(PAYMENT_EVIDENCE.MAX_IMAGES).toBe(3);
    expect(PAYMENT_EVIDENCE.BUCKET).toBe('payment-evidence');
  });

  it('exposes the feature flag key', () => {
    expect(FEATURE_FLAGS.PAYMENT_PHOTO_EVIDENCE).toBe('payment_photo_evidence');
  });

  it('defaults the flag off when neither global nor override is set', () => {
    expect(resolveFeatureFlag(undefined, undefined)).toBe(false);
  });
});

describe('createPaymentEvidenceSchema', () => {
  it('accepts a valid payload', () => {
    const result = createPaymentEvidenceSchema.safeParse({
      payment_id: '11111111-1111-1111-1111-111111111111',
      image_path: 'org/pay/photo.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid payment_id', () => {
    const result = createPaymentEvidenceSchema.safeParse({
      payment_id: 'not-a-uuid',
      image_path: 'org/pay/photo.jpg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty image_path', () => {
    const result = createPaymentEvidenceSchema.safeParse({
      payment_id: '11111111-1111-1111-1111-111111111111',
      image_path: '',
    });
    expect(result.success).toBe(false);
  });
});
