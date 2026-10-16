import { describe, expect, it } from 'vitest';
import type { ClientProfile, Project, User } from '../types';
import { allPermissions, getOwnedPortfolioClientKeys, sanitizeRolePermissions } from './access';

describe('sanitizeRolePermissions for project managers', () => {
  it('strips workspace-wide view permissions that scoping ignores for a Project Manager', () => {
    const permissions = sanitizeRolePermissions(allPermissions, 'Project Manager');
    expect(permissions.viewAllTasks).toBe(false);
    expect(permissions.viewAllClients).toBe(false);
    expect(permissions.viewDashboard).toBe(true);
  });

  it('does not strip those keys for Staff', () => {
    const permissions = sanitizeRolePermissions(allPermissions, 'Staff');
    expect(permissions.viewAllTasks).toBe(true);
  });

  it('keeps the HOD department-scope restrictions', () => {
    const permissions = sanitizeRolePermissions(allPermissions, 'HOD');
    expect(permissions.viewAllTasks).toBe(false);
    expect(permissions.manageClientPlans).toBe(false);
  });
});

describe('getOwnedPortfolioClientKeys', () => {
  it('includes owned companies and owned-project clients but never merely-assigned companies', () => {
    const pm = { id: 'pm', role: 'Project Manager' } as User;
    const clients = [
      { id: 'c1', clientName: 'Owned Co', createdBy: 'pm' },
      { id: 'c2', clientName: 'Assigned Co', createdBy: 'other-pm' },
    ] as ClientProfile[];
    const projects = [
      { id: 'p1', clientName: 'Project Co', createdBy: 'pm' },
      { id: 'p2', clientName: 'Foreign Project Co', createdBy: 'other-pm' },
    ] as Project[];
    expect([...getOwnedPortfolioClientKeys(pm, { clients, projects })].sort()).toEqual(['owned co', 'project co']);
  });
});
