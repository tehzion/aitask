import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { ServiceWorkflowTemplate, User } from '../types';
import { snapshotWorkflow } from '../lib/serviceManagement';
import { getTaskAccess } from '../lib/access';

const initial = useStore.getState();
const boss: User = { id: 'review-boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true, departments: ['Management'] };
const staff: User = { id: 'review-worker', name: 'Worker', role: 'Staff', departments: ['Designer', 'Video Editor'] };
const designerHod: User = { id: 'designer-review-hod', name: 'Designer HOD', role: 'HOD', departments: ['Designer'] };
const hod: User = { id: 'review-hod', name: 'HOD', role: 'HOD', departments: ['Video Editor'] };
const template: ServiceWorkflowTemplate = { id: 'review-template', name: 'Reviewed production', serviceTypes: ['Design'], revision: 1, isActive: true, createdAt: '', updatedAt: '', steps: [
  { id: 'work-step', order: 1, title: 'Create', department: 'Designer', kind: 'work', clientVisible: false, required: true },
  { id: 'review-step', order: 2, title: 'Review', department: 'Video Editor', kind: 'internal_review', clientVisible: false, required: true },
  { id: 'publish-step', order: 3, title: 'Publish', department: 'Designer', kind: 'publishing', clientVisible: true, required: true },
] };
let ids: string[];
const task = (index: number) => useStore.getState().tasks.find(item => item.id === ids[index])!;

describe('enforced internal workflow review', () => {
  beforeEach(() => {
    useStore.setState({ ...initial, currentUser: boss, users: [boss, staff, hod, designerHod], tasks: [], clients: [], projects: [], clientPlans: [], serviceCycles: [], deliverables: [], addons: [], notifications: [], rolePermissions: [], servicePricingSnapshots: [], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } }, true);
    const plan = useStore.getState().createClientWithPlan({ clientName: 'Review Company', planName: 'Reviewed Plan', origin: 'custom', serviceItems: [{ id: 'review-service', name: 'Design', platforms: [], unit: 'output', quantity: 1, unitPriceMinor: 0, workflow: snapshotWorkflow(template) }], startDate: '2026-10-01', billingDay: 1, discountType: 'none', discountValue: 0, taxRateBps: 0 });
    expect(plan.ok).toBe(true);
    expect(useStore.getState().activateClientPlan(plan.planId!).ok).toBe(true);
    ids = useStore.getState().generateDeliverableTaskChain(useStore.getState().deliverables[0].id).taskIds!;
    ids.forEach(id => {
      expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(true);
      expect(useStore.getState().updateTaskAttachment(id, 'https://example.com/output.pdf').ok).toBe(true);
    });
  });
  afterEach(() => useStore.setState(initial, true));

  const submit = (index: number) => {
    useStore.setState({ currentUser: staff });
    expect(useStore.getState().updateTaskStatus(ids[index], 'Waiting Approval').ok).toBe(true);
  };
  const approve = (index: number) => {
    useStore.setState({ currentUser: index === 1 ? hod : designerHod });
    expect(useStore.getState().updateTaskStatus(ids[index], 'Approved')).toMatchObject({ ok: true });
  };
  const complete = (index: number) => {
    submit(index); approve(index);
    useStore.setState({ currentUser: boss });
    expect(useStore.getState().updateTaskStatus(ids[index], 'Completed').ok).toBe(true);
  };

  it('rejects unfinished predecessors and Staff approval before changing state', () => {
    useStore.setState({ currentUser: staff });
    const before = useStore.getState().tasks;
    expect(useStore.getState().updateTaskStatus(ids[1], 'Waiting Approval').ok).toBe(false);
    expect(useStore.getState().updateTask(ids[1], { status: 'Waiting Approval' }).ok).toBe(false);
    expect(useStore.getState().tasks).toBe(before);
    complete(0); submit(1);
    expect(useStore.getState().updateTaskStatus(ids[1], 'Approved').ok).toBe(false);
    expect(useStore.getState().updateTaskStatus(ids[1], 'Completed').ok).toBe(false);
    expect(useStore.getState().updateTaskStatus(ids[2], 'Waiting Approval').ok).toBe(false);
    expect(task(1).internalReview).toBeUndefined();
  });

  it.each(['Approved', 'Completed'] as const)('invalidates a downstream %s after an upstream revision', status => {
    complete(0); complete(1); submit(2); approve(2);
    if (status === 'Completed') {
      useStore.setState({ currentUser: boss });
      expect(useStore.getState().updateTaskStatus(ids[2], 'Completed').ok).toBe(true);
    }
    useStore.setState({ currentUser: boss });
    expect(useStore.getState().requestRevision(ids[0], 'Replace the artwork').ok).toBe(true);
    useStore.setState({ currentUser: staff });
    expect(useStore.getState().updateTaskAttachment(ids[0], 'https://example.com/new-output.pdf').ok).toBe(true);
    expect(task(1)).toMatchObject({ status: 'Pending', isCompleted: false, internalReview: undefined });
    expect(task(2)).toMatchObject({ status: 'Pending', isCompleted: false, clientApprovalStatus: 'Pending' });
    expect(useStore.getState().deliverables[0].status).toBe('In Progress');
    expect(useStore.getState().updateTaskStatus(ids[1], 'Waiting Approval').ok).toBe(false);
  });

  it('signs at 80 percent and preserves the HOD signature through PM completion and private notes', () => {
    complete(0); submit(1); approve(1);
    const review = task(1).internalReview;
    const version = task(1).workflowOutputVersion;
    expect(task(1)).toMatchObject({ status: 'Approved', isCompleted: false, completionPercentage: 80 });
    expect(review).toMatchObject({ reviewedBy: hod.id, inputVersions: [{ taskId: ids[0], outputVersion: task(0).workflowOutputVersion }] });
    expect(useStore.getState().updateTaskStatus(ids[1], 'Completed').ok).toBe(false);
    useStore.setState({ currentUser: boss });
    expect(useStore.getState().updateTaskStatus(ids[1], 'Completed').ok).toBe(true);
    expect(task(1).internalReview).toEqual(review);
    expect(task(1).workflowOutputVersion).toBe(version);
    complete(2);
    useStore.setState({ currentUser: staff });
    expect(useStore.getState().updateTask(ids[1], { notes: 'Private handover note' }).ok).toBe(true);
    expect(task(1).internalReview).toEqual(review);
    expect(task(1).workflowOutputVersion).toBe(version);
    expect(task(2).status).toBe('Completed');
    expect(useStore.getState().deliverables[0].status).toBe('Ready');
  });

  it('preserves scheduling edits while blocking frozen identity and deletion bypasses', () => {
    complete(0); complete(1);
    const review = task(1).internalReview;
    expect(useStore.getState().updateTaskDueDate(ids[0], '2026-10-20').ok).toBe(true);
    expect(task(1).internalReview).toEqual(review);
    expect(useStore.getState().updateTask(ids[1], { workflowStepKind: 'work' } as never).ok).toBe(false);
    expect(useStore.getState().updateTask(ids[1], { predecessorTaskIds: [] } as never).ok).toBe(false);
    expect(useStore.getState().updateTask(ids[1], { department: 'Designer' }).ok).toBe(false);
    expect(useStore.getState().updateTask(ids[1], { visibility: 'client-visible' } as never).ok).toBe(false);
    expect(useStore.getState().deleteTask(ids[1]).ok).toBe(false);
    expect(getTaskAccess(boss, task(1)).canDelete).toBe(false);
  });

  it('lets the responsible PM override an internal-review decision within their portfolio', () => {
    complete(0); submit(1);
    useStore.setState({ currentUser: { ...hod, departments: ['Designer'] } });
    expect(useStore.getState().updateTaskStatus(ids[1], 'Approved').ok).toBe(false);
    const pm: User = { id: 'responsible-pm', name: 'PM', role: 'Project Manager', departments: ['Management'] };
    useStore.setState({ currentUser: pm, users: [...useStore.getState().users, pm], clients: useStore.getState().clients.map(item => ({ ...item, createdBy: pm.id })) });
    expect(useStore.getState().updateTaskStatus(ids[1], 'Approved').ok).toBe(true);
    expect(useStore.getState().updateTaskStatus(ids[1], 'Completed').ok).toBe(true);
    expect(task(1).internalReview?.reviewedBy).toBe(pm.id);
  });
});
