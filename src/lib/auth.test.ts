import { describe, expect, it } from 'vitest';
import { validateStaffSignupPassword } from './auth';

describe('Staff signup password validation', () => {
  it('requires at least 12 characters', () => {
    expect(validateStaffSignupPassword('short', 'short')).toBe('Use a password with at least 12 characters.');
  });

  it('requires matching passwords', () => {
    expect(validateStaffSignupPassword('long-enough-password', 'different-password')).toBe('Passwords do not match.');
  });

  it('accepts a matching 12-character-or-longer password', () => {
    expect(validateStaffSignupPassword('long-enough-password', 'long-enough-password')).toBe('');
  });
});
