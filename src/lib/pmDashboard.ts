import type { Task } from '../types';
import { isAwaitingClientReview, isAwaitingInternalReview } from './clientPortal';

// Internal submission, PM completion, and customer acceptance are distinct
// stages. Visibility alone does not tell us who is waiting to review.
export const getPortfolioReviewQueues = (tasks: readonly Task[]) => {
  const internal = tasks.filter(isAwaitingInternalReview);
  const completion = tasks.filter(task => task.status === 'Approved' && !task.isCompleted);
  const client = tasks.filter(isAwaitingClientReview);
  const waitingCount = new Set([...internal, ...completion, ...client].map(task => task.id)).size;
  return { internal, completion, client, waitingCount };
};
