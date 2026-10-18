import { describe, expect, it } from 'vitest';
import { getTutorialById } from './tutorials';
import { workflowGuides } from './workflowGuides';

describe('workflow learning guides', () => {
  it('links every stage to an existing tutorial and keeps assignment rules explicit', () => {
    workflowGuides.forEach(guide => guide.stages.forEach(stage => expect(getTutorialById(stage.tutorialId)).toBeTruthy()));
    const reassignment = workflowGuides.find(guide => guide.id === 'task-reassignment');
    expect(reassignment?.rules.map(rule => rule.en).join(' ')).toContain('Pending, In Progress, and Revision');
    expect(reassignment?.rules.map(rule => rule.en).join(' ')).toContain('Waiting Approval, Approved, Completed, and Cancelled');
  });
});
