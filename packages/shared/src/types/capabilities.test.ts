import { describe, it, expect } from 'vitest';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  CAPABILITY_LABELS,
  hasCapability,
} from './index';
import { createPermissionProfileSchema } from '../validation/index';

describe('capability catalog lockstep', () => {
  it('has a label for every capability in the catalog', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(CAPABILITY_LABELS[cap]).toBeDefined();
      expect(CAPABILITY_LABELS[cap].length).toBeGreaterThan(0);
    }
  });

  it('exposes the own_production.view capability (M3-01)', () => {
    expect(CAPABILITIES.OWN_PRODUCTION_VIEW).toBe('own_production.view');
    expect(ALL_CAPABILITIES).toContain('own_production.view');
    expect(CAPABILITY_LABELS[CAPABILITIES.OWN_PRODUCTION_VIEW]).toBe('Ver su propia producción');
  });
});

describe('createPermissionProfileSchema accepts own_production.view', () => {
  it('accepts a profile that lists own_production.view', () => {
    const result = createPermissionProfileSchema.safeParse({
      name: 'x',
      capabilities: ['own_production.view'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a capability outside the catalog', () => {
    const result = createPermissionProfileSchema.safeParse({
      name: 'x',
      capabilities: ['does.not.exist'],
    });
    expect(result.success).toBe(false);
  });
});

describe('hasCapability for own_production.view', () => {
  it('treats absence of a profile as unrestricted (default visible)', () => {
    expect(hasCapability(null, CAPABILITIES.OWN_PRODUCTION_VIEW)).toBe(true);
    expect(hasCapability(undefined, CAPABILITIES.OWN_PRODUCTION_VIEW)).toBe(true);
  });

  it('is true when the profile lists the capability', () => {
    expect(hasCapability(['own_production.view'], CAPABILITIES.OWN_PRODUCTION_VIEW)).toBe(true);
  });

  it('is false when the profile omits the capability', () => {
    expect(hasCapability([], CAPABILITIES.OWN_PRODUCTION_VIEW)).toBe(false);
    expect(hasCapability(['payments.manage'], CAPABILITIES.OWN_PRODUCTION_VIEW)).toBe(false);
  });
});
