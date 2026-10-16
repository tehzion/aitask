import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { isWorkflowTaskSatisfied, prepareWorkflowTasks } from './workflowReview';
const work = { id: 'work', clientId: 'client', deliverableId: 'output', serviceCycleId: 'cycle', generatedFromDeliverable: true, workflowStepKind: 'work', status: 'Pending', isCompleted: false, predecessorTaskIds: [] } as unknown as Task;
const skipped = { ...work, id: 'revision', status: 'Cancelled', workflowStepRequired: false, predecessorTaskIds: ['work'] } as Task;
describe('optional frozen workflow steps', () => {
  it('cannot bypass unfinished earlier work when skipped', () => {
    expect(isWorkflowTaskSatisfied(skipped, [work, skipped])).toBe(false);
    const completed = { ...work, status: 'Completed', isCompleted: true } as Task;
    expect(isWorkflowTaskSatisfied(skipped, [completed, skipped])).toBe(true);
  });
  it('fails closed for missing, cross-deliverable or cyclic inputs', () => {
    expect(isWorkflowTaskSatisfied(skipped, [skipped])).toBe(false);
    expect(isWorkflowTaskSatisfied(skipped, [{ ...work, deliverableId: 'foreign', status: 'Completed', isCompleted: true }, skipped])).toBe(false);
    const cycle = { ...work, status: 'Cancelled', workflowStepRequired: false, predecessorTaskIds: ['revision'] } as Task;
    expect(isWorkflowTaskSatisfied(skipped, [cycle, skipped])).toBe(false);
  });
  it('uses canonical readiness for hidden inputs without weakening ordinary tasks', () => {
    expect(isWorkflowTaskSatisfied({ ...skipped, workflowDependenciesReady: true }, [skipped])).toBe(true);
    expect(isWorkflowTaskSatisfied({ ...skipped, generatedFromDeliverable: false }, [skipped])).toBe(true);
  });
});

describe('dependency invalidation progress', () => {
  const staff = { id: 'staff', role: 'Staff' } as User;
  const upstream = {
    id: 'a', clientId: 'c', deliverableId: 'd', serviceCycleId: 'cy', generatedFromDeliverable: true,
    workflowStepId: 's1', workflowStepKind: 'work', workflowStepRequired: true, status: 'Completed', isCompleted: true,
    completionPercentage: 100, workflowOutputVersion: 1, predecessorTaskIds: [], revisionCount: 0,
  } as unknown as Task;
  const downstream = { ...upstream, id: 'b', workflowStepId: 's2', workflowOutputVersion: 2, predecessorTaskIds: ['a'], assignedTo: staff.id } as Task;

  it('re-derives the canonical milestone when a dependent task is reopened', () => {
    const result = prepareWorkflowTasks(
      [{ ...upstream, attachmentLink: 'https://example.com/revised' }, downstream],
      [upstream, downstream],
      staff, [], [], true, [], { users: [staff] },
    );
    const reopened = result.find(task => task.id === 'b')!;
    expect(reopened).toMatchObject({ status: 'Pending', isCompleted: false, completionPercentage: 20 });
    expect(reopened.workState?.acceptedBy).toBeUndefined();
  });

  it('clears stale acceptance when reopening an accepted dependent task', () => {
    const acceptedDownstream = { ...downstream, workState: { acceptedBy: staff.id, acceptedAt: '2026-10-01' } } as Task;
    const result = prepareWorkflowTasks(
      [{ ...upstream, attachmentLink: 'https://example.com/revised-again' }, acceptedDownstream],
      [upstream, acceptedDownstream],
      staff, [], [], true, [], { users: [staff] },
    );
    const reopened = result.find(task => task.id === 'b')!;
    expect(reopened).toMatchObject({ status: 'Pending', completionPercentage: 20 });
    expect(reopened.workState?.acceptedBy).toBeUndefined();
  });
});
