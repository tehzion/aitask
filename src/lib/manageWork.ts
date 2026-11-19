import type { CustomRole, Task, User } from '../types';
import type { VisibilityScope } from './access';
import { isAwaitingClientReview } from './clientPortal';
import { getPersonalReviewQueues } from './pmDashboard';
import { isTaskCompleted } from './taskCompletion';
import { isTaskOverdue, isTaskOpen } from './taskReporting';
import { parseOptionalDate } from './utils';

/**
 * Fiverr-style "Manage orders" for a PM or HOD: one place with the work split
 * by what it needs next, instead of the same tasks scattered over several
 * queues. A task can sit in more than one tab (a task in revision is also
 * active); the tab is a lens, not a state.
 */
export type ManageTabId = 'active' | 'review' | 'waiting' | 'revision' | 'client' | 'completed' | 'cancelled';

export const MANAGE_TAB_ORDER: ManageTabId[] = ['active', 'review', 'waiting', 'revision', 'client', 'completed', 'cancelled'];

export interface ManageWork {
  byTab: Record<ManageTabId, Task[]>;
  counts: Record<ManageTabId, number>;
}

interface ManageContext {
  user: User | null | undefined;
  users: readonly User[];
  roles?: CustomRole[];
  scope?: VisibilityScope;
  now?: Date;
}

const dueTime = (task: Task) => parseOptionalDate(task.dueDate)?.getTime();

/** Overdue first, then soonest due date, undated last, then title. */
export const compareByUrgency = (now: Date) => (a: Task, b: Task) => {
  const overdueA = isTaskOverdue(a, now) ? 0 : 1;
  const overdueB = isTaskOverdue(b, now) ? 0 : 1;
  if (overdueA !== overdueB) return overdueA - overdueB;
  const dueA = dueTime(a) ?? Number.MAX_SAFE_INTEGER;
  const dueB = dueTime(b) ?? Number.MAX_SAFE_INTEGER;
  return dueA - dueB || a.title.localeCompare(b.title);
};

export const buildManageWork = (tasks: readonly Task[], context: ManageContext): ManageWork => {
  const now = context.now ?? new Date();
  const personal = getPersonalReviewQueues(tasks, { user: context.user, users: context.users, roles: context.roles, scope: context.scope });
  const reviewIds = new Set([...personal.mine, ...personal.completion].map(task => task.id));
  // Submitted work that another reviewer (the HOD, or a review cover) decides first: follow-up only.
  const waitingIds = new Set(personal.department.map(task => task.id));
  const sort = compareByUrgency(now);
  const byTab: Record<ManageTabId, Task[]> = {
    active: tasks.filter(isTaskOpen),
    review: tasks.filter(task => reviewIds.has(task.id)),
    waiting: tasks.filter(task => waitingIds.has(task.id)),
    revision: tasks.filter(task => isTaskOpen(task) && (task.status === 'Revision' || task.revisionCount > 0)),
    client: tasks.filter(isAwaitingClientReview),
    completed: tasks.filter(isTaskCompleted),
    cancelled: tasks.filter(task => task.status === 'Cancelled'),
  };
  for (const id of MANAGE_TAB_ORDER) {
    // Finished work reads newest first; everything else by urgency.
    byTab[id] = id === 'completed' || id === 'cancelled'
      ? [...byTab[id]].sort((a, b) => Date.parse(b.completedAt || b.updatedAt || '') - Date.parse(a.completedAt || a.updatedAt || '') || a.title.localeCompare(b.title))
      : [...byTab[id]].sort(sort);
  }
  const counts = Object.fromEntries(MANAGE_TAB_ORDER.map(id => [id, byTab[id].length])) as Record<ManageTabId, number>;
  return { byTab, counts };
};

/** Start on what needs a decision; otherwise on the active work. */
export const defaultManageTab = (counts: Record<ManageTabId, number>): ManageTabId => (
  counts.review > 0 ? 'review' : 'active'
);

/** Matches the title, company, project or the assignee's name. */
export const filterManageTasks = (tasks: readonly Task[], query: string, users: readonly User[]): Task[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...tasks];
  return tasks.filter(task => {
    const assignee = users.find(user => user.id === task.assignedTo)?.name || '';
    return [task.title, task.clientName, task.projectName || '', assignee].some(value => value.toLowerCase().includes(needle));
  });
};

export interface ManageClientRow {
  clientName: string;
  open: number;
  waitingOnClient: number;
  ratingAverage?: number;
  ratingCount: number;
}

/** One row per company in scope, busiest first; at most `limit` rows. */
export const summarizeManageClients = (tasks: readonly Task[], limit = 6): ManageClientRow[] => {
  const rows = new Map<string, ManageClientRow & { ratingTotal: number }>();
  for (const task of tasks) {
    const name = task.clientName?.trim();
    if (!name) continue;
    const row = rows.get(name.toLowerCase()) || { clientName: name, open: 0, waitingOnClient: 0, ratingCount: 0, ratingTotal: 0 };
    if (isTaskOpen(task)) row.open += 1;
    if (isAwaitingClientReview(task)) row.waitingOnClient += 1;
    if (task.clientRating) { row.ratingCount += 1; row.ratingTotal += task.clientRating.stars; }
    rows.set(name.toLowerCase(), row);
  }
  return [...rows.values()]
    .map(({ ratingTotal, ...row }) => ({ ...row, ratingAverage: row.ratingCount ? Math.round((ratingTotal / row.ratingCount) * 10) / 10 : undefined }))
    .filter(row => row.open > 0 || row.waitingOnClient > 0 || row.ratingCount > 0)
    .sort((a, b) => b.waitingOnClient - a.waitingOnClient || b.open - a.open || a.clientName.localeCompare(b.clientName))
    .slice(0, limit);
};
