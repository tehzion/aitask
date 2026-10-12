import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTemporaryPassword } from './temporaryPassword';
import { validateStaffSignupPassword } from './auth';

afterEach(() => vi.restoreAllMocks());

describe('temporary approval passwords', () => {
  it('always meets the signup policy and contains only supported characters', () => {
    for (let i = 0; i < 100; i++) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[a-hj-km-np-zA-HJ-NP-Z2-9]{16}$/);
      expect(validateStaffSignupPassword(password, password)).toBe('');
    }
  });

  it('handles the old out-of-bounds remainder and rejects biased bytes', () => {
    const random = vi.spyOn(crypto, 'getRandomValues')
      .mockImplementationOnce(array => { (array as Uint8Array).fill(255); return array; })
      .mockImplementation(array => { (array as Uint8Array).fill(54); return array; });
    expect(generateTemporaryPassword()).toBe('a'.repeat(16));
    expect(random).toHaveBeenCalledTimes(2);
  });
});
