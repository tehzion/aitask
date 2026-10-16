import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deliverable, ServiceCycle, Task, User } from '../types';
import { canReviewTaskAsClient } from '../lib/access';
import { getClientApprovalDate } from '../lib/clientPortal';

const backend = vi.hoisted(() => ({ secure: false }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: {},
  shouldUseSecureSupabase: () => backend.secure,
  resolveAuthEmail: (value: string) => value,
}));
import { useStore } from './index';

const initial = useStore.getState();
const timestamp = '2026-10-01T00:00:00Z';
const client: User = { id: 'progress-client', name: 'Customer', role: 'Client', companyName: 'Progress Co', departments: ['Client'] };
const pm: User = { id: 'progress-pm', name: 'Project Manager', role: 'Project Manager', department: 'Management', departments: ['Management'], isSuperAdmin: true };
const task: Task = {
  id: 'progress-task', clientId: 'progress-company', clientName: 'Progress Co', title: 'Historical delivery awaiting acceptance',
  description: '', serviceType: 'Design', department: 'Designer', assignedTo: 'staff', createdBy: 'pm',
  startDate: '2026-10-01', dueDate: '', status: 'Completed', isCompleted: true, completedAt: timestamp,
  priority: 'Medium', completionPercentage: 100, clientApprovalStatus: 'Pending', revisionCount: 0,
  visibility: 'client-visible', deliverableId: 'progress-output', serviceCycleId: 'progress-cycle', isRecurring: false,
};
const deliverable: Deliverable = {
  id: 'progress-output', clientId: task.clientId!, clientName: task.clientName, planId: 'progress-plan',
  cycleId: task.serviceCycleId!, serviceItemId: 'design', sequence: 1, title: 'Artwork', status: 'Ready',
  taskIds: [task.id], attachments: [], createdAt: timestamp, updatedAt: timestamp,
};
const cycle: ServiceCycle = {
  id: task.serviceCycleId!, clientId: task.clientId!, clientName: task.clientName, planId: 'progress-plan', planRevision: 1,
  periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'Published', currency: 'MYR',
  serviceItems: [], addonSnapshots: [], discountType: 'none', discountValue: 0, taxRateBps: 0,
  publishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
};
const reviewReadyTask: Task = {
  ...task,
  id: 'review-ready-task',
  assignedTo: pm.id,
  createdBy: pm.id,
  status: 'Approved',
  isCompleted: false,
  completedAt: undefined,
  completionPercentage: 80,
  clientApprovalStatus: 'Pending',
  deliverableId: undefined,
  serviceCycleId: undefined,
  approvalHistory: [],
};
beforeEach(() => {
  backend.secure = false;
  useStore.setState({
    ...initial, currentUser: client, users: [client], clients: [], projects: [], rolePermissions: [], notifications: [],
    tasks: [structuredClone(task)], deliverables: [structuredClone(deliverable)], serviceCycles: [structuredClone(cycle)],
    backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
  }, true);
});
afterEach(() => { backend.secure = false; useStore.setState(initial, true); });

describe('client decisions and derived delivery progress', () => {
  it.each(['Ready', 'Delivered'] as const)('reopens a local %s delivery when the customer requests changes', status => {
    useStore.setState({
      deliverables: [{ ...deliverable, status, deliveredAt: status === 'Delivered' ? timestamp : undefined }],
      serviceCycles: [{ ...cycle, status: status === 'Delivered' ? 'Completed' : 'Published' }],
    });
    expect(useStore.getState().reviewClientApproval(task.id, 'Rejected', 'Please revise the artwork').ok).toBe(true);
    const state = useStore.getState();
    expect(state.tasks[0]).toMatchObject({ status: 'In Progress', isCompleted: false, completionPercentage: 50, revisionCount: 1 });
    expect(state.deliverables[0]).toMatchObject({ status: 'In Progress', deliveredAt: undefined });
    expect(state.serviceCycles[0].status).toBe('Published');
  });

  it('records customer acceptance without reopening an already completed task', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved').ok).toBe(true);
    const state = useStore.getState();
    expect(state.tasks[0]).toMatchObject({
      status: 'Completed',
      clientApprovalStatus: 'Approved',
      isCompleted: true,
      completedAt: timestamp,
      completionPercentage: 100,
    });
    expect(state.tasks[0].approvalHistory).toEqual([expect.objectContaining({ userId: client.id, status: 'Approved' })]);
    expect(state.deliverables[0].status).toBe('Ready');
    expect(state.serviceCycles[0].status).toBe('Published');
  });

  it.each(['Approved', 'Rejected'] as const)('leaves hosted delivery and cycle derivation to the server after a %s decision', decision => {
    backend.secure = true;
    useStore.setState({ backend: { ...initial.backend, mode: 'supabase', status: 'live', hasLocalChanges: false, pendingMutations: 0 } });
    const beforeDeliverables = structuredClone(useStore.getState().deliverables);
    const beforeCycles = structuredClone(useStore.getState().serviceCycles);
    expect(useStore.getState().reviewClientApproval(task.id, decision, 'Customer feedback').ok).toBe(true);
    expect(useStore.getState().tasks[0].clientApprovalStatus).toBe(decision);
    expect(useStore.getState().deliverables).toEqual(beforeDeliverables);
    expect(useStore.getState().serviceCycles).toEqual(beforeCycles);
  });
});

describe('project manager completion and client acceptance', () => {
  const setReviewReadyTask = () => useStore.setState({
    currentUser: pm,
    users: [pm, client],
    tasks: [structuredClone(reviewReadyTask)],
    deliverables: [],
    serviceCycles: [],
  });
  const expectClientReviewPending = () => {
    const completed = useStore.getState().tasks[0];
    expect(completed).toMatchObject({ status: 'Completed', isCompleted: true, completionPercentage: 100, clientApprovalStatus: 'Pending' });
    expect(completed.approvalHistory).toEqual([]);
    expect(canReviewTaskAsClient(client, completed)).toBe(true);
    expect(getClientApprovalDate(completed)).toBeNull();
  };

  it('keeps client review pending when completion uses the status action', () => {
    setReviewReadyTask();
    expect(useStore.getState().updateTaskStatus(reviewReadyTask.id, 'Completed').ok).toBe(true);
    expectClientReviewPending();
  });

  it('keeps client review pending when completion uses the full task editor', () => {
    setReviewReadyTask();
    expect(useStore.getState().updateTask(reviewReadyTask.id, { status: 'Completed' }).ok).toBe(true);
    expectClientReviewPending();
  });
});
