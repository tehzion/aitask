import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('diagnostic: HOD explicit status update and foreign department revision', async ({ page }) => {
  await page.goto('/login');
  const evidence = await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    const { taskTransitionError } = await import('/src/lib/taskWorkflowAccess.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const hod = { id: 'deep-audit-hod', name: 'Audit HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' };
    const worker = { id: 'deep-audit-staff', name: 'Audit worker', role: 'Staff', departments: ['Designer'], department: 'Designer' };
    const task = { ...state.tasks[0], id: 'deep-audit-task', title: 'Accepted output', clientName: 'Audit company', serviceType: 'Graphic Design', department: 'Designer', assignedTo: worker.id, createdBy: 'deep-audit-pm', assignedBy: 'deep-audit-pm', status: 'Approved', isCompleted: false, clientApprovalStatus: 'Approved', completionPercentage: 80, revisionCount: 0, generatedFromDeliverable: false, workflowStepId: undefined, deliverableId: undefined, serviceCycleId: undefined, clientId: undefined, projectId: undefined, predecessorTaskIds: [], startDate: '2026-10-01', dueDate: '2026-10-20', priority: 'Medium', internalReview: undefined, approvalHistory: [], comments: [], notes: undefined };
    useStore.setState({ currentUser: hod, users: [hod,worker], tasks: [task], clients: [], projects: [], rolePermissions: [], notifications: [], clientPlans: [], deliverables: [], serviceCycles: [], backend: { ...state.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false } });
    const result = useStore.getState().updateTask(task.id, { status: task.status, priority: 'High' });
    const after = useStore.getState().tasks[0];
    const foreign = { ...task, id: 'foreign-work', department: 'Video Editor', assignedTo: hod.id, status: 'Waiting Approval', clientApprovalStatus: 'Pending' };
    useStore.setState({ tasks: [foreign] });
    const localForeign = useStore.getState().requestRevision(foreign.id, 'Return work');
    return { fullEdit: { result, beforeAcceptance: task.clientApprovalStatus, afterAcceptance: after.clientApprovalStatus, status: after.status, priority: after.priority }, foreignRevision: { result: localForeign, transitionError: taskTransitionError(hod, foreign, { ...foreign, status: 'Revision', isCompleted: false }) } };
  });
  writeFileSync('/private/tmp/hod-latest-frontend-probe.json', JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
  // Diagnostic expectations record the observed fault; these are not proposed regression expectations.
  expect(evidence.fullEdit.result.ok).toBe(true);
  expect(evidence.fullEdit.afterAcceptance).toBe('Pending');
  expect(evidence.foreignRevision.result.ok).toBe(false);
});

test('diagnostic: activity files do not reach linked task evidence', async ({ page }) => {
  await page.goto('/login');
  const evidence = await page.evaluate(async () => {
    const { useStore, stopBackendAutoSync } = await import('/src/store/index.ts');
    stopBackendAutoSync();
    const state = useStore.getState();
    const hod = { id: 'file-audit-hod', name: 'HOD', role: 'HOD', department: 'Designer', departments: ['Designer'] };
    const task = { ...state.tasks[0], id: 'file-audit-task', title: 'Uploaded artwork', clientName: 'File company', serviceType: 'Graphic Design', clientId: 'file-company', department: 'Designer', assignedTo: hod.id, createdBy: hod.id, status: 'In Progress', isCompleted: false, clientApprovalStatus: 'Pending', completionPercentage: 30, revisionCount: 0, generatedFromDeliverable: false, workflowStepId: undefined, internalReview: undefined, predecessorTaskIds: [], attachmentLink: undefined, deliverableId: 'file-output', serviceCycleId: 'file-cycle', projectId: undefined };
    const output = { id: 'file-output', clientId: 'file-company', clientName: 'File company', cycleId: 'file-cycle', taskIds: [task.id], attachments: [], status: 'In Progress' };
    const cycle = { id: 'file-cycle', clientId: 'file-company', clientName: 'File company', status: 'Published', serviceItems: [], addonSnapshots: [] };
    useStore.setState({ currentUser: hod, users: [hod], tasks: [task], clients: [], projects: [], rolePermissions: [], notifications: [], clientPlans: [], serviceCycles: [cycle], deliverables: [output], cycleComments: [], backend: { ...state.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false } });
    const comment = useStore.getState().addCycleComment(cycle.id, 'Artwork attached', 'internal');
    const attachment = { id: 'file-upload', bucket: 'client-service-files', path: 'audit/file-company/file-cycle/output.pdf', fileName: 'output.pdf', mimeType: 'application/pdf', sizeBytes: 5, uploadedBy: hod.id, uploadedAt: new Date().toISOString() };
    const attachResult = useStore.getState().addCycleCommentAttachment(comment.id!, attachment);
    const submission = useStore.getState().updateTaskStatus(task.id, 'Waiting Approval');
    return { comment, attachResult, activityFiles: useStore.getState().cycleComments[0]?.attachments.length, outputFiles: useStore.getState().deliverables[0]?.attachments.length, submission };
  });
  writeFileSync('/private/tmp/hod-latest-file-route-probe.json', JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
  expect(evidence.comment.ok).toBe(true);
  expect(evidence.attachResult.ok).toBe(true);
  expect(evidence.activityFiles).toBe(1);
  expect(evidence.outputFiles).toBe(0);
  expect(evidence.submission.ok).toBe(false);
});
