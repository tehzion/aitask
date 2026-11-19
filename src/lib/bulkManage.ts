import type { CustomRole, Task, User } from '../types';
import { assignableTaskAssignees } from './taskWorkflowAccess';
import type { MessageDescriptor } from './messages';

type BulkError = string | MessageDescriptor;

export interface BulkStep { ok: boolean; error?: BulkError; code?: string }

export interface BulkOutcome {
  saved: number;
  total: number;
  /** First reason a task was not updated, if any. */
  firstError?: BulkError;
  /** Stopped early because the connection, not the task, was the problem. */
  stopped: boolean;
}

/**
 * Applies one change to several tasks, each as its own save, so one refusal
 * never undoes the others (same rule as bulk approve). `apply` changes the task
 * locally, `commit` saves it. A refused task is reloaded and skipped; any other
 * failure (for example no connection) stops the run so nothing is queued blindly.
 */
export const runBulkSave = async (
  ids: readonly string[],
  apply: (id: string) => BulkStep,
  commit: () => Promise<BulkStep>,
  discard: () => Promise<unknown>,
  isRefusal: (code: string) => boolean,
): Promise<BulkOutcome> => {
  let saved = 0;
  let firstError: BulkError | undefined;
  let stopped = false;
  for (const id of ids) {
    const local = apply(id);
    if (!local.ok) { firstError ||= local.error || 'Unable to update the task.'; continue; }
    const committed = await commit();
    if (committed.ok) { saved += 1; continue; }
    firstError ||= committed.error || 'The change is waiting to be saved.';
    if (isRefusal(committed.code || '')) { await discard(); continue; }
    stopped = true;
    break;
  }
  return { saved, total: ids.length, firstError, stopped };
};

/**
 * People who may take every one of the chosen tasks. Offering only these keeps
 * a bulk reassign from half-working: the store still checks each task, but the
 * list never suggests someone who would be refused on some of them.
 */
export const commonAssignees = (
  tasks: readonly Task[],
  actor: User | null | undefined,
  users: readonly User[],
  roles: CustomRole[] = [],
): User[] => {
  if (tasks.length === 0) return [];
  let common: User[] | undefined;
  for (const task of tasks) {
    const options = assignableTaskAssignees(actor, task.department, users, roles, { task });
    const ids = new Set(options.map(user => user.id));
    common = common ? common.filter(user => ids.has(user.id)) : [...options];
    if (common.length === 0) return [];
  }
  return common ?? [];
};
