import type { Task } from '../types';
import { parseOptionalDate } from './utils';

export type ClientTaskStage = 'active' | 'awaiting_review' | 'approved' | 'cancelled';
export type ClientDeliveryStage = 'needs_review' | 'in_delivery' | 'scheduled' | 'timing_changed' | 'delivered' | 'cancelled';

export const CLIENT_DELIVERY_STAGE_ORDER: ClientDeliveryStage[] = [
  'needs_review',
  'timing_changed',
  'in_delivery',
  'scheduled',
  'delivered',
  'cancelled',
];

export const CLIENT_DELIVERY_STAGE_LABELS: Record<ClientDeliveryStage, string> = {
  needs_review: 'Needs your review',
  in_delivery: 'In delivery',
  scheduled: 'Scheduled',
  timing_changed: 'Timing changed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

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

const localDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const taskDueTime = (task: Task) => parseOptionalDate(task.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;

const compareClientDeliveryTasks = (left: Task, right: Task) => (
  taskDueTime(left) - taskDueTime(right)
  || dateTime(right.updatedAt) - dateTime(left.updatedAt)
  || left.id.localeCompare(right.id)
);

export const getClientDeliveryStage = (task: Task, now = new Date()): ClientDeliveryStage => {
  if (task.status === 'Cancelled') return 'cancelled';
  if (task.clientApprovalStatus === 'Approved') return 'delivered';
  if (task.status === 'Waiting Approval' || task.status === 'Completed' || task.isCompleted) return 'needs_review';
  if (task.dueDate && task.dueDate < localDateKey(now)) return 'timing_changed';
  if (task.status === 'Pending') return 'scheduled';
  return 'in_delivery';
};

export const getClientDeliveryStageLabel = (task: Task, now = new Date()) => (
  CLIENT_DELIVERY_STAGE_LABELS[getClientDeliveryStage(task, now)]
);

export const groupClientDeliveries = (tasks: Task[], now = new Date()) => {
  const groups = CLIENT_DELIVERY_STAGE_ORDER.reduce((result, stage) => ({ ...result, [stage]: [] as Task[] }), {} as Record<ClientDeliveryStage, Task[]>);
  tasks.forEach(task => groups[getClientDeliveryStage(task, now)].push(task));
  CLIENT_DELIVERY_STAGE_ORDER.forEach(stage => groups[stage].sort(compareClientDeliveryTasks));
  return groups;
};

export const getClientFocusTask = (tasks: Task[], now = new Date()) => {
  const groups = groupClientDeliveries(tasks, now);
  return groups.needs_review[0]
    || [...groups.timing_changed, ...groups.in_delivery, ...groups.scheduled].sort(compareClientDeliveryTasks)[0]
    || null;
};

export const getClientReviewReadyTasks = (tasks: Task[]) => [...tasks]
  .filter(task => getClientTaskStage(task) === 'awaiting_review')
  .sort(compareClientDeliveryTasks);

export const getClientUpcomingDeliveries = (tasks: Task[]) => [...tasks]
  .filter(task => getClientTaskStage(task) === 'active' && Boolean(parseOptionalDate(task.dueDate)))
  .sort((left, right) => (
    (parseOptionalDate(left.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER)
      - (parseOptionalDate(right.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER)
  ));

export const getClientLatestUpdates = (tasks: Task[]) => [...tasks]
  .filter(task => dateTime(task.updatedAt) > 0)
  .sort((left, right) => dateTime(right.updatedAt) - dateTime(left.updatedAt));
