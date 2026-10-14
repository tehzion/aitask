import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { isWorkflowTaskSatisfied } from './workflowReview';
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
