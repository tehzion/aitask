import type { Task } from '../types';
import { parseOptionalDate } from './utils';

export type ClientTaskStage = 'active' | 'awaiting_review' | 'approved' | 'cancelled';

export const getClientTaskStage = (task: Task): ClientTaskStage => {
  if (task.status === 'Cancelled') return 'cancelled';
  if (task.clientApprovalStatus === 'Approved') return 'approved';
  if (task.status === 'Waiting Approval' || task.status === 'Completed' || task.isCompleted) {
    return 'awaiting_review';
  }
  return 'active';
};

export const getClientProgress = (tasks: Task[]) => {
  const active = tasks.filter(task => getClientTaskStage(task) === 'active').length;
  const awaitingReview = tasks.filter(task => getClientTaskStage(task) === 'awaiting_review').length;
  const approved = tasks.filter(task => getClientTaskStage(task) === 'approved').length;
  const cancelled = tasks.filter(task => getClientTaskStage(task) === 'cancelled').length;
  return {
    active,
    awaitingReview,
    approved,
    cancelled,
    total: active + awaitingReview + approved,
  };
};

const dateTime = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export const getClientReviewReadyTasks = (tasks: Task[]) => [...tasks]
  .filter(task => getClientTaskStage(task) === 'awaiting_review')
  .sort((left, right) => {
    const leftDue = parseOptionalDate(left.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
    const rightDue = parseOptionalDate(right.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue || dateTime(right.updatedAt) - dateTime(left.updatedAt);
  });

export const getClientUpcomingDeliveries = (tasks: Task[]) => [...tasks]
  .filter(task => getClientTaskStage(task) === 'active' && Boolean(parseOptionalDate(task.dueDate)))
  .sort((left, right) => (
    (parseOptionalDate(left.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER)
      - (parseOptionalDate(right.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER)
  ));

export const getClientLatestUpdates = (tasks: Task[]) => [...tasks]
  .filter(task => dateTime(task.updatedAt) > 0)
  .sort((left, right) => dateTime(right.updatedAt) - dateTime(left.updatedAt));
