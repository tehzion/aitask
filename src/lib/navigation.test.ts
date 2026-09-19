import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { getDeliveryWorkspaceLabel, getMobileNavigation, getNavigationSections } from './navigation';

const internalUsers: User[] = [
  { id: 'boss', name: 'Boss Koo', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true },
  { id: 'pm', name: 'Project Manager', role: 'Project Manager', departments: ['Management'], department: 'Management' },
  { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' },
  { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' },
];

describe('delivery tracker navigation labels', () => {
  it('uses Delivery tracker for every internal role while preserving the /clients route', () => {
    internalUsers.forEach(user => {
      const sections = getNavigationSections(user);
      const item = [...sections.primary, ...sections.secondary].find(entry => entry.path === '/clients');
      expect(item, user.role).toMatchObject({ label: 'Delivery tracker', path: '/clients' });
    });
  });

  it('uses Delivery tracker in the internal mobile navigation', () => {
    internalUsers.slice(0, 2).forEach(user => {
      expect(getMobileNavigation(user).find(entry => entry.path === '/clients')).toMatchObject({
        label: 'Delivery tracker',
        path: '/clients',
      });
    });
    internalUsers.slice(2).forEach(user => {
      expect(getMobileNavigation(user).find(entry => entry.path === '/clients')).toMatchObject({
        label: 'Delivery tracker',
        path: '/clients',
      });
    });
  });

  it('keeps the Client portal navigation label as Deliveries', () => {
    const client: User = { id: 'client', name: 'Client', role: 'Client', departments: ['Client'], department: 'Client', companyName: 'Acme' };
    const item = getNavigationSections(client).primary.find(entry => entry.path === '/clients');
    expect(item).toMatchObject({ label: 'Deliveries', path: '/clients' });
  });

  it('keeps the command palette workspace label role-aware', () => {
    expect(getDeliveryWorkspaceLabel(internalUsers[1])).toBe('Delivery tracker');
    expect(getDeliveryWorkspaceLabel({
      id: 'client',
      name: 'Client',
      role: 'Client',
      departments: ['Client'],
      department: 'Client',
    })).toBe('Deliveries');
  });
});
