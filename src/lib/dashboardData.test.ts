import { describe, expect, it } from 'vitest';
import type { ServiceCycle, Deliverable, Task } from '../types';
import { getContractDaysRemaining, getCurrentPlanCycle, getPlanDeliverySummary, getCompanyTaskActivity, getDeliveryReviewRecords, hasInvalidDeliveryLink, isAwaitingPublication } from './dashboardData';

const now = new Date(2026, 9, 7, 14);
const plan = { id: 'active-plan', clientId: 'client-1' };
const cycle = (overrides: Partial<ServiceCycle> = {}): ServiceCycle => ({
  id: 'october', clientId: plan.clientId, clientName: 'Audit Company', planId: plan.id,
  planRevision: 1, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published',
  currency: 'MYR', serviceItems: [], addonSnapshots: [], discountType: 'none',
  discountValue: 0, taxRateBps: 0, createdAt: '2026-10-01', updatedAt: '2026-10-01',
  ...overrides,
});

describe('dashboard calendar-day renewals', () => {
  it('keeps the 30-day limit independent of the time of day', () => {
    expect(getContractDaysRemaining('2026-11-06', now)).toBe(30);
    expect(getContractDaysRemaining('2026-11-07', now)).toBe(31);
    expect(getContractDaysRemaining('2026-11-06', new Date(2026, 9, 7, 23, 59))).toBe(30);
  });

  it('distinguishes today, expired contracts and invalid or absent dates', () => {
    expect(getContractDaysRemaining('2026-10-07', now)).toBe(0);
    expect(getContractDaysRemaining('2026-10-06', now)).toBe(-1);
    expect(getContractDaysRemaining(undefined, now)).toBeNull();
    expect(getContractDaysRemaining('invalid', now)).toBeNull();
  });
});

describe('current active-plan delivery cycle', () => {
  it('selects the current published cycle instead of a later future cycle', () => {
    const current = cycle();
    expect(getCurrentPlanCycle(plan, [
      cycle({ id: 'future', periodStart: '2026-11-01', periodEnd: '2026-11-30' }),
      current,
    ], now)).toBe(current);
  });

  it('returns no current cycle when only historical cycles exist', () => {
    expect(getCurrentPlanCycle(plan, [cycle({ periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'Completed' })], now)).toBeUndefined();
  });

  it('does not mix another plan, another client, drafts or cancelled cycles into progress', () => {
    expect(getCurrentPlanCycle(plan, [
      cycle({ planId: 'old-plan' }), cycle({ clientId: 'other-client' }),
      cycle({ status: 'Draft' }), cycle({ status: 'Cancelled' }),
    ], now)).toBeUndefined();
  });

  it('includes both boundary days and supports billing cycles spanning months', () => {
    const billing = cycle({ periodStart: '2026-09-15', periodEnd: '2026-10-14', status: 'Completed' });
    expect(getCurrentPlanCycle(plan, [billing], new Date(2026, 8, 15))).toBe(billing);
    expect(getCurrentPlanCycle(plan, [billing], new Date(2026, 9, 14, 23, 59))).toBe(billing);
    expect(getCurrentPlanCycle(plan, [billing], new Date(2026, 9, 15))).toBeUndefined();
  });

  it('ignores malformed or inverted periods', () => {
    expect(getCurrentPlanCycle(plan, [
      cycle({ periodStart: 'invalid' }), cycle({ periodEnd: '' }),
      cycle({ periodStart: '2026-10-31', periodEnd: '2026-10-01' }),
    ], now)).toBeUndefined();
  });

  it('allows a current draft for internal planning only when explicitly requested', () => {
    const draft = cycle({ status: 'Draft' });
    expect(getCurrentPlanCycle(plan, [draft], now)).toBeUndefined();
    expect(getCurrentPlanCycle(plan, [draft], now, { includeDraft: true })).toBe(draft);
  });
});

describe('monthly delivery summary', () => {
  it('distinguishes an unpublished current cycle from zero delivered output', () => {
    const result = getPlanDeliverySummary(plan, [cycle({ status: 'Draft' })], [], [], now);
    expect(result.currentCycle).toBeUndefined();
    expect(result.draftCycle?.id).toBe('october');
    expect(result.total).toBe(0);
  });

  it('does not reuse an expired published cycle when the new cycle is draft', () => {
    const result = getPlanDeliverySummary(plan, [
      cycle({ id: 'old', periodStart: '2026-09-09', periodEnd: '2026-10-08' }),
      cycle({ id: 'new', status: 'Draft', periodStart: '2026-10-09', periodEnd: '2026-11-08' }),
    ], [], [], new Date(2026, 9, 12));
    expect(result.currentCycle).toBeUndefined();
    expect(result.draftCycle?.id).toBe('new');
  });

  it('keeps completed unlinked company tasks separate from confirmed deliveries', () => {
    const deliverable = { id: 'd', clientId: plan.clientId, cycleId: 'october', status: 'Planned', taskIds: [] } as Deliverable;
    const tasks = [
      { id: 'done', clientId: plan.clientId, status: 'Completed' },
      { id: 'other', clientId: 'other-client', status: 'Completed' },
      { id: 'pending', clientId: plan.clientId, status: 'Pending' },
    ] as Task[];
    const result = getPlanDeliverySummary(plan, [cycle()], [deliverable], tasks, now);
    expect(result).toMatchObject({ total: 1, delivered: 0, planned: 1, completedUnlinked: 1 });
  });

  it('does not count Ready as Delivered or count reverse-linked tasks as unlinked', () => {
    const deliverables = [
      { id: 'ready', clientId: plan.clientId, cycleId: 'october', status: 'Ready', taskIds: ['done'] },
      { id: 'delivered', clientId: plan.clientId, cycleId: 'october', status: 'Delivered', taskIds: [] },
    ] as Deliverable[];
    const tasks = [{ id: 'done', clientId: plan.clientId, status: 'Completed' }] as Task[];
    expect(getPlanDeliverySummary(plan, [cycle()], deliverables, tasks, now))
      .toMatchObject({ total: 2, delivered: 1, ready: 1, completedUnlinked: 0 });
  });
});


describe('company task activity', () => {
  const task = (overrides: Partial<Task> = {}): Task => ({
    id: 'task', clientId: plan.clientId, assignedTo: 'staff', status: 'Pending', isCompleted: false,
    ...overrides,
  } as Task);

  it('uses local calendar-month boundaries and separates unknown completion dates', () => {
    const first = new Date(2026, 9, 1).toISOString();
    const last = new Date(2026, 9, 31, 23, 59).toISOString();
    const before = new Date(2026, 8, 30, 23, 59).toISOString();
    const after = new Date(2026, 10, 1).toISOString();
    const tasks = [first, last, before, after, undefined, 'invalid'].map((completedAt, i) => task({ id: String(i), status: 'Completed', completedAt }));
    expect(getCompanyTaskActivity(plan.clientId, tasks, [], now)).toMatchObject({
      completedThisMonth: 2, completionDateUnavailable: 2, handlers: [], unassignedOpen: 0,
    });
    expect(getCompanyTaskActivity(plan.clientId, tasks, [], new Date(2026, 10, 1)).completedThisMonth).toBe(1);
  });

  it('groups open assignments, excludes finished/cancelled work, and counts unassigned work', () => {
    const tasks = [task(), task({ id: 'second' }), task({ id: 'missing', assignedTo: 'missing' }),
      task({ id: 'unassigned', assignedTo: '' }), task({ status: 'Cancelled' }),
      task({ status: 'Completed' }), task({ isCompleted: true })];
    expect(getCompanyTaskActivity(plan.clientId, tasks, [{ id: 'staff', name: 'Alice' }], now))
      .toMatchObject({ unassignedOpen: 1, handlers: [
        { id: 'staff', name: 'Alice', open: 2 }, { id: 'missing', name: null, open: 1 },
      ] });
  });

  it('includes unlinked company tasks but never another company or excluded tasks', () => {
    const visible = [task({ status: 'Completed', completedAt: now.toISOString() }),
      task({ id: 'other', clientId: 'other-company', assignedTo: 'hidden-member' })];
    const result = getCompanyTaskActivity(plan.clientId, visible, [], now);
    expect(result).toMatchObject({ completedThisMonth: 1, handlers: [] });
    expect(getPlanDeliverySummary(plan, [cycle()], [], visible, now).delivered).toBe(0);
  });

  it('retains more than three handlers for expansion and does not depend on input order', () => {
    const tasks = ['d', 'a', 'c', 'b'].map(id => task({ id, assignedTo: id }));
    const members = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
    expect(getCompanyTaskActivity(plan.clientId, tasks, members, now).handlers.map(item => item.name))
      .toEqual(['A', 'B', 'C', 'D']);
  });
});


describe('delivery records needing review', () => {
  it('flags dangling, cross-company, cycle-mismatched and conflicting links without treating them as unlinked', () => {
    const output = { id: 'd', clientId: plan.clientId, cycleId: 'october', taskIds: [] } as Deliverable;
    const task = { id: 't', clientId: plan.clientId, deliverableId: 'd', serviceCycleId: 'october', status: 'Completed' } as Task;
    expect(hasInvalidDeliveryLink(task, [output])).toBe(false);
    expect(hasInvalidDeliveryLink(task, [{ ...output, taskIds: undefined } as unknown as Deliverable])).toBe(false);
    expect(getDeliveryReviewRecords([{ ...task, deliverableId: undefined }], [], [{ ...output, taskIds: undefined } as unknown as Deliverable], now).unlinkedTasks).toHaveLength(1);
    for (const outputs of [[], [{ ...output, clientId: 'other' }], [{ ...output, cycleId: 'other' }], [output, { ...output, id: 'other', taskIds: [task.id] }]]) {
      const result = getDeliveryReviewRecords([task], [], outputs, now);
      expect(result.invalidLinkedTasks).toEqual([task]);
      expect(result.unlinkedTasks).toEqual([]);
    }
  });
  it('keeps expired drafts in a separate backlog without adding them to current progress', () => {
    const old = cycle({ id: 'old', status: 'Draft', periodStart: '2026-09-01', periodEnd: '2026-09-30' });
    const result = getDeliveryReviewRecords([], [old, cycle({ status: 'Draft' })], [], now);
    expect(result.expiredDraftCycles).toEqual([old]);
    expect(result.draftCycles.map(item => item.id)).toEqual(['october']);
    expect(getCurrentPlanCycle(plan, [old], now)).toBeUndefined();
  });
  it('does not infer awaiting publication from an active plan alone', () => {
    expect(isAwaitingPublication(undefined, plan, [], now)).toBe(false);
    expect(isAwaitingPublication(undefined, plan, [cycle({ status: 'Draft' })], now)).toBe(true);
    expect(isAwaitingPublication(undefined, plan, [cycle({ status: 'Draft', periodEnd: '2026-09-30' })], now)).toBe(false);
    expect(isAwaitingPublication({ awaitingPublication: true } as never, plan, [], now)).toBe(true);
  });
  it('recognizes forward and reverse task links and only reviews visible completed tasks', () => {
    const tasks = [
      { id: 'unlinked', clientId: plan.clientId, status: 'Completed' },
      { id: 'forward', clientId: plan.clientId, status: 'Completed', deliverableId: 'd' },
      { id: 'reverse', clientId: plan.clientId, isCompleted: true },
      { id: 'open', clientId: plan.clientId, status: 'Pending' },
    ] as Task[];
    const deliverables = [{ id: 'd', taskIds: ['reverse'] }] as Deliverable[];
    expect(getDeliveryReviewRecords(tasks, [], deliverables, now).unlinkedTasks.map(t => t.id)).toEqual(['unlinked']);
  });
  it('reviews only drafts covering today, excluding expired, future, cancelled and malformed cycles', () => {
    const cycles = [cycle({ id: 'current', status: 'Draft' }),
      cycle({ status: 'Draft', periodEnd: '2026-09-30' }),
      cycle({ status: 'Draft', periodStart: '2026-11-01' }),
      cycle({ status: 'Cancelled' }), cycle({ status: 'Draft', periodStart: 'bad' })];
    expect(getDeliveryReviewRecords([], cycles, [], now).draftCycles.map(c => c.id)).toEqual(['current']);
  });
});
