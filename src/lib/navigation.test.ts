import { describe, expect, it } from 'vitest';
import type { CustomRole, User } from '../types';
import { defaultRolePermissions } from './access';
import { getDeliveryWorkspaceLabel, getMobileNavigation, getNavigationSections } from './navigation';

const internalUsers: User[] = [
  { id: 'boss', name: 'Boss Koo', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true },
  { id: 'pm', name: 'Project Manager', role: 'Project Manager', departments: ['Management'], department: 'Management' },
  { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' },
  { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' },
];

describe('delivery tracker navigation labels', () => {
  it('labels the Project Manager members page without implying access requests', () => {
    const [boss, pm] = internalUsers;
    expect(getNavigationSections(pm).primary.find(entry => entry.path === '/approvals')).toMatchObject({ label: 'Team members' });
    expect(getNavigationSections(boss).primary.find(entry => entry.path === '/approvals')).toMatchObject({ label: 'Approvals' });
  });

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

  it('labels the HOD primary destinations for department oversight', () => {
    const hod = internalUsers.find(user => user.id === 'hod')!;
    const staff = internalUsers.find(user => user.id === 'staff')!;
    const hodSections = getNavigationSections(hod);
    expect(hodSections.primary.find(entry => entry.path === '/')).toMatchObject({ label: 'Department work' });
    expect([...hodSections.primary, ...hodSections.secondary].find(entry => entry.path === '/tasks')).toMatchObject({ label: 'Department tasks' });
    const staffSections = getNavigationSections(staff);
    expect(staffSections.primary.find(entry => entry.path === '/')).toMatchObject({ label: 'My work' });
    expect(staffSections.secondary.find(entry => entry.path === '/tasks')).toMatchObject({ label: 'All work' });
  });

  it('labels a department-scoped Staff lead for oversight like the page header', () => {
    const lead: User = { id: 'dept-lead', name: 'Department lead', role: 'Staff', departments: ['Designer'], department: 'Designer', customRoleId: 'dept-lead-role' };
    const role: CustomRole = {
      id: 'dept-lead-role', name: 'Department lead', baseRole: 'Staff', departmentScoped: true,
      permissions: { ...defaultRolePermissions.Staff, manageCreatedTasks: true }, createdAt: '', updatedAt: '',
    };
    const sections = getNavigationSections(lead, [role]);
    expect(sections.primary.find(entry => entry.path === '/')).toMatchObject({ label: 'Department work' });
    expect(sections.secondary.find(entry => entry.path === '/tasks')).toMatchObject({ label: 'Department tasks' });
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
