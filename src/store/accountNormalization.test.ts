import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { normalizeWorkspaceUserForBackend } from './index';

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
});
