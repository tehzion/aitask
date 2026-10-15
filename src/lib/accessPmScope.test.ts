import { describe, expect, it } from 'vitest';
import { allPermissions, sanitizeRolePermissions } from './access';

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
