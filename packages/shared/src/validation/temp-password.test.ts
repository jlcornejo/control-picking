import { describe, it, expect } from 'vitest';
// El generador vive en la Edge Function (Deno) pero es un módulo puro (solo Web
// Crypto), así que se importa directamente aquí para verificar sus garantías de
// clase con Vitest (diseño §11). No se duplica la implementación.
import { generateTempPassword } from '../../../../supabase/functions/_shared/password';

const LOWER = /[abcdefghijkmnpqrstuvwxyz]/;
const UPPER = /[ABCDEFGHJKLMNPQRSTUVWXYZ]/;
const DIGIT = /[23456789]/;
const SYMBOL = /[@#$%*+?]/;
const AMBIGUOUS = /[0O1lIo]/;

describe('generateTempPassword', () => {
  it('guarantees length, all four classes, and no ambiguous chars across many samples', () => {
    for (let i = 0; i < 1000; i++) {
      const pwd = generateTempPassword();
      expect(pwd.length).toBeGreaterThanOrEqual(12);
      expect(LOWER.test(pwd)).toBe(true);
      expect(UPPER.test(pwd)).toBe(true);
      expect(DIGIT.test(pwd)).toBe(true);
      expect(SYMBOL.test(pwd)).toBe(true);
      expect(AMBIGUOUS.test(pwd)).toBe(false);
    }
  });

  it('defaults to length 14', () => {
    expect(generateTempPassword().length).toBe(14);
  });

  it('floors the length to 12 when asked for less', () => {
    expect(generateTempPassword(6).length).toBe(12);
    expect(generateTempPassword(0).length).toBe(12);
  });

  it('honors a longer requested length', () => {
    expect(generateTempPassword(20).length).toBe(20);
  });

  it('produces different values on consecutive calls (basic randomness)', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});
