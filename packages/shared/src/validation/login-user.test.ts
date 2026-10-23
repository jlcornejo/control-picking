import { describe, it, expect } from 'vitest';
import { createLoginUserSchema, updateLoginUserSchema, LOGIN_USER_ROLES } from './index';

describe('LOGIN_USER_ROLES', () => {
  it('contains exactly the three login roles (excludes worker)', () => {
    expect(LOGIN_USER_ROLES).toEqual(['admin', 'supervisor', 'crew_lead']);
    expect(LOGIN_USER_ROLES).not.toContain('worker');
  });
});

describe('createLoginUserSchema', () => {
  const valid = { full_name: 'María Pérez', email: 'maria@camposdelsur.cl', role: 'admin' as const };

  it('accepts a valid payload', () => {
    expect(createLoginUserSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts supervisor and crew_lead roles', () => {
    expect(createLoginUserSchema.safeParse({ ...valid, role: 'supervisor' }).success).toBe(true);
    expect(createLoginUserSchema.safeParse({ ...valid, role: 'crew_lead' }).success).toBe(true);
  });

  it('rejects an empty full_name', () => {
    expect(createLoginUserSchema.safeParse({ ...valid, full_name: '' }).success).toBe(false);
  });

  it('rejects a full_name longer than 150 chars', () => {
    expect(createLoginUserSchema.safeParse({ ...valid, full_name: 'a'.repeat(151) }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(createLoginUserSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects the worker role (not a login role)', () => {
    expect(createLoginUserSchema.safeParse({ ...valid, role: 'worker' }).success).toBe(false);
  });

  it('rejects a role outside the login set', () => {
    expect(createLoginUserSchema.safeParse({ ...valid, role: 'superuser' }).success).toBe(false);
  });
});

describe('updateLoginUserSchema', () => {
  it('accepts an empty payload (all optional)', () => {
    expect(updateLoginUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial payload with only full_name', () => {
    expect(updateLoginUserSchema.safeParse({ full_name: 'Nuevo Nombre' }).success).toBe(true);
  });

  it('accepts a partial payload with only role', () => {
    expect(updateLoginUserSchema.safeParse({ role: 'supervisor' }).success).toBe(true);
  });

  it('rejects the worker role', () => {
    expect(updateLoginUserSchema.safeParse({ role: 'worker' }).success).toBe(false);
  });

  it('rejects an empty full_name', () => {
    expect(updateLoginUserSchema.safeParse({ full_name: '' }).success).toBe(false);
  });
});
