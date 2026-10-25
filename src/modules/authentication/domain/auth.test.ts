import { describe, expect, it } from 'vitest';
import { classifyLoginFailure, isValidRecoveryEmail, loginFailure, validateStaffSignupPassword } from './auth';

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

describe('Structured login failures', () => {
  it('distinguishes authentication failures from workspace access failures', () => {
    expect(classifyLoginFailure('Invalid login credentials')).toBe('invalid_credentials');
    expect(classifyLoginFailure('This authenticated account is not an AiTask workspace member.', 'workspace')).toBe('account_unapproved_or_unlinked');
    expect(classifyLoginFailure('JWT expired while loading workspace', 'workspace')).toBe('session_expired');
    expect(classifyLoginFailure('Could not read workspace rows', 'workspace')).toBe('workspace_load_failed');
  });

  it('returns actionable structured messages', () => {
    expect(loginFailure('account_unapproved_or_unlinked')).toEqual({
      ok: false,
      code: 'account_unapproved_or_unlinked',
      error: 'Your account is not approved or linked to an AiTask workspace. Ask Boss Koo to confirm your access.',
    });
  });
});

describe('Hosted recovery identifiers', () => {
  it('accepts email addresses and rejects legacy usernames', () => {
    expect(isValidRecoveryEmail('member@example.com')).toBe(true);
    expect(isValidRecoveryEmail('Member Name')).toBe(false);
  });
});
