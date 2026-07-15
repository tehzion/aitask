import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { normalizeWorkspaceUserForBackend, stripSensitiveWorkspaceFields } from './index';

const unlinkedMember: User = {
  id: 'unlinked-member-regression',
  name: 'Pending Invite',
  role: 'Staff',
  department: 'Designer',
  mustResetPassword: false,
};

describe('workspace member normalization', () => {
  it('does not apply local password-reset rules to secure Supabase members', () => {
    expect(normalizeWorkspaceUserForBackend(unlinkedMember, true).mustResetPassword).toBe(false);
  });

  it('keeps the local backend password-reset behavior', () => {
    expect(normalizeWorkspaceUserForBackend(unlinkedMember, false).mustResetPassword).toBe(true);
  });

  it('preserves password-reset metadata while removing actual secrets', () => {
    expect(stripSensitiveWorkspaceFields({
      mustResetPassword: true,
      must_reset_password: true,
      password: 'not-safe',
      apiToken: 'not-safe',
      nested: { secret: 'not-safe', name: 'Safe' },
    })).toEqual({
      mustResetPassword: true,
      must_reset_password: true,
      nested: { name: 'Safe' },
    });
  });
});
