import type { Task, User } from '../types';

export type TimelineKind =
  | 'assigned'
  | 'internal_review'
  | 'client_approved'
  | 'client_changes'
  | 'rated'
  | 'completed';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** ISO timestamp. */
  at: string;
  actorId?: string;
  /** Display name, or undefined when the audience should see "the agency team". */
  actorName?: string;
  /** Who the work was assigned to, for "assigned" entries. */
  targetName?: string;
  note?: string;
  stars?: number;
  /** 1-based revision round for "changes requested" entries. */
  revision?: number;
}

export type TimelineAudience = 'team' | 'client';

const validTime = (value?: string) => Boolean(value) && Number.isFinite(new Date(value as string).getTime());

/**
 * Fiverr-style order activity: one newest-first list of what happened to a
 * delivery. The team sees assignment and internal review too; a client only
 * sees their own decisions, their rating and completion, and never a staff name.
 */
export const buildTaskTimeline = (
  task: Pick<Task, 'id' | 'assignedAt' | 'assignedBy' | 'assignedTo' | 'internalReview' | 'approvalHistory' | 'clientRating' | 'completedAt' | 'isCompleted'>,
  users: readonly Pick<User, 'id' | 'name' | 'role'>[],
  audience: TimelineAudience,
): TimelineEntry[] => {
  const nameOf = (id?: string) => users.find(user => user.id === id)?.name;
  // A client must never learn which staff member did something.
  const visibleName = (id?: string) => {
    const user = users.find(item => item.id === id);
    if (!user) return undefined;
    return audience === 'client' && user.role !== 'Client' ? undefined : user.name;
  };

  const entries: TimelineEntry[] = [];
  if (audience === 'team') {
    if (validTime(task.assignedAt) && task.assignedTo) {
      entries.push({ id: `${task.id}:assigned`, kind: 'assigned', at: task.assignedAt!, actorId: task.assignedBy, actorName: nameOf(task.assignedBy), targetName: nameOf(task.assignedTo) });
    }
    if (task.internalReview && validTime(task.internalReview.reviewedAt)) {
      entries.push({ id: `${task.id}:internal`, kind: 'internal_review', at: task.internalReview.reviewedAt, actorId: task.internalReview.reviewedBy, actorName: nameOf(task.internalReview.reviewedBy) });
    }
  }

  let revision = 0;
  const decisions = [...(task.approvalHistory || [])]
    .filter(event => validTime(event.createdAt) && (event.status === 'Approved' || event.status === 'Rejected'))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const event of decisions) {
    if (event.status === 'Rejected') revision += 1;
    entries.push({
      id: event.id,
      kind: event.status === 'Approved' ? 'client_approved' : 'client_changes',
      at: event.createdAt,
      actorId: event.userId,
      actorName: visibleName(event.userId),
      note: event.note?.trim() || undefined,
      revision: event.status === 'Rejected' ? revision : undefined,
    });
  }

  const rating = task.clientRating;
  if (rating && validTime(rating.ratedAt)) {
    entries.push({ id: `${task.id}:rated`, kind: 'rated', at: rating.ratedAt, actorId: rating.ratedBy, actorName: visibleName(rating.ratedBy), stars: rating.stars, note: rating.comment?.trim() || undefined });
  }
  if (task.isCompleted && validTime(task.completedAt)) {
    entries.push({ id: `${task.id}:completed`, kind: 'completed', at: task.completedAt!, actorId: undefined });
  }

  // Newest first; ties keep a stable, logical order (completion after the decision that led to it).
  const rank: Record<TimelineKind, number> = { assigned: 0, internal_review: 1, client_changes: 2, client_approved: 2, rated: 3, completed: 4 };
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || rank[b.kind] - rank[a.kind]);
};
