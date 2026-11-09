import type { Deliverable, ServiceCycle, Task } from '../types';

export const isTaskLinkedToDeliverable = (task: Pick<Task, 'id' | 'deliverableId'>, deliverables: readonly Deliverable[]) =>
  Boolean(task.deliverableId || deliverables.some(item => item.taskIds?.includes(task.id)));

export const hasInvalidDeliveryLink = (task: Pick<Task, 'id' | 'clientId' | 'deliverableId' | 'serviceCycleId'>, deliverables: readonly Deliverable[]) => {
  const links = deliverables.filter(item => item.id === task.deliverableId || item.taskIds?.includes(task.id));
  return Boolean((task.deliverableId && !links.some(item => item.id === task.deliverableId))
    || links.length > 1 || links.some(item => item.clientId !== task.clientId
      || (task.serviceCycleId && item.cycleId !== task.serviceCycleId)));
};

/**
 * The shared client/cycle/delivered/single-link rules for attaching a task to a
 * deliverable, used by task creation, task editing, and the explicit linker so
 * every path enforces the same boundary. Returns an error string, or undefined
 * when the link is valid. Callers layer their own reopen/unlink rules on top.
 */
export const deliverableLinkError = (
  task: Pick<Task, 'id' | 'clientId' | 'deliverableId' | 'serviceCycleId'>,
  deliverable: Deliverable | undefined,
  deliverables: readonly Deliverable[],
): string | undefined => {
  if (!deliverable) return 'Choose a deliverable from this client and cycle.';
  if (deliverable.clientId !== task.clientId || deliverable.cycleId !== task.serviceCycleId) {
    return 'The task and deliverable must belong to the same client and cycle.';
  }
  if (deliverable.status === 'Delivered' && !deliverable.taskIds?.includes(task.id)) {
    return 'Reopen the delivery before adding task links.';
  }
  if (deliverables.some(item => item.id !== deliverable.id && item.taskIds?.includes(task.id))) {
    return 'This task is already linked to another deliverable.';
  }
  return undefined;
};

/**
 * The client's Published month that covers `today` (an input date,
 * YYYY-MM-DD). New project tasks count toward this month by default.
 */
export const getCurrentPublishedCycle = (
  cycles: readonly ServiceCycle[],
  clientId: string | undefined,
  today: string,
): ServiceCycle | undefined => (clientId
  ? cycles.find(cycle => cycle.clientId === clientId && cycle.status === 'Published'
    && cycle.periodStart <= today && today <= cycle.periodEnd)
  : undefined);

/** Deliverables in a month that can still take a manual task link. */
export const getLinkableDeliverables = (deliverables: readonly Deliverable[], cycleId: string | undefined) => (cycleId
  ? deliverables
    .filter(item => item.cycleId === cycleId && item.status !== 'Delivered' && !item.workflowGeneratedAt)
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true }))
  : []);

const meaningfulWords = (value: string) => value
  .toLowerCase()
  .replace(/[0-9]+/g, ' ')
  .split(/[^a-z\u4e00-\u9fff]+/)
  .filter(word => word.length > 2);

/**
 * Suggest the deliverable a new task most likely counts toward: the first
 * one with no tasks yet whose name shares a word with the task title.
 * Returns undefined when nothing matches, so the task stays unlinked.
 */
export const suggestDeliverableForTask = (title: string, deliverables: readonly Deliverable[]) => {
  const words = new Set(meaningfulWords(title));
  if (!words.size) return undefined;
  return deliverables.find(item => (item.taskIds || []).length === 0
    && meaningfulWords(item.title).some(word => words.has(word)));
};

/** Unlinked open tasks of a client that a PM can attach to a deliverable. */
export const getUnlinkedOpenTasks = (tasks: readonly Task[], deliverables: readonly Deliverable[], clientId: string) => tasks
  .filter(task => task.clientId === clientId && !task.isCompleted && task.status !== 'Cancelled'
    && !task.generatedFromDeliverable && !isTaskLinkedToDeliverable(task, deliverables))
  .sort((left, right) => (left.dueDate || '9999').localeCompare(right.dueDate || '9999'));

/** The deliverable a task counts toward, from either side of the link. */
export const getTaskDeliverable = (task: Pick<Task, 'id' | 'deliverableId'>, deliverables: readonly Deliverable[]) => (
  (task.deliverableId ? deliverables.find(item => item.id === task.deliverableId) : undefined)
  || deliverables.find(item => item.taskIds?.includes(task.id))
);

const LINK_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'month', 'task', 'post', 'posts']);
const linkTokens = (value: string | undefined) => new Set((value || '').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter(token => token.length >= 3 && !LINK_STOP_WORDS.has(token) && !/^\d+$/.test(token)));

const dayDistance = (date: string, start: string, end: string) => {
  if (date >= start && date <= end) return 0;
  const edge = date < start ? start : end;
  return Math.abs((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${edge}T00:00:00Z`)) / 86_400_000);
};

/**
 * How likely an unlinked task belongs to a deliverable (click reduction, item 3):
 * due inside the month scores most, then shared words between the task's title or
 * service type and the deliverable's title or service. Higher is better; 0 means
 * no evidence.
 */
export const scoreLinkCandidate = (
  task: Pick<Task, 'title' | 'serviceType' | 'dueDate'>,
  deliverable: Pick<Deliverable, 'title'>,
  cycle: Pick<ServiceCycle, 'periodStart' | 'periodEnd'>,
  serviceName?: string,
) => {
  let score = 0;
  if (task.dueDate && cycle.periodStart && cycle.periodEnd) {
    const distance = dayDistance(task.dueDate, cycle.periodStart, cycle.periodEnd);
    if (distance === 0) score += 3;
    else if (distance <= 7) score += 1;
  }
  const target = new Set([...linkTokens(deliverable.title), ...linkTokens(serviceName)]);
  const source = new Set([...linkTokens(task.title), ...linkTokens(task.serviceType)]);
  for (const token of source) if (target.has(token)) score += 2;
  return score;
};

/**
 * Candidates ordered best first, plus a single suggestion when one task clearly
 * leads: due in the month or a word match, and ahead of the runner-up.
 */
export const rankLinkCandidates = <T extends Pick<Task, 'id' | 'title' | 'serviceType' | 'dueDate'>>(
  candidates: readonly T[],
  deliverable: Pick<Deliverable, 'title'>,
  cycle: Pick<ServiceCycle, 'periodStart' | 'periodEnd'>,
  serviceName?: string,
) => {
  const scored = candidates.map((task, index) => ({ task, index, score: scoreLinkCandidate(task, deliverable, cycle, serviceName) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const [best, next] = scored;
  const suggestion = best && best.score >= 3 && (!next || best.score > next.score) ? best.task : undefined;
  return { ordered: scored.map(item => item.task), suggestion };
};
