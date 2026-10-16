import { describe, expect, it } from 'vitest';
import type { ClientProfile, User } from '../types';
import { canDeleteClientProfile, canEditClientProfile } from './access';

const pmA: User = { id: 'pm-a', name: 'PM A', role: 'Project Manager', departments: [] };
const pmB: User = { id: 'pm-b', name: 'PM B', role: 'Project Manager', departments: [] };

// Two distinct companies that share a name — the case the id-based scope exists
// to protect. Only the id can tell them apart.
const profiles: ClientProfile[] = [
  { id: 'a1', clientName: 'Acme', createdBy: 'pm-a', createdAt: '', updatedAt: '' },
  { id: 'a2', clientName: 'Acme', createdBy: 'pm-b', createdAt: '', updatedAt: '' },
];

describe('duplicate company names resolve by client id', () => {
  it('authorizes a PM against the exact record, not the first name match', () => {
    expect(canDeleteClientProfile(pmA, 'Acme', profiles, [], [], 'a1')).toBe(true);
    expect(canDeleteClientProfile(pmA, 'Acme', profiles, [], [], 'a2')).toBe(false);
    expect(canDeleteClientProfile(pmB, 'Acme', profiles, [], [], 'a2')).toBe(true);
    expect(canDeleteClientProfile(pmB, 'Acme', profiles, [], [], 'a1')).toBe(false);
  });

  it('lets a PM edit only the record they own when names collide', () => {
    expect(canEditClientProfile(pmA, 'Acme', [], [], profiles, 'a1')).toBe(true);
    expect(canEditClientProfile(pmA, 'Acme', [], [], profiles, 'a2')).toBe(false);
  });

  it('keeps the legacy name-based fallback when no id is supplied', () => {
    expect(canDeleteClientProfile(pmA, 'Acme', profiles)).toBe(true);
    expect(canDeleteClientProfile(pmB, 'Acme', profiles)).toBe(false);
  });
});
