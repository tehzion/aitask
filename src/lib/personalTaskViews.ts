import type { Task, User } from '../types';

export type TaskViewMode = 'table' | 'board';
export interface PersonalTaskView { id: string; name: string; filters: string }
export interface TaskViewPreferences { version: 1; mode: TaskViewMode; views: PersonalTaskView[] }
export const emptyTaskPreferences = (): TaskViewPreferences => ({ version: 1, mode: 'table', views: [] });
export const taskPreferencesKey = (user: User, backendMode: string) => `aitask:task-views:v1:${JSON.stringify([backendMode, user.workspaceId || 'local', user.authUserId || user.id, user.id])}`;
const filterKeys = new Set(['search', 'projectId', 'project', 'client', 'assignee', 'department', 'creator', 'status', 'priority', 'dueFrom', 'dueTo', 'focus', 'period', 'queue', 'show', 'scope', 'help', 'unaccepted']);

export function captureTaskFilters(params: URLSearchParams): string {
  const clean = new URLSearchParams();
  for (const [key, value] of params) if (filterKeys.has(key) && value && value.length <= 300) clean.set(key, value);
  return clean.toString();
}

export function parseTaskPreferences(raw: string | null): TaskViewPreferences {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || value.version !== 1 || !Array.isArray(value.views)) return emptyTaskPreferences();
    const ids = new Set<string>();
    const views: PersonalTaskView[] = [];
    for (const view of value.views.slice(0, 25)) {
      if (!view || typeof view.id !== 'string' || !view.id || view.id.length > 100 || ids.has(view.id) || typeof view.name !== 'string' || !view.name.trim() || view.name.length > 60 || typeof view.filters !== 'string' || view.filters.length > 6000) continue;
      ids.add(view.id);
      views.push({ id: view.id, name: view.name.trim(), filters: captureTaskFilters(new URLSearchParams(view.filters)) });
    }
    return { version: 1, mode: value.mode === 'board' ? 'board' : 'table', views };
  } catch { return emptyTaskPreferences(); }
}

/** Invalid/obsolete choices are discarded; filtering still happens after access checks. */
export function restoreTaskFilters(filters: string, tasks: Task[], statuses: string[]): { params: URLSearchParams; removed: boolean } {
  const params = new URLSearchParams(captureTaskFilters(new URLSearchParams(filters)));
  const choices: Record<string, Set<string>> = {
    projectId: new Set(tasks.map(task => task.projectId || '')),
    project: new Set(tasks.map(task => task.projectName || '')),
    client: new Set(tasks.map(task => task.clientName)),
    assignee: new Set(tasks.map(task => task.assignedTo)),
    creator: new Set(tasks.map(task => task.createdBy)),
    department: new Set(tasks.map(task => task.department)),
    status: new Set(statuses), priority: new Set(['Urgent', 'High', 'Medium', 'Low']),
    scope: new Set(['mine', 'delegated', 'department']), queue: new Set(['all', 'needs_action', 'up_next', 'waiting', 'done']),
    focus: new Set(['overdue', 'waiting']), period: new Set(['today', 'week', 'overall']), help: new Set(['1']), unaccepted: new Set(['1']),
  };
  let removed = false;
  for (const [key, value] of Array.from(params)) {
    const invalidDate = ['dueFrom', 'dueTo'].includes(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)));
    if (invalidDate || (choices[key] && !choices[key].has(value))) { params.delete(key); removed = true; }
  }
  return { params, removed };
}
