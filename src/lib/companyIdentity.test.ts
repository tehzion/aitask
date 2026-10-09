import { describe, expect, it } from 'vitest';
import { legacyCompanyId, normalizeCompanyIdentities } from './companyIdentity';
import { parseWorkspaceSnapshot } from './security';
import type { PersistedWorkspaceState } from './supabaseSnapshot';

const state = (changes: Partial<PersistedWorkspaceState>) => ({ ...parseWorkspaceSnapshot({}), ...changes } as PersistedWorkspaceState);
const profile = (id: string, clientName: string) => ({ id, clientName, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
const rows = (clientId?: string, clientName = 'Renamed company') => state({
  tasks: [{ id: 'task', clientId, clientName, createdBy: 'owner' }] as PersistedWorkspaceState['tasks'],
  clientPlans: [{ id: 'plan', clientId, clientName: 'Old company' }] as PersistedWorkspaceState['clientPlans'],
  servicePricingSnapshots: [{ id: 'price', clientId }] as PersistedWorkspaceState['servicePricingSnapshots'],
});

describe('company identity normalization', () => {
  it('preserves a missing-profile ID across stale names and every linked collection', () => {
    const input = rows('stable');
    for (const key of ['projects','serviceCycles','deliverables','cycleComments','addons'] as const) Object.assign(input, { [key]: [{ id: key, clientId: 'stable', clientName: 'Historical name' }] });
    const result = normalizeCompanyIdentities(input);
    for (const key of ['tasks','projects','clientPlans','serviceCycles','deliverables','cycleComments','addons','servicePricingSnapshots'] as const) expect(result[key][0].clientId).toBe('stable');
    expect(normalizeCompanyIdentities(result)).toEqual(result);
  });
  it('remaps the complete unresolved ID group when one linked name identifies a canonical company', () => {
    const result = normalizeCompanyIdentities({ ...rows('orphan'), clients: [profile('canonical','Renamed company')] });
    expect(result.tasks[0].clientId).toBe('canonical');
    expect(result.clientPlans[0].clientId).toBe('canonical');
    expect(result.servicePricingSnapshots[0].clientId).toBe('canonical');
  });
  it('preserves authoritative IDs despite a name matching another company', () => {
    const result = normalizeCompanyIdentities({ ...rows('stable'), clients: [profile('stable','Canonical'),profile('other','Renamed company')] });
    expect(result.tasks[0].clientId).toBe('stable'); expect(result.clientPlans[0].clientId).toBe('stable');
  });
  it('preserves unresolved relationships when names identify different canonical companies', () => {
    const result = normalizeCompanyIdentities({ ...rows('orphan'), clients: [profile('a','Renamed company'),profile('b','Old company')] });
    expect(result.tasks[0].clientId).toBe('orphan'); expect(result.clientPlans[0].clientId).toBe('orphan');
  });
  it('does not merge same-name profiles or guess an ambiguous name-only link', () => {
    const result = normalizeCompanyIdentities({ ...rows(undefined), clients: [profile('a','Renamed company'),profile('b','Renamed company')] });
    expect(result.tasks[0].clientId).toBeUndefined(); expect(result.clients).toHaveLength(2);
  });
  it('repairs duplicate historical profile IDs without merging their ambiguous work', () => {
    const input = rows('CL-client'); input.clients = [profile('CL-client','甲公司'),profile('CL-client','乙公司')];
    input.tasks[0].clientName='甲公司'; input.clientPlans[0].clientName='乙公司';
    const result = normalizeCompanyIdentities(input);
    expect(new Set(result.clients.map(item => item.id)).size).toBe(2);
    expect(result.tasks[0].clientId).toBe('CL-client'); expect(result.clientPlans[0].clientId).toBe('CL-client');
    expect(normalizeCompanyIdentities(result)).toEqual(result);
  });
  it('hashes complete Unicode names in snapshot parsing and discovery', () => {
    const names = ['甲公司','乙公司','A.B','A B','a'.repeat(100)+'b','a'.repeat(100)+'c'];
    expect(new Set(names.map(legacyCompanyId)).size).toBe(names.length);
    expect(legacyCompanyId(' Cafe\u0301 ')).toBe(legacyCompanyId('CAFÉ'));
    const parsed = parseWorkspaceSnapshot({ clients: names.map(clientName => ({ clientName })) });
    expect(parsed.clients.map(item => item.id)).toEqual(names.map(legacyCompanyId));
    const result = normalizeCompanyIdentities(state({ tasks: names.map(clientName => ({ clientName })) as PersistedWorkspaceState['tasks'] }));
    expect(result.clients.map(item => item.id)).toEqual(names.map(legacyCompanyId));
    expect(normalizeCompanyIdentities(result)).toEqual(result);
  });
});
