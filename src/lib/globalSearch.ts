import type { ClientProfile, ClientServicePlan, CustomRole, Project, Task, User } from '../types';
import { canAccessPath, canManageClientPlans, canOpenServiceClient, canViewServicePrices, getVisibleClientNames, getVisibleProjects, getVisibleTasks } from './access';

export interface SearchSnapshot {
  currentUser: User | null;
  tasks: Task[];
  projects: Project[];
  clients: ClientProfile[];
  clientPlans: ClientServicePlan[];
  rolePermissions: CustomRole[];
}
export interface RecordSearchResult { id: string; type: 'Tasks' | 'Projects' | 'Companies' | 'Clients' | 'Service plans'; label: string; path: string }

/** Search only the current workspace snapshot, after applying record and route access. */
export function searchWorkspace(snapshot: SearchSnapshot, query: string): RecordSearchResult[] {
  const { currentUser: user, clients, rolePermissions: roles } = snapshot;
  const needle = query.trim().toLocaleLowerCase();
  if (!user || !needle) return [];
  const inWorkspace = (row: { workspaceId?: string }) => !user.workspaceId || !row.workspaceId || row.workspaceId === user.workspaceId;
  const tasks = snapshot.tasks.filter(inWorkspace);
  const projects = snapshot.projects.filter(inWorkspace);
  const scope = { clients, projects };
  const results: RecordSearchResult[] = [];
  const matches = (label: string) => label.toLocaleLowerCase().includes(needle);
  const add = (type: RecordSearchResult['type'], rows: RecordSearchResult[]) => results.push(...rows.filter(row => matches(row.label)).slice(0, 5).map(row => ({ ...row, type })));
  if (canAccessPath(user, '/tasks', roles)) {
    add('Tasks', getVisibleTasks(user, tasks, roles, scope).map(task => ({ id: task.id, type: 'Tasks', label: task.title, path: `/tasks?taskId=${encodeURIComponent(task.id)}` })));
    add('Projects', getVisibleProjects(user, projects, tasks, roles, scope).map(project => ({ id: project.id, type: 'Projects', label: project.projectName, path: `/tasks?projectId=${encodeURIComponent(project.id)}&project=${encodeURIComponent(project.projectName)}` })));
  }
  if (canAccessPath(user, '/projects', roles)) {
    add('Companies', getVisibleClientNames(user, tasks, projects, roles, scope).map(name => ({ id: name, type: 'Companies', label: name, path: `/projects?search=${encodeURIComponent(name)}` })));
  }
  const visibleClients = clients.filter(client => canOpenServiceClient(user, client.clientName, tasks, roles, clients, projects));
  if (canAccessPath(user, '/clients', roles)) {
    add('Clients', visibleClients.map(client => ({ id: client.id, type: 'Clients', label: client.clientName, path: `/clients/${encodeURIComponent(client.id)}` })));
    // Commercial plan names are not indexed for client portal or production-only roles.
    if (user.role !== 'Client' && (canManageClientPlans(user, roles) || canViewServicePrices(user, roles))) {
      const allowedIds = new Set(visibleClients.map(client => client.id));
      add('Service plans', snapshot.clientPlans.filter(plan => allowedIds.has(plan.clientId)).map(plan => ({ id: plan.id, type: 'Service plans', label: plan.name, path: `/clients/${encodeURIComponent(plan.clientId)}` })));
    }
  }
  return results;
}
