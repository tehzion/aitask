import type { ClientContact, ClientPortalPayload } from '../types';

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
