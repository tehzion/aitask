import { describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { getInternalReviewLane, isAwaitingMyInternalReview, isReadyForMyCompletion } from './taskWorkflowAccess';
import { getPersonalReviewQueues, getPortfolioReviewQueues } from './pmDashboard';
import { getManagementAttentionItems } from './managementIntelligence';

const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: [] };
const otherPm: User = { ...pm, id: 'other-pm', name: 'Other PM' };
const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const staff: User = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'] };
const boss: User = { id: 'boss', name: 'Boss', role: 'Project Manager', departments: [], isSuperAdmin: true };
const clients = [{ id: 'co', clientName: 'Company', createdBy: pm.id, createdAt: '', updatedAt: '' }];
const base = {
  id: 'task', title: 'Task', department: 'Designer', createdBy: 'staff', assignedTo: 'staff', clientId: 'co', clientName: 'Company',
  status: 'Waiting Approval', isCompleted: false, revisionCount: 0, priority: 'Medium',
} as Task;
const withHod = { users: [pm, otherPm, hod, staff], clients };
const withoutHod = { users: [pm, otherPm, staff], clients };

describe('internal review lane', () => {
  it('routes department submissions to the HOD lane when an independent HOD exists', () => {
    expect(getInternalReviewLane(base, withHod.users, [], withHod)).toBe('department');
  });

  it('falls back to the PM lane when the department has no HOD', () => {
    expect(getInternalReviewLane(base, withoutHod.users, [], withoutHod)).toBe('projectManager');
  });

  it('uses the PM lane for PM-approval tasks and no lane when approval is disabled', () => {
    expect(getInternalReviewLane({ ...base, approvalMode: 'pm' }, withHod.users, [], withHod)).toBe('projectManager');
    expect(getInternalReviewLane({ ...base, approvalMode: 'none', requiresInternalApproval: false }, withHod.users, [], withHod)).toBe('none');
  });

  it('does not treat an HOD who submitted the work as an independent reviewer', () => {
    const ownWork = { ...base, assignedTo: hod.id };
    expect(getInternalReviewLane(ownWork, withHod.users, [], withHod)).toBe('projectManager');
  });
});

describe('awaiting my review', () => {
  it('keeps HOD-lane work out of the PM queue even though the PM may still approve it', () => {
    expect(isAwaitingMyInternalReview(pm, base, withHod.users, [], withHod)).toBe(false);
    expect(isAwaitingMyInternalReview(hod, base, withHod.users, [], withHod)).toBe(true);
  });

  it('shows PM-lane work only to the responsible PM', () => {
    expect(isAwaitingMyInternalReview(pm, base, withoutHod.users, [], withoutHod)).toBe(true);
    expect(isAwaitingMyInternalReview(otherPm, base, withoutHod.users, [], withoutHod)).toBe(false);
  });

  it('never asks Staff or anyone to review work that is not waiting or needs no approval', () => {
    expect(isAwaitingMyInternalReview(staff, base, withHod.users, [], withHod)).toBe(false);
    expect(isAwaitingMyInternalReview(pm, { ...base, status: 'In Progress' }, withoutHod.users, [], withoutHod)).toBe(false);
    expect(isAwaitingMyInternalReview(pm, { ...base, approvalMode: 'none', requiresInternalApproval: false }, withoutHod.users, [], withoutHod)).toBe(false);
  });

  it('honours the server-bound review decision for the current actor', () => {
    const denied = { ...base, reviewAccess: { actorId: pm.id, canApprove: false } };
    expect(isAwaitingMyInternalReview(pm, denied, withoutHod.users, [], withoutHod)).toBe(false);
  });

  it('gives an active review cover to the covering reviewer only', () => {
    const covered = { ...base, approvalMode: 'pm' as const, reviewCover: { reviewerId: otherPm.id, expiresAt: '2999-01-01T00:00:00Z' } } as Task;
    expect(isAwaitingMyInternalReview(pm, covered, withoutHod.users, [], withoutHod)).toBe(false);
  });
});

describe('ready for my completion', () => {
  it('offers approved work and no-approval submissions to the responsible PM only', () => {
    const approved = { ...base, status: 'Approved' };
    const optional = { ...base, approvalMode: 'none', requiresInternalApproval: false } as Task;
    expect(isReadyForMyCompletion(pm, approved, [], withHod)).toBe(true);
    expect(isReadyForMyCompletion(pm, optional, [], withHod)).toBe(true);
    expect(isReadyForMyCompletion(otherPm, approved, [], withHod)).toBe(false);
    expect(isReadyForMyCompletion(hod, approved, [], withHod)).toBe(false);
    expect(isReadyForMyCompletion(staff, approved, [], withHod)).toBe(false);
  });

  it('excludes waiting work that still requires approval and finished work', () => {
    expect(isReadyForMyCompletion(pm, base, [], withHod)).toBe(false);
    expect(isReadyForMyCompletion(pm, { ...base, status: 'Completed', isCompleted: true }, [], withHod)).toBe(false);
  });

  it('keeps Super Admin authority over completion', () => {
    expect(isReadyForMyCompletion(boss, { ...base, status: 'Approved' }, [], withHod)).toBe(true);
  });
});

describe('personal review queues', () => {
  const tasks = [
    { ...base, id: 'hod-lane' },
    { ...base, id: 'pm-lane', approvalMode: 'pm' },
    { ...base, id: 'approved', status: 'Approved' },
    { ...base, id: 'optional', approvalMode: 'none', requiresInternalApproval: false },
    { ...base, id: 'done', status: 'Completed', isCompleted: true },
  ] as Task[];

  it('separates my decisions from department follow-up without double counting', () => {
    const queues = getPersonalReviewQueues(tasks, { user: pm, users: withHod.users, scope: withHod });
    expect(queues.mine.map(task => task.id)).toEqual(['pm-lane']);
    expect(queues.completion.map(task => task.id)).toEqual(['approved', 'optional']);
    expect(queues.department.map(task => task.id)).toEqual(['hod-lane']);
    expect(queues.actionableCount).toBe(3);
  });

  it('keeps the organisation-wide queue unchanged for reports and management metrics', () => {
    expect(getPortfolioReviewQueues(tasks).internal.map(task => task.id)).toEqual(['hod-lane', 'pm-lane', 'optional']);
  });
});

describe('attention items', () => {
  const project = { id: 'p', clientId: 'co', clientName: 'Company', projectName: 'Launch', services: [], startDate: '2026-10-01', deadline: '2026-10-30' } as Project;
  const late = { ...base, id: 'late', projectId: 'p', status: 'In Progress', dueDate: '2026-10-01' } as Task;
  const input = { persona: 'projectManager' as const, projects: [project], tasks: [late, { ...base, id: 'waiting' }], deliverables: [], clientPlans: [], serviceCycles: [], now: new Date('2026-10-21T12:00:00Z') };

  it('uses the supplied personal review queue instead of every submission in scope', () => {
    const items = getManagementAttentionItems({ ...input, reviewQueue: [] });
    expect(items.some(item => item.kind === 'review')).toBe(false);
    expect(getManagementAttentionItems(input).some(item => item.id === 'review:waiting')).toBe(true);
  });

  it('can leave project risk to a neighbouring panel', () => {
    expect(getManagementAttentionItems(input).some(item => item.kind === 'projectRisk')).toBe(true);
    expect(getManagementAttentionItems({ ...input, excludeProjectRisks: true }).some(item => item.kind === 'projectRisk')).toBe(false);
  });

  it('exposes structured fields so record names stay verbatim and copy can be localized', () => {
    const risk = getManagementAttentionItems(input).find(item => item.kind === 'projectRisk');
    expect(risk).toMatchObject({ subject: 'Launch', context: 'Company', overdueCount: 1 });
  });
});
