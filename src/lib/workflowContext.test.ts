import { describe, expect, it } from 'vitest';
import type { AttachmentRef, Task } from '../types';
import { loadWorkflowContext } from './workflowContext';
import { hasTaskEvidence } from './staffWorkflow';
import { getTaskOutputAttachments, getTaskReviewInputLinks } from './taskOutputEvidence';

const file: AttachmentRef = { id: 'file', bucket: 'client-service-files', path: 'aitask-main/client/cycle/output.pdf', fileName: 'output.pdf', mimeType: 'application/pdf', sizeBytes: 12, uploadedBy: 'staff', uploadedAt: '2026-10-14T00:00:00.000Z' };
const task = { id: 'task', clientId: 'client', serviceCycleId: 'cycle', deliverableId: 'output', clientName: 'Company', serviceType: 'Design', title: 'Review output', description: '', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', status: 'Waiting Approval', priority: 'Medium', completionPercentage: 60, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false } as Task;
const context = (actorId: string, files = [file], canApprove = true) => ({ data: { ok: true, tasks: [{ id: task.id, reviewAccess: { actorId, canApprove }, reviewEvidence: { actorId, attachments: files } }] }, error: null });

describe('actor-bound reviewer evidence', () => {
  it('lets a canonical HOD review file-only output without a service assignment', async () => {
    const [loaded] = await loadWorkflowContext([task], () => Promise.resolve(context('hod')), 'Upgrade', 'hod');
    expect(hasTaskEvidence(loaded, [])).toBe(true);
    expect(getTaskOutputAttachments(loaded, [], 'hod')).toEqual([file]);
    expect(getTaskOutputAttachments(loaded, [], 'other')).toEqual([]);
  });
  it('rejects another actor and revoked review permission', async () => {
    for (const response of [context('other'), context('hod', [file], false)]) {
      const [loaded] = await loadWorkflowContext([task], () => Promise.resolve(response), 'Upgrade', 'hod');
      expect(loaded.reviewEvidence).toBeUndefined();
      expect(hasTaskEvidence(loaded, [])).toBe(false);
    }
  });
  it('rejects cross-client, cross-cycle and traversal paths', async () => {
    const files = ['aitask-main/other/cycle/output.pdf', 'aitask-main/client/other/output.pdf', 'aitask-main/client/cycle/../output.pdf'].map(path => ({ ...file, path }));
    const [loaded] = await loadWorkflowContext([task], () => Promise.resolve(context('hod', files)), 'Upgrade', 'hod');
    expect(loaded.reviewEvidence).toBeUndefined();
  });
  it('clears stale evidence when the backend has no matching context', async () => {
    const stale = { ...task, reviewEvidence: { actorId: 'hod', attachments: [file] } };
    const [loaded] = await loadWorkflowContext([stale], () => Promise.resolve({ data: { ok: true, tasks: [] }, error: null }), 'Upgrade', 'hod');
    expect(loaded.reviewEvidence).toBeUndefined();
  });
});

it('hides retained canonical evidence as soon as its review grant is revoked', () => {
  const retained = { ...task, reviewAccess: { actorId: 'hod', canApprove: false }, reviewEvidence: { actorId: 'hod', attachments: [file] } };
  expect(getTaskOutputAttachments(retained, [], 'hod')).toEqual([]);
});

it('renders a usable filename for legacy references and skips malformed entries', () => {
  const legacy = { id: 'legacy', bucket: 'client-service-files', path: 'aitask-main/client/cycle/legacy.pdf' } as AttachmentRef;
  const output = { id: 'output', clientId: 'client', cycleId: 'cycle', taskIds: ['task'], attachments: [null, legacy] } as unknown as import('../types').Deliverable;
  expect(getTaskOutputAttachments(task, [output], 'staff')).toEqual([{ ...legacy, fileName: 'legacy.pdf' }]);
});


it('projects only safe completed input links to the assigned reviewer or HOD', async () => {
  const inputTask = { ...task, workflowStepId: 'review', workflowStepKind: 'internal_review', predecessorTaskIds: ['work'] } as Task;
  const links = [{ taskId: 'work', url: 'https://example.com/output.mp4', name: 'Video', outputVersion: 2 },
    { taskId: 'foreign', url: 'https://example.com/private', name: 'Foreign', outputVersion: 1 },
    { taskId: 'work', url: 'javascript:alert(1)', name: 'Unsafe', outputVersion: 1 }];
  const response = (actorId: string, canApprove: boolean) => ({ data: { ok: true, tasks: [{ id: task.id, workflowStepKind: 'internal_review' as const,
    reviewAccess: { actorId, canApprove }, reviewEvidence: { actorId, attachments: [], links } }] }, error: null });
  for (const [actor, approval] of [['staff', false], ['hod', true]] as const) {
    const [loaded] = await loadWorkflowContext([inputTask], () => Promise.resolve(response(actor, approval)), 'Upgrade', actor);
    expect(getTaskReviewInputLinks(loaded, actor)).toEqual([links[0]]);
    expect(hasTaskEvidence(loaded, [])).toBe(true);
    expect(getTaskReviewInputLinks(loaded, 'other')).toEqual([]);
  }
  const [revoked] = await loadWorkflowContext([inputTask], () => Promise.resolve(response('hod', false)), 'Upgrade', 'hod');
  expect(revoked.reviewEvidence).toBeUndefined();
});


it('lets a portfolio PM read inputs without granting HOD sign-off', async () => {
  const linked = { ...task, workflowStepKind: 'internal_review', workflowStepId: 'review', predecessorTaskIds: ['work'] } as Task;
  const link = { taskId: 'work', url: 'https://example.com/output.mp4', name: 'Output', outputVersion: 2 };
  const [loaded] = await loadWorkflowContext([linked], () => Promise.resolve({ data: { ok: true, tasks: [{ id: task.id, workflowStepKind: 'internal_review',
    reviewAccess: { actorId: 'pm', canApprove: false, canReadInputs: true }, reviewEvidence: { actorId: 'pm', attachments: [], links: [link] } }] }, error: null }), 'Upgrade', 'pm');
  expect(getTaskReviewInputLinks(loaded, 'pm')).toEqual([link]);
  expect(loaded.reviewAccess?.canApprove).toBe(false);
  expect(hasTaskEvidence(loaded, [])).toBe(true);
});
