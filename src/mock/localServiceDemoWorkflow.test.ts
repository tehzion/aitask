import { describe, expect, it } from 'vitest';
import { createLocalServiceDemoFixture } from './localServiceDemo';
import { prepareWorkflowTasks } from '../lib/workflowReview';

describe('local service demo workflow', () => {
  const fixture = createLocalServiceDemoFixture('2026-08-16', '2026-08-16T08:00:00.000Z');
  const pm = fixture.users.find(user => user.role === 'Project Manager')!;

  it('keeps finished steps finished when an unrelated task changes', () => {
    const before = fixture.tasks;
    const after = prepareWorkflowTasks(before.map(task => ({ ...task })), before, pm, fixture.serviceCycles, fixture.deliverables, true);
    const reopened = after.filter(task => {
      const original = before.find(item => item.id === task.id)!;
      return original.status !== task.status;
    }).map(task => task.title);
    expect(reopened).toEqual([]);
  });

  it('records the reviewer for each finished internal review step', () => {
    const finished = fixture.tasks.filter(task => task.workflowStepKind === 'internal_review' && task.status === 'Completed');
    expect(finished.length).toBeGreaterThan(0);
    for (const task of finished) expect(task.internalReview?.reviewedBy).toBeTruthy();
  });
});
