import {
  canViewTask,
  isNotificationReadByUser,
  isNotificationVisible
} from '../../../shared/authorization/access';
import { getDepartmentReviewers } from '../../../shared/authorization/taskWorkflowAccess';
import {
  type AppNotification,
  type ClientProfile,
  type CustomRole,
  type Project,
  type Task,
  type User
} from '../../../shared/types/index';
import { type NotificationDraft } from '../../../shared/types/workspaceStore';
import { nowId } from '../../../shared/validation/workspaceInput';
import { normalizeClientKey } from '../../clients/application/clientScope';
import { taskWorkContactId } from '../../tasks/domain/staffWorkflow';
import { enrichNotificationMetadata } from '../services/notificationCenter';
export const shouldNotifyClientForTask = (
  task: Pick<Task, 'visibility' | 'clientName'>,
  nextStatus: string,
) => (
  (nextStatus === 'Completed' || nextStatus === 'Approved')
  && task.visibility === 'client-visible'
  && normalizeClientKey(task.clientName).length > 0
);

export const makeNotification = (data: NotificationDraft): AppNotification | null => {
  const targetUserId = data.targetUserId?.trim() || undefined;
  const targetClient = data.targetClient?.trim() || undefined;
  const audienceCount = [targetUserId, data.targetRole, targetClient].filter(Boolean).length;

  // Keep malformed drafts out of both the local store and secure workspace
  // commands. The database enforces the same one-audience invariant for Staff
  // commands; enforcing it here avoids blank-target rows and retry loops.
  if (audienceCount !== 1) return null;

  return enrichNotificationMetadata({
    ...data,
    targetUserId,
    targetClient,
    id: nowId('N'),
    isRead: false,
    readByUserIds: [],
    createdAt: new Date().toISOString(),
  });
};

export const appendNotification = (notifications: AppNotification[], data: NotificationDraft) => {
  const notification = makeNotification(data);
  if (notification) notifications.push(notification);
};

export const resolveTaskUpdateRecipientIds = (
  users: User[],
  task: Task,
  clients: ClientProfile[],
  projects: Project[],
  roles: CustomRole[],
  includeTaskContact = true,
): string[] => {
  const recipientIds = new Set<string>();
  users.forEach(user => {
    if (user.isSuperAdmin) recipientIds.add(user.id);
  });
  const resolvePm = (id?: string) => {
    const user = id ? users.find(item => item.id === id) : undefined;
    return user && user.role === 'Project Manager' && !user.isSuperAdmin ? user.id : undefined;
  };
  const project = task.projectId ? projects.find(item => item.id === task.projectId) : undefined;
  const candidatePmIds = [resolvePm(task.assignedBy), resolvePm(task.createdBy)];
  if (project) {
    candidatePmIds.push(...(project.projectManagerIds ?? [project.createdBy]).map(resolvePm));
  } else {
    const client = clients.find(item => normalizeClientKey(item.clientName) === normalizeClientKey(task.clientName));
    candidatePmIds.push(resolvePm(client?.createdBy));
  }
  [...new Set(candidatePmIds.filter((id): id is string => Boolean(id)))].forEach(id => {
    const manager = users.find(user => user.id === id);
    if (manager && canViewTask(manager, task, roles, { clients, projects })) recipientIds.add(id);
  });
  const contact = users.find(user => user.id === taskWorkContactId(task));
  if (includeTaskContact && contact && contact.hasLogin !== false && contact.role !== 'Client'
    && canViewTask(contact, task, roles, { clients, projects })) recipientIds.add(contact.id);
  return [...recipientIds];
};

export const taskUpdateNotifications = (
  recipientIds: string[],
  data: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'targetUserId' | 'targetRole' | 'targetClient'>,
  excludeUserId?: string,
): AppNotification[] => recipientIds
  .filter(recipientId => recipientId !== excludeUserId)
  .map(targetUserId => makeNotification({ ...data, targetUserId }))
  .filter((notification): notification is AppNotification => Boolean(notification));

export const localHodReviewNotifications = (users: User[], roles: CustomRole[], before: Task | undefined, after: Task, actorId: string, scope: { clients: ClientProfile[]; projects: Project[] }) => {
  if (after.status !== 'Waiting Approval' || before?.status === after.status) return [];
  return taskUpdateNotifications(getDepartmentReviewers(users, after, roles, scope).map(user => user.id), {
    title: 'Task Ready for Approval',
    message: `"${after.title}" is ready for review.`,
    route: { page: 'tasks', entityId: after.id },
    iconType: 'status',
  }, actorId);
};

export const getNotificationReadReceipts = (
  notification: AppNotification,
  users: User[],
) => {
  if (notification.readByUserIds !== undefined) return [...notification.readByUserIds];
  if (!notification.isRead) return [];
  return users
    .filter(user => isNotificationVisible(user, notification))
    .map(user => user.id);
};

export const countUnreadForUser = (user: User | null | undefined, notifications: AppNotification[]) => (
  notifications.filter(notification => (
    isNotificationVisible(user, notification) && !isNotificationReadByUser(user, notification)
  )).length
);
