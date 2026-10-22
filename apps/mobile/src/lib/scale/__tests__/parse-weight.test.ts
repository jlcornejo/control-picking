import { describe, it, expect } from 'vitest';
import { parseWeight } from '../parse-weight';

describe('parseWeight', () => {
  it('parses a stable ASCII frame with status + kg unit', () => {
    const r = parseWeight('ST,GS,+  12.50kg\r\n');
    expect(r.kg).toBe(12.5);
    expect(r.stable).toBe(true);
    expect(r.raw).toBe('ST,GS,+  12.50kg\r\n');
  });

  it('marks a motion frame (US) as not stable', () => {
    const r = parseWeight('US,NT,+12.5kg');
    expect(r.kg).toBe(12.5);
    expect(r.stable).toBe(false);
  });

  it('parses a bare decimal with no status (stable unknown)', () => {
    const r = parseWeight('12.50\r\n');
    expect(r.kg).toBe(12.5);
    expect(r.stable).toBeNull();
  });

  it('converts grams to kilograms', () => {
    const r = parseWeight('12500 g');
    expect(r.kg).toBe(12.5);
  });

  it('converts grams with a status prefix to kilograms', () => {
    const r = parseWeight('ST,GS,+12500g');
    expect(r.kg).toBe(12.5);
    expect(r.stable).toBe(true);
  });

  it('handles a negative sign with internal spaces', () => {
    const r = parseWeight('ST,GS,-  1.25kg');
    expect(r.kg).toBe(-1.25);
    expect(r.stable).toBe(true);
  });

  it('treats a tare-zero reading as a valid 0 kg', () => {
    expect(parseWeight('0.00').kg).toBe(0);
    expect(parseWeight('ST,GS,-0.00kg').kg).toBe(0);
  });

  it('returns null kg and not-stable for an overload token', () => {
    const r = parseWeight('OL\r\n');
    expect(r.kg).toBeNull();
    expect(r.stable).toBe(false);
  });

  it('returns null kg for a dashes overload line', () => {
    const r = parseWeight('------');
    expect(r.kg).toBeNull();
    expect(r.stable).toBe(false);
  });

  it('returns null kg for empty / whitespace-only input', () => {
    expect(parseWeight('').kg).toBeNull();
    expect(parseWeight('   \r\n').kg).toBeNull();
  });

  it('accepts a locale decimal comma', () => {
    expect(parseWeight('12,50kg').kg).toBe(12.5);
  });

  it('never throws and returns null kg for an over-length / malformed line', () => {
    const flood = 'X'.repeat(500);
    const r = parseWeight(flood);
    expect(r.kg).toBeNull();
    expect(r.raw).toBe(flood);
  });

  it('never throws and returns null kg for a non-numeric line', () => {
    const r = parseWeight('hello scale');
    expect(r.kg).toBeNull();
    expect(r.stable).toBeNull();
  });

  it('always preserves the raw chunk exactly as received', () => {
    const raw = 'ST,GS,+  3.333kg\r\n';
    expect(parseWeight(raw).raw).toBe(raw);
  });

  // TODO: enable once the REAL LP7516C frame is captured with the in-app debug
  // panel. Replace the expected input/output with the confirmed frame and add
  // its pattern as the FIRST entry in WEIGHT_PATTERNS.
  it.skip('parses the confirmed real LP7516C frame (to fill in after capture)', () => {
    const r = parseWeight('<<REPLACE WITH CAPTURED FRAME>>');
    expect(r.kg).toBe(0);
  });
});
