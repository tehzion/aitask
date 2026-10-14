import type { Task } from '../types';
import { getClientTaskStage } from './clientPortal';

// Internal submission, PM completion, and customer acceptance are distinct
// stages. Visibility alone does not tell us who is waiting to review.
export const getPortfolioReviewQueues = (tasks: readonly Task[]) => {
  const internal = tasks.filter(task => task.status === 'Waiting Approval');
  const completion = tasks.filter(task => task.status === 'Approved' && !task.isCompleted);
  const client = tasks.filter(task => task.visibility !== 'internal' && getClientTaskStage(task) === 'awaiting_review');
  const waitingCount = new Set([...internal, ...completion, ...client].map(task => task.id)).size;
  return { internal, completion, client, waitingCount };
};
