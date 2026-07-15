import type {
  AppNotification,
  ClientProfile,
  ClientApprovalStatus,
  CustomRole,
  Department,
  NotificationRoute,
  Priority,
  Project,
  RecurrenceFrequency,
  Registration,
  Role,
  Task,
  TaskApprovalEvent,
  TaskComment,
  User,
} from '../types';
import { getTodayInputDate } from './utils';

const roles = new Set<Role>(['Admin', 'Staff', 'Client']);
const departments = new Set<Department>([
  'Operation',
  'Management',
  'Videoshooting',
  'Ads Management',
  'Account & Finance',
  'Designer',
  'Editor',
  'Client',
]);
const priorities = new Set<Priority>(['Low', 'Medium', 'High', 'Urgent']);
const approvalStatuses = new Set<ClientApprovalStatus>(['Pending', 'Approved', 'Rejected']);
const recurrenceFrequencies = new Set<RecurrenceFrequency>(['None', 'Daily', 'Weekly', 'Monthly']);
const routePages = new Set<NotificationRoute['page']>([
  'dashboard',
  'tasks',
  'calendar',
  'clients',
  'projects',
  'reports',
  'approvals',
  'settings',
]);
const iconTypes = new Set<AppNotification['iconType']>(['task', 'status', 'success', 'alert']);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

type UnknownRecord = Record<string, unknown>;

export interface SafeWorkspaceState {
  users: User[];
  clients: ClientProfile[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  registrations: Registration[];
  rolePermissions: CustomRole[];
  taskStatuses: string[];
  deletedUserIds: string[];
  deletedRoleIds: string[];
  deletedTaskStatuses: string[];
  deletedClientIds: string[];
}

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const stripControlCharacters = (value: string) => {
  let cleanValue = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isAllowedWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
    if (code === 0x7f || (code < 0x20 && !isAllowedWhitespace)) continue;
    cleanValue += value[index];
  }
  return cleanValue;
};

const cleanText = (value: unknown, maxLength: number, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return stripControlCharacters(value).trim().slice(0, maxLength);
};

const optionalText = (value: unknown, maxLength: number) => cleanText(value, maxLength) || undefined;

const safeIsoDate = (value: unknown, fallback: string) => {
  const date = cleanText(value, 10);
  return isoDate.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? date : fallback;
};

const safeIsoTimestamp = (value: unknown) => {
  const timestamp = cleanText(value, 40);
  return timestamp && !Number.isNaN(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : undefined;
};

const safeStringArray = (value: unknown, maxItems = 500, maxLength = 120) => (
  Array.isArray(value)
    ? value.slice(0, maxItems).map(item => cleanText(item, maxLength)).filter(Boolean)
    : []
);

export const safeHttpsUrl = (value: unknown): string | null => {
  const candidate = cleanText(value, 2048);
  if (!candidate || /[\\\s]/.test(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

export const safeAvatarSource = (value: unknown): string | undefined => {
  const candidate = cleanText(value, 2_000_000);
  if (!candidate) return undefined;
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(candidate)) return candidate;
  if (candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.includes('\\')) return candidate;
  const avatarUrl = safeHttpsUrl(candidate);
  if (!avatarUrl) return undefined;

  try {
    const parsed = new URL(avatarUrl);
    if (parsed.hostname === 'i.pravatar.cc' || parsed.hostname.endsWith('.supabase.co')) return avatarUrl;
  } catch {
    return undefined;
  }

  return undefined;
};

export const parseNotificationRoute = (value: unknown): NotificationRoute | null => {
  if (!isRecord(value)) return null;
  const page = cleanText(value.page, 24) as NotificationRoute['page'];
  if (!routePages.has(page)) return null;
  const entityId = optionalText(value.entityId, 160);
  return entityId ? { page, entityId } : { page };
};

export const legacyLinkToNotificationRoute = (value: unknown): NotificationRoute | null => {
  const link = cleanText(value, 512);
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;

  try {
    const parsed = new URL(link, 'https://aitask.invalid');
    if (parsed.origin !== 'https://aitask.invalid' || parsed.hash) return null;

    const routeMap: Record<string, NotificationRoute['page']> = {
      '/': 'dashboard',
      '/dashboard': 'dashboard',
      '/tasks': 'tasks',
      '/calendar': 'calendar',
      '/clients': 'clients',
      '/projects': 'projects',
      '/reports': 'reports',
      '/approvals': 'approvals',
      '/settings': 'settings',
    };
    const page = routeMap[parsed.pathname];
    if (!page) return null;

    const allowedQuery = page === 'tasks' ? new Set(['taskId', 'client']) : new Set<string>();
    if ([...parsed.searchParams.keys()].some(key => !allowedQuery.has(key))) return null;
    const entityId = page === 'tasks' ? optionalText(parsed.searchParams.get('taskId'), 160) : undefined;
    return entityId ? { page, entityId } : { page };
  } catch {
    return null;
  }
};

export const notificationRouteToPath = (route: unknown): string => {
  const parsedRoute = parseNotificationRoute(route) || legacyLinkToNotificationRoute(route);
  if (!parsedRoute) return '/';

  const basePaths: Record<NotificationRoute['page'], string> = {
    dashboard: '/',
    tasks: '/tasks',
    calendar: '/calendar',
    clients: '/clients',
    projects: '/projects',
    reports: '/reports',
    approvals: '/approvals',
    settings: '/settings',
  };
  const base = basePaths[parsedRoute.page] || '/';
  return parsedRoute.page === 'tasks' && parsedRoute.entityId
    ? `${base}?taskId=${encodeURIComponent(parsedRoute.entityId)}`
    : base;
};

const parseComment = (value: unknown): TaskComment | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const userId = cleanText(value.userId, 160);
  const text = cleanText(value.text, 10_000);
  const createdAt = safeIsoTimestamp(value.createdAt);
  return id && userId && text && createdAt ? {
    id,
    userId,
    text,
    createdAt,
    version: Math.max(1, Number(value.version) || 1),
    updatedAt: safeIsoTimestamp(value.updatedAt),
  } : null;
};

const parseApprovalEvent = (value: unknown): TaskApprovalEvent | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const userId = cleanText(value.userId, 160);
  const status = cleanText(value.status, 20) as ClientApprovalStatus;
  const createdAt = safeIsoTimestamp(value.createdAt);
  if (!id || !userId || !approvalStatuses.has(status) || !createdAt) return null;
  return {
    id,
    userId,
    status,
    note: optionalText(value.note, 5000),
    createdAt,
    version: Math.max(1, Number(value.version) || 1),
    updatedAt: safeIsoTimestamp(value.updatedAt),
  };
};

const parseUser = (value: unknown): User | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const name = cleanText(value.name, 160);
  const role = cleanText(value.role, 20) as Role;
  const department = cleanText(value.department, 80) as Department;
  if (!id || !name || !roles.has(role) || !departments.has(department)) return null;

  return {
    id,
    version: Math.max(1, Number(value.version) || 1),
    authUserId: optionalText(value.authUserId, 160),
    workspaceId: optionalText(value.workspaceId, 160),
    name,
    email: optionalText(value.email, 320),
    role,
    department,
    avatar: safeAvatarSource(value.avatar),
    companyName: optionalText(value.companyName, 240),
    isSuperAdmin: value.isSuperAdmin === true,
    mustResetPassword: value.mustResetPassword === true,
    customRoleId: optionalText(value.customRoleId, 160),
    customRoleName: optionalText(value.customRoleName, 160),
    permissions: isRecord(value.permissions) ? value.permissions as User['permissions'] : undefined,
    updatedAt: safeIsoTimestamp(value.updatedAt),
  };
};

const parseClientProfile = (value: unknown): ClientProfile | null => {
  if (!isRecord(value)) return null;
  const clientName = cleanText(value.clientName, 240);
  if (!clientName) return null;

  const now = new Date().toISOString();
  const id = cleanText(value.id, 160) || `CL-${clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'client'}`;
  const createdAt = safeIsoTimestamp(value.createdAt) || safeIsoTimestamp(value.updatedAt) || now;

  return {
    id,
    version: Math.max(1, Number(value.version) || 1),
    clientName,
    contactPerson: optionalText(value.contactPerson, 160),
    email: optionalText(value.email, 320),
    phone: optionalText(value.phone, 80),
    address: optionalText(value.address, 1000),
    website: safeHttpsUrl(value.website) || undefined,
    facebookPage: safeHttpsUrl(value.facebookPage) || undefined,
    notes: optionalText(value.notes, 5000),
    createdAt,
    updatedAt: safeIsoTimestamp(value.updatedAt) || createdAt,
  };
};

const parseProject = (value: unknown): Project | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const clientName = cleanText(value.clientName, 240);
  const projectName = cleanText(value.projectName, 240);
  if (!id || !clientName || !projectName) return null;
  const today = getTodayInputDate();

  return {
    id,
    version: Math.max(1, Number(value.version) || 1),
    clientId: optionalText(value.clientId, 160),
    workspaceId: optionalText(value.workspaceId, 160),
    createdBy: optionalText(value.createdBy, 160),
    clientName,
    projectName,
    services: safeStringArray(value.services, 50, 120),
    startDate: safeIsoDate(value.startDate, today),
    deadline: cleanText(value.deadline, 10) ? safeIsoDate(value.deadline, today) : '',
    totalTasks: Math.max(0, Number(value.totalTasks) || 0),
    completedTasks: Math.max(0, Number(value.completedTasks) || 0),
    updatedAt: safeIsoTimestamp(value.updatedAt),
  };
};

export const parseTask = (value: unknown): Task | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const clientName = cleanText(value.clientName, 240);
  const serviceType = cleanText(value.serviceType, 120);
  const title = cleanText(value.title, 500);
  const department = cleanText(value.department, 80) as Department;
  const assignedTo = cleanText(value.assignedTo, 160);
  const createdBy = cleanText(value.createdBy, 160);
  const priority = cleanText(value.priority, 20) as Priority;
  const status = cleanText(value.status, 80);
  const clientApprovalStatus = cleanText(value.clientApprovalStatus, 20) as ClientApprovalStatus;
  const recurrenceFrequency = cleanText(value.recurrenceFrequency, 20) as RecurrenceFrequency;
  if (!id || !clientName || !serviceType || !title || !departments.has(department) || !assignedTo || !createdBy || !priorities.has(priority) || !status) return null;
  const today = getTodayInputDate();

  return {
    id,
    version: Math.max(1, Number(value.version) || 1),
    workspaceId: optionalText(value.workspaceId, 160),
    clientId: optionalText(value.clientId, 160),
    projectId: optionalText(value.projectId, 160),
    clientName,
    customerDetails: optionalText(value.customerDetails, 5000),
    facebookPage: safeHttpsUrl(value.facebookPage) || undefined,
    website: safeHttpsUrl(value.website) || undefined,
    projectName: optionalText(value.projectName, 240),
    serviceType,
    title,
    description: cleanText(value.description, 20_000),
    department,
    assignedTo,
    createdBy,
    startDate: safeIsoDate(value.startDate, today),
    dueDate: cleanText(value.dueDate, 10) ? safeIsoDate(value.dueDate, '') : '',
    priority,
    status,
    completionPercentage: Math.min(100, Math.max(0, Number(value.completionPercentage) || 0)),
    attachmentLink: safeHttpsUrl(value.attachmentLink) || undefined,
    attachmentName: optionalText(value.attachmentName, 240),
    notes: optionalText(value.notes, 20_000),
    isCompleted: value.isCompleted === true,
    revisionCount: Math.max(0, Number(value.revisionCount) || 0),
    clientApprovalStatus: approvalStatuses.has(clientApprovalStatus) ? clientApprovalStatus : 'Pending',
    isRecurring: value.isRecurring === true,
    recurrenceFrequency: recurrenceFrequencies.has(recurrenceFrequency) ? recurrenceFrequency : 'None',
    dueReminderSent: value.dueReminderSent === true,
    comments: Array.isArray(value.comments) ? value.comments.map(parseComment).filter((item): item is TaskComment => Boolean(item)) : [],
    approvalHistory: Array.isArray(value.approvalHistory) ? value.approvalHistory.map(parseApprovalEvent).filter((item): item is TaskApprovalEvent => Boolean(item)) : [],
    updatedAt: safeIsoTimestamp(value.updatedAt),
  };
};

export const parseNotification = (value: unknown): AppNotification | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const title = cleanText(value.title, 240);
  const message = cleanText(value.message, 2000);
  const createdAt = safeIsoTimestamp(value.createdAt);
  const route = parseNotificationRoute(value.route) || legacyLinkToNotificationRoute(value.link);
  const iconType = cleanText(value.iconType, 20) as AppNotification['iconType'];
  if (!id || !title || !message || !createdAt || !route || !iconTypes.has(iconType)) return null;

  return {
    id,
    version: Math.max(1, Number(value.version) || 1),
    targetUserId: optionalText(value.targetUserId, 160),
    targetRole: roles.has(value.targetRole as Role) ? value.targetRole as Role : undefined,
    targetClient: optionalText(value.targetClient, 240),
    title,
    message,
    route,
    isRead: value.isRead === true,
    readByUserIds: safeStringArray(value.readByUserIds, 1000, 160),
    createdAt,
    iconType,
  };
};

const parseRegistration = (value: unknown): Registration | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 160);
  const name = cleanText(value.name, 160);
  const email = cleanText(value.email, 320);
  const requestedRole = cleanText(value.requestedRole, 20) as Role;
  const status = cleanText(value.status, 20) as Registration['status'];
  const createdAt = safeIsoTimestamp(value.createdAt);
  if (!id || !name || !email || !roles.has(requestedRole) || !['Pending', 'Approved', 'Rejected'].includes(status) || !createdAt) return null;
  return {
    id,
    version: Math.max(1, Number(value.version) || 1),
    name,
    email,
    phone: cleanText(value.phone, 80),
    jobPosition: cleanText(value.jobPosition, 160),
    requestedRole,
    status,
    createdAt,
    updatedAt: safeIsoTimestamp(value.updatedAt),
  };
};

export const parseWorkspaceSnapshot = (value: unknown): SafeWorkspaceState => {
  const record = isRecord(value) ? value : {};
  const mapValid = <T>(items: unknown, parser: (item: unknown) => T | null): T[] => (
    Array.isArray(items) ? items.map(parser).filter((item): item is T => Boolean(item)) : []
  );

  return {
    users: mapValid(record.users, parseUser),
    clients: mapValid(record.clients, parseClientProfile),
    projects: mapValid(record.projects, parseProject),
    tasks: mapValid(record.tasks, parseTask),
    notifications: mapValid(record.notifications, parseNotification),
    registrations: mapValid(record.registrations, parseRegistration),
    rolePermissions: Array.isArray(record.rolePermissions) ? record.rolePermissions.filter(isRecord) as unknown as CustomRole[] : [],
    taskStatuses: safeStringArray(record.taskStatuses, 100, 80),
    deletedUserIds: safeStringArray(record.deletedUserIds, 2000, 160),
    deletedRoleIds: safeStringArray(record.deletedRoleIds, 2000, 160),
    deletedTaskStatuses: safeStringArray(record.deletedTaskStatuses, 2000, 80),
    deletedClientIds: safeStringArray(record.deletedClientIds, 2000, 160),
  };
};
