import {
  canOpenServiceClient,
  isBossKoo
} from '../../../shared/authorization/access';
import { type StoreState } from '../../../shared/types/workspaceStore';
export const normalizeClientKey = (value?: string | null) => value?.trim().toLowerCase() || '';

export const isServiceClientInScope = (state: StoreState, clientId: string) => {
  const actor = state.currentUser;
  if (!actor) return false;
  if (isBossKoo(actor) || actor.role !== 'Project Manager') return true;
  const client = state.clients.find(item => item.id === clientId);
  if (!client) return false;
  // Authorize the exact record by id. When the company has an owner, a matching
  // name must never widen the portfolio: a duplicate "Acme" owned by another PM
  // is out of scope unless this PM participates via work bound to this clientId.
  if (client.createdBy) {
    if (client.createdBy === actor.id) return true;
    return state.tasks.some(task => task.clientId === clientId && (task.createdBy === actor.id || task.assignedTo === actor.id))
      || state.projects.some(project => project.clientId === clientId && project.createdBy === actor.id);
  }
  // Legacy/discovered records carry no owner, so fall back to the name-based check.
  return canOpenServiceClient(actor, client.clientName, state.tasks, state.rolePermissions, state.clients, state.projects);
};

export const serviceClientScopeError = 'This company is outside your portfolio.';

export const taskCompanyScopeError = (state: StoreState, clientName: string, clientId?: string) => {
  const actor = state.currentUser;
  if (!actor || isBossKoo(actor) || actor.role !== 'Project Manager') return undefined;
  if (!canOpenServiceClient(actor, clientName, state.tasks, state.rolePermissions, state.clients, state.projects)) return serviceClientScopeError;
  if (clientId && !state.clients.some(client => client.id === clientId && normalizeClientKey(client.clientName) === normalizeClientKey(clientName))) {
    return 'Choose a company from the Companies database.';
  }
  return undefined;
};
