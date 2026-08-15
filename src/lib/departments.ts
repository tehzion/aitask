import type { Department, Role, WorkspaceMember } from '../types';

export const STAFF_DEPARTMENTS = [
  'Operation',
  'Management',
  'Video Shooting',
  'Video Editor',
  'Ads Management',
  'Account & Finance',
  'Designer',
] as const satisfies readonly Department[];

export const DEPARTMENTS = [
  ...STAFF_DEPARTMENTS,
  'Client',
] as const satisfies readonly Department[];

const departmentAliases: Record<string, Department> = {
  operation: 'Operation',
  operations: 'Operation',
  management: 'Management',
  videoshooting: 'Video Shooting',
  'video shooting': 'Video Shooting',
  shooting: 'Video Shooting',
  videography: 'Video Shooting',
  editor: 'Video Editor',
  'video editor': 'Video Editor',
  'video editing': 'Video Editor',
  editing: 'Video Editor',
  'ads management': 'Ads Management',
  ads: 'Ads Management',
  advertising: 'Ads Management',
  'account & finance': 'Account & Finance',
  account: 'Account & Finance',
  finance: 'Account & Finance',
  'account and finance': 'Account & Finance',
  designer: 'Designer',
  design: 'Designer',
  graphic: 'Designer',
  client: 'Client',
};

export const normalizeDepartment = (value: unknown): Department | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (departmentAliases[normalized]) return departmentAliases[normalized];
  const exact = DEPARTMENTS.find(department => department.toLowerCase() === normalized);
  return exact || null;
};

const departmentOrder = new Map<Department, number>(
  DEPARTMENTS.map((department, index) => [department, index]),
);

export const normalizeDepartments = (value: unknown): Department[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map(normalizeDepartment)
    .filter((department): department is Department => Boolean(department));
  return [...new Set(normalized)].sort(
    (left, right) => (departmentOrder.get(left) ?? 99) - (departmentOrder.get(right) ?? 99),
  );
};

export const normalizeMemberDepartments = (
  role: Role,
  value: unknown,
  legacyDepartment?: unknown,
): Department[] => {
  if (role === 'Client') return ['Client'];
  const departments = normalizeDepartments(value).filter(department => department !== 'Client');
  if (departments.length > 0) return departments;
  const legacy = normalizeDepartment(legacyDepartment);
  return legacy && legacy !== 'Client' ? [legacy] : [];
};

export const getMemberDepartments = (
  member: Pick<WorkspaceMember, 'role' | 'departments' | 'department'>,
): Department[] => normalizeMemberDepartments(member.role, member.departments, member.department);

export const isMemberInDepartment = (
  member: Pick<WorkspaceMember, 'role' | 'departments' | 'department'>,
  department: Department,
) => getMemberDepartments(member).includes(normalizeDepartment(department) || department);

export const getLegacyDepartmentMirror = (role: Role, departments: unknown): Department => {
  if (role === 'Client') return 'Client';
  return normalizeMemberDepartments(role, departments)[0] || 'Designer';
};
