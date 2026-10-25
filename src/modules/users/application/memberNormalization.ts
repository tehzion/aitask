import { mockUsers } from '../../../mock/index';
import {
  createLocalServiceDemoFixture
} from '../../../mock/localServiceDemo';
import {
  defaultRolePermissions,
  getBuiltinRoleId,
  sanitizeRolePermissions
} from '../../../shared/authorization/access';
import {
  getLegacyDepartmentMirror,
  normalizeMemberDepartments
} from '../../../shared/authorization/departments';
import {
  type CustomRole,
  type Role,
  type User
} from '../../../shared/types/index';
import { getLocalUserPassword } from '../../authentication/domain/localCredentials';
export const BUILTIN_ROLE_DESCRIPTIONS: Record<Role, string> = {
  'Project Manager': 'Portfolio-scoped operational access. Account and role administration stays with Boss Koo.',
  HOD: 'Department lead with scoped task ownership and review access.',
  Staff: 'Standard employee access to assigned work.',
  Client: 'Reviews and approves their company work.',
};

export const BUILTIN_ROLE_SEEDED_AT = '2026-09-18T00:00:00.000Z';

export const BUILTIN_BASE_ROLES: Role[] = ['Project Manager', 'HOD', 'Staff', 'Client'];

export const makeBuiltinRole = (role: Role): CustomRole => ({
  id: getBuiltinRoleId(role),
  name: role,
  description: BUILTIN_ROLE_DESCRIPTIONS[role],
  baseRole: role,
  permissions: { ...defaultRolePermissions[role] },
  departmentScoped: role === 'HOD',
  isProtected: false,
  isBuiltin: true,
  createdAt: BUILTIN_ROLE_SEEDED_AT,
  updatedAt: BUILTIN_ROLE_SEEDED_AT,
});

export const ensureBuiltinRoleTemplate = (roles: CustomRole[] = []) => {
  const normalized = roles
    .filter(role => role.id !== 'system-hod')
    .filter(role => !(role.isBuiltin && !BUILTIN_BASE_ROLES.includes(role.baseRole)))
    .map(role => {
      if (!role.isBuiltin) return role;
      const builtin = makeBuiltinRole(role.baseRole);
      return {
        ...builtin,
        ...role,
        id: builtin.id,
        name: builtin.name,
        baseRole: builtin.baseRole,
        permissions: sanitizeRolePermissions(role.permissions, role.baseRole),
        departmentScoped: builtin.departmentScoped,
        isProtected: false,
        isBuiltin: true,
      };
    });
  const missing = BUILTIN_BASE_ROLES.filter(role => !normalized.some(item => item.id === getBuiltinRoleId(role)));
  return [...missing.map(makeBuiltinRole), ...normalized];
};

export const stripPassword = <T extends { password?: string }>(item: T): Omit<T, 'password'> => {
  const cleanItem = { ...item };
  delete cleanItem.password;
  return cleanItem;
};

export const normalizeUserAccount = (user: User): User => {
  const hasCustomPassword = Boolean(getLocalUserPassword(user.id));
  const departments = normalizeMemberDepartments(user.role, user.departments, user.department);

  return {
    ...stripPassword(user as User & { password?: string }) as User,
    departments,
    department: getLegacyDepartmentMirror(user.role, departments),
    mustResetPassword: Boolean(user.mustResetPassword) || (!user.authUserId && !hasCustomPassword),
  };
};

export const normalizeWorkspaceUserForBackend = (user: User, secureAuth: boolean): User => (
  secureAuth
    ? stripPassword(user as User & { password?: string }) as User
    : normalizeUserAccount(user)
);

export const seedUserIdentity = new Map([
  ...mockUsers,
  ...((import.meta.env.DEV || import.meta.env.VITE_AITASK_BACKEND === 'local') ? createLocalServiceDemoFixture().users : []),
].map(user => [user.id, user]));

export const sanitizePersistedUsers = (users: User[]): User[] => (
  users.map(user => {
    const seed = seedUserIdentity.get(user.id);
    if (!seed) return { ...user, permissions: undefined };
    return {
      ...user,
      role: seed.role,
      isSuperAdmin: seed.isSuperAdmin === true,
      departments: seed.departments,
      department: seed.department,
      permissions: undefined,
    };
  })
);
