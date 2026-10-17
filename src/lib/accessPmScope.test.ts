import { describe, expect, it } from 'vitest';
import type { ClientProfile, Project, User } from '../types';
import { allPermissions, getGrantablePermissionGroups, getOwnedPortfolioClientKeys, permissionGroups, sanitizeRolePermissions } from './access';

describe('sanitizeRolePermissions for project managers', () => {
  it('never offers non-grantable permissions in an editor group', () => {
    const nonGrantable = ['manageUsers', 'approveRegistrations', 'deleteUsers', 'viewApprovals'];
    const editorKeys = permissionGroups.flatMap(group => group.keys);
    expect(editorKeys).not.toEqual(expect.arrayContaining(nonGrantable));

    for (const baseRole of ['Project Manager', 'HOD', 'Staff', 'Client'] as const) {
      const keys = getGrantablePermissionGroups(baseRole).flatMap(group => group.keys);
      const offered = { ...allPermissions };
      Object.keys(offered).forEach(key => { offered[key as keyof typeof offered] = keys.includes(key as keyof typeof offered); });
      const sanitized = sanitizeRolePermissions(offered, baseRole);
      expect(keys.filter(key => sanitized[key] !== offered[key])).toEqual([]);
    }
  });

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

describe('department-scoped custom roles', () => {
  it('strips workspace-wide view keys for a department-scoped Staff role', () => {
    const permissions = sanitizeRolePermissions(allPermissions, 'Staff', { departmentScoped: true });
    expect(permissions.viewAllTasks).toBe(false);
    expect(permissions.viewAllClients).toBe(false);
    expect(permissions.viewDashboard).toBe(true);
    expect(permissions.createTasks).toBe(true);
  });

  it('does not offer workspace-wide view keys to a department-scoped role editor', () => {
    const keys = getGrantablePermissionGroups('Staff', { departmentScoped: true }).flatMap(group => group.keys);
    expect(keys).not.toContain('viewAllTasks');
    expect(keys).not.toContain('viewAllClients');
    expect(keys).toContain('createTasks');
  });

  it('keeps those keys grantable for a plain Staff role', () => {
    const keys = getGrantablePermissionGroups('Staff').flatMap(group => group.keys);
    expect(keys).toContain('viewAllTasks');
    expect(sanitizeRolePermissions(allPermissions, 'Staff').viewAllTasks).toBe(true);
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
