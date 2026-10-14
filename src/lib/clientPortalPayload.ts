import type { EntityRow } from './secureWorkspace';
import type { ClientContact, ClientPortalPayload, Task, WorkspaceMember } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanPortalText = (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const portalRecords = (value: unknown) => (
  Array.isArray(value) ? value.filter(isRecord) : []
);

export const parseClientPortalPayload = (value: unknown, expectedWorkspaceId: string, expectedClientName?: string): ClientPortalPayload => {
  if (!isRecord(value)) throw new Error('Supabase returned an invalid Client portal response.');

  const workspaceId = cleanPortalText(value.workspaceId, 160);
  const clientName = cleanPortalText(value.clientName, 240);
  if (workspaceId !== expectedWorkspaceId || !clientName) {
    throw new Error('The Client portal response is not linked to this workspace.');
  }
  if (expectedClientName && clientName.toLocaleLowerCase() !== expectedClientName.trim().toLocaleLowerCase()) {
    throw new Error('The Client portal company does not match this account.');
  }

  const companyKey = clientName.trim().toLocaleLowerCase();
  const belongsToClient = (item: { clientName?: string }) => (
    cleanPortalText(item.clientName, 240).trim().toLocaleLowerCase() === companyKey
  );

  const tasks = portalRecords(value.tasks)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['tasks'];
  const projects = portalRecords(value.projects)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['projects'];
  const clients = portalRecords(value.clients)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['clients'];
  // Ignore contact metadata from older servers too: Clients never need the
  // internal member directory to review a delivery or share feedback.
  const contacts: ClientContact[] = [];
  const clientPlans = portalRecords(value.clientPlans)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['clientPlans'];
  const serviceCycles = portalRecords(value.serviceCycles)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['serviceCycles'];
  const deliverables = portalRecords(value.deliverables)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['deliverables'];
  const cycleComments = portalRecords(value.cycleComments)
    .filter(item => cleanPortalText(item.id, 160) && belongsToClient(item))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['cycleComments'];
  const taskComments = portalRecords(value.taskComments)
    .filter(item => cleanPortalText(item.id, 160) && cleanPortalText(item.taskId, 160))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['taskComments'];
  const taskApprovals = portalRecords(value.taskApprovals)
    .filter(item => cleanPortalText(item.id, 160) && cleanPortalText(item.taskId, 160))
    .map(item => ({ ...item })) as unknown as ClientPortalPayload['taskApprovals'];

  return { workspaceId, clientName, tasks, projects, clients, contacts, clientPlans, serviceCycles, deliverables, cycleComments, taskComments, taskApprovals };
};

/** Client-only canonical projection, loaded with the portal payload. */
export const projectClientPortalWorkspace = (clientPortal: ClientPortalPayload, currentUser: WorkspaceMember, entityRows: EntityRow[], customRoleId: string | null, SECURE_WORKSPACE_ID: string) => {
const projectionToEntityRow = (
  entityType: string,
  item: Record<string, unknown>,
  parentId?: string,
): EntityRow => {
  const { version, updatedAt, ...projection } = item;
  const data = entityType === 'task'
    ? {
        ...projection,
        department: 'Client',
        priority: 'Medium',
        createdBy: 'client-portal',
        isRecurring: false,
        recurrenceFrequency: 'None',
        dueReminderSent: false,
      }
    : projection;
  return {
    workspace_id: SECURE_WORKSPACE_ID,
    entity_type: entityType,
    entity_id: cleanPortalText(item.id, 160),
    parent_id: parentId || null,
    data,
    version: Math.max(1, Number(version) || 1),
    updated_at: cleanPortalText(updatedAt, 80) || new Date(0).toISOString(),
  };
};

  const clientContactUsers: WorkspaceMember[] = clientPortal?.contacts.map(contact => ({
    id: contact.id,
    name: contact.name,
    avatar: contact.avatar,
    role: 'Staff',
    departments: [],
    directoryOnly: true,
  })) || [];
  const users = [currentUser, ...clientContactUsers.filter(contact => contact.id !== currentUser.id)];
  const clientTaskIds = new Set(clientPortal?.tasks.map(task => task.id) || []);
  const clientCustomRoleId = customRoleId;
  const visibleEntityRows = currentUser.role === 'Client'
    ? entityRows.filter(row => (
        !['task', 'project', 'client', 'comment', 'approval', 'client_plan', 'service_cycle', 'deliverable', 'cycle_comment', 'addon', 'service_package', 'service_workflow_template', 'service_pricing_snapshot', 'registration', 'task_status'].includes(row.entity_type)
        && (row.entity_type !== 'custom_role' || row.entity_id === clientCustomRoleId)
      ))
    : entityRows;
  const projectedEntityRows: EntityRow[] = currentUser.role === 'Client' && clientPortal
    ? [
        ...clientPortal.tasks.map(item => projectionToEntityRow(
          'task',
          item as unknown as Record<string, unknown>,
          item.projectId,
        )),
        ...clientPortal.projects.map(item => projectionToEntityRow('project', item as unknown as Record<string, unknown>)),
        ...clientPortal.clients.map(item => projectionToEntityRow('client', item as unknown as Record<string, unknown>)),
        ...clientPortal.clientPlans.map(item => projectionToEntityRow('client_plan', item as unknown as Record<string, unknown>, item.clientId)),
        ...clientPortal.serviceCycles.map(item => projectionToEntityRow('service_cycle', item as unknown as Record<string, unknown>, item.planId)),
        ...clientPortal.deliverables.map(item => projectionToEntityRow('deliverable', item as unknown as Record<string, unknown>, item.cycleId)),
        ...clientPortal.cycleComments.map(item => projectionToEntityRow('cycle_comment', item as unknown as Record<string, unknown>, item.cycleId)),
      ]
    : [];
  const comments = new Map<string, Task['comments']>();
  const approvals = new Map<string, Task['approvalHistory']>();
    clientPortal.taskComments.forEach(item => {
      const { taskId, ...comment } = item;
      comments.set(taskId, [...(comments.get(taskId) || []), comment as unknown as NonNullable<Task['comments']>[number]]);
    });
    clientPortal.taskApprovals.forEach(item => {
      const { taskId, ...approval } = item;
      approvals.set(taskId, [...(approvals.get(taskId) || []), approval as unknown as NonNullable<Task['approvalHistory']>[number]]);
    });

  return { users, clientTaskIds, visibleEntityRows, projectedEntityRows, comments, approvals };
};
