import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({ supabase: {}, shouldUseSecureSupabase: () => false, resolveAuthEmail: (value: string) => value }));
import { useStore } from './index';
import { useToastStore } from './useToastStore';
import type { Task, User } from '../types';
const initial = useStore.getState();
const client: User = { id: 'feedback-client', name: 'Customer', role: 'Client', companyName: 'Customer Co', department: 'Client', departments: ['Client'] };
const task: Task = { id: 'feedback-task', clientName: 'Customer Co', title: 'Review delivery', description: '', serviceType: 'Design', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', startDate: '2026-10-01', dueDate: '2026-10-08', status: 'Waiting Approval', priority: 'Medium', isCompleted: false, completionPercentage: 100, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, visibility: 'client-visible' };
beforeEach(() => { useStore.setState({ ...initial, currentUser: client, users: [client], clients: [], projects: [], tasks: [task], notifications: [], rolePermissions: [], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } }, true); useToastStore.setState({ toasts: [] }); });
describe('Customer approval persistence feedback', () => {
  it.each(['Approved', 'Rejected'] as const)('does not announce an optimistic %s decision as persisted', status => {
    expect(useStore.getState().reviewClientApproval(task.id, status, 'Customer feedback').ok).toBe(true);
    expect(useStore.getState().tasks[0].clientApprovalStatus).toBe(status);
    expect(useToastStore.getState().toasts.filter(toast => toast.message === 'Task approved successfully' || toast.message === 'Revision request submitted')).toEqual([]);
  });
});

describe('Customer text validation', () => {
  it('rejects overlong approval notes without changing the delivery', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved', 'a'.repeat(2001)).ok).toBe(false);
    expect(useStore.getState().tasks[0]).toEqual(task);
  });
  it('requires a reason for requesting changes even outside the form', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Rejected', '   ').ok).toBe(false);
    expect(useStore.getState().tasks[0]).toEqual(task);
  });
  it('rejects overlong feedback without silently truncating it', () => {
    expect(useStore.getState().addComment(task.id, 'a'.repeat(2001)).ok).toBe(false);
    expect(useStore.getState().tasks[0].comments).toBeUndefined();
  });
  it('preserves Unicode feedback using the server character count', () => {
    const text = '🙂'.repeat(2000);
    expect(useStore.getState().addComment(task.id, text).ok).toBe(true);
    expect(useStore.getState().tasks[0].comments?.[0].text).toBe(text);
  });
  it('accepts a decision note at the server limit', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Rejected', 'a'.repeat(2000)).ok).toBe(true);
    expect(useStore.getState().tasks[0].approvalHistory?.[0].note).toHaveLength(2000);
  });
});

describe('Customer decision notifications', () => {
  it.each(['Approved', 'Rejected'] as const)('sends one %s notice when the assignee is also the owning PM', status => {
    const pm: User = { id: 'owner-pm', name: 'Owner PM', role: 'Project Manager', department: 'Management', departments: ['Management'] };
    useStore.setState({ users: [client, pm], tasks: [{ ...task, assignedTo: pm.id, createdBy: pm.id }] });
    expect(useStore.getState().reviewClientApproval(task.id, status, 'Customer decision').ok).toBe(true);
    expect(useStore.getState().notifications.filter(item => item.targetUserId === pm.id)).toHaveLength(1);
  });
});
