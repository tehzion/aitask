import type { Priority, Task, TaskStatus } from '../types';

export type StaffWorkBucketKey = 'needs_action' | 'up_next' | 'waiting' | 'done';

export interface StaffWorkQueue {
  needs_action: Task[];
  up_next: Task[];
  waiting: Task[];
  done: Task[];
}

export interface StaffGuidedAction {
  kind: 'advance' | 'picker' | 'waiting' | 'terminal';
  label: string;
  targetStatus?: TaskStatus;
  disabled: boolean;
}

const priorityRank: Record<Priority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const isTerminal = (task: Task) => task.isCompleted || task.status === 'Completed' || task.status === 'Cancelled';
const isWaiting = (task: Task) => !isTerminal(task) && task.status === 'Waiting Approval';

const urgencyRank = (task: Task, today: string) => {
  if (task.revisionCount > 0) return 0;
  if (task.dueDate && task.dueDate < today) return 1;
  if (task.dueDate === today) return 2;
  if (task.status === 'In Progress') return 3;
  if (task.dueDate) return 4;
  return 5;
};

export const compareStaffTasks = (today: string) => (left: Task, right: Task) => {
  const urgencyDifference = urgencyRank(left, today) - urgencyRank(right, today);
  if (urgencyDifference !== 0) return urgencyDifference;

  const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
  if (priorityDifference !== 0) return priorityDifference;

  const updateDifference = (right.updatedAt || '').localeCompare(left.updatedAt || '');
  if (updateDifference !== 0) return updateDifference;
  return left.id.localeCompare(right.id);
};

export const buildStaffWorkQueue = (tasks: Task[], today: string): StaffWorkQueue => {
  const queue: StaffWorkQueue = { needs_action: [], up_next: [], waiting: [], done: [] };

  tasks.forEach(task => {
    if (isTerminal(task)) {
      queue.done.push(task);
      return;
    }
    if (isWaiting(task)) {
      queue.waiting.push(task);
      return;
    }
    if (
      task.revisionCount > 0
      || task.status === 'In Progress'
      || Boolean(task.dueDate && task.dueDate <= today)
    ) {
      queue.needs_action.push(task);
      return;
    }
    queue.up_next.push(task);
  });

  const compare = compareStaffTasks(today);
  queue.needs_action.sort(compare);
  queue.up_next.sort(compare);
  queue.waiting.sort(compare);
  queue.done.sort((left, right) => (
    (right.completedAt || right.updatedAt || '').localeCompare(left.completedAt || left.updatedAt || '')
    || left.id.localeCompare(right.id)
  ));
  return queue;
};

export const getStaffFocusTask = (queue: StaffWorkQueue) => queue.needs_action[0] || queue.up_next[0];

export const getStaffGuidedAction = (task: Task, taskStatuses: TaskStatus[]): StaffGuidedAction => {
  if (task.isCompleted || task.status === 'Completed') {
    return { kind: 'terminal', label: 'Completed', disabled: true };
  }
  if (task.status === 'Cancelled') {
    return { kind: 'terminal', label: 'Cancelled', disabled: true };
  }
  if (task.status === 'Waiting Approval') {
    return { kind: 'waiting', label: 'Waiting for review', disabled: true };
  }
  if (task.status === 'Pending' && taskStatuses.includes('In Progress')) {
    return {
      kind: 'advance',
      label: task.revisionCount > 0 ? 'Start revision' : 'Start work',
      targetStatus: 'In Progress',
      disabled: false,
    };
  }
  if (task.status === 'In Progress' && taskStatuses.includes('Waiting Approval')) {
    return {
      kind: 'advance',
      label: 'Send for review',
      targetStatus: 'Waiting Approval',
      disabled: false,
    };
  }
  return { kind: 'picker', label: 'Update status', disabled: false };
};

export const getStaffBucketLabel = (bucket: StaffWorkBucketKey) => ({
  needs_action: 'Needs action',
  up_next: 'Up next',
  waiting: 'Waiting',
  done: 'Done',
})[bucket];
