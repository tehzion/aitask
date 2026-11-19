import type { Task } from '../types';
import type { ManageWork } from './manageWork';
import { getTaskRisk } from './taskRisk';
import { isTaskOverdue } from './taskReporting';

export interface AttentionDigest {
  overdue: Task[];
  atRisk: Task[];
  /** Waiting for this person's own decision. */
  review: Task[];
  /** Informational: delivered and waiting on the client. */
  withClient: number;
  /** Overdue, at-risk and review items, each task counted once. */
  total: number;
  /** The few most urgent tasks to show by name. */
  top: Task[];
}

/**
 * A short "what needs me today" summary for a PM or HOD, built from the same
 * Manage work buckets so its counts always match the tabs it links to.
 */
export const buildAttentionDigest = (work: ManageWork, now = new Date(), topCount = 3): AttentionDigest => {
  const overdue = work.byTab.active.filter(task => isTaskOverdue(task, now));
  const atRisk = work.byTab.active.filter(task => getTaskRisk(task, now) !== undefined);
  const review = work.byTab.review;
  const seen = new Set<string>();
  const top: Task[] = [];
  for (const task of [...overdue, ...review, ...atRisk]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (top.length < topCount) top.push(task);
  }
  return { overdue, atRisk, review, withClient: work.counts.client, total: seen.size, top };
};

export const digestDayKey = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const digestHiddenKey = (userId: string, now: Date) => `aitask:digest-hidden:${userId}:${digestDayKey(now)}`;
