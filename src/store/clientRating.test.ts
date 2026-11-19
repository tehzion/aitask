import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, User } from '../types';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {},
  shouldUseSecureSupabase: () => false,
  resolveAuthEmail: (value: string) => value,
}));
import { useStore } from './index';

const initial = useStore.getState();
const client: User = { id: 'rating-client', name: 'Customer', role: 'Client', companyName: 'Rating Co', departments: ['Client'] };
const task: Task = {
  id: 'rating-task', clientId: 'rating-company', clientName: 'Rating Co', title: 'Logo delivery',
  description: '', serviceType: 'Design', department: 'Designer', assignedTo: 'staff', createdBy: 'pm',
  startDate: '2026-10-01', dueDate: '', status: 'Approved', isCompleted: false,
  priority: 'Medium', completionPercentage: 80, clientApprovalStatus: 'Pending', revisionCount: 0,
  visibility: 'client-visible', isRecurring: false, approvalHistory: [],
};

beforeEach(() => {
  useStore.setState({
    ...initial, currentUser: client, users: [client], clients: [], projects: [], rolePermissions: [], notifications: [],
    tasks: [structuredClone(task)],
    backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
  }, true);
});
afterEach(() => useStore.setState(initial, true));

describe('client rating on approval', () => {
  it('stores the rating, trimmed comment and rater when the client approves', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved', '', { stars: 5, comment: '  Loved it  ' }).ok).toBe(true);
    expect(useStore.getState().tasks[0].clientRating).toMatchObject({ stars: 5, comment: 'Loved it', ratedBy: client.id });
  });

  it('approves without a rating when none is given', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved').ok).toBe(true);
    expect(useStore.getState().tasks[0].clientRating).toBeUndefined();
  });

  it.each([0, 6, -1])('refuses an out-of-range rating of %s and leaves the task untouched', stars => {
    const result = useStore.getState().reviewClientApproval(task.id, 'Approved', '', { stars });
    expect(result.ok).toBe(false);
    expect(useStore.getState().tasks[0]).toMatchObject({ clientApprovalStatus: 'Pending', status: 'Approved' });
  });

  it('refuses a rating on a change request', () => {
    const result = useStore.getState().reviewClientApproval(task.id, 'Rejected', 'Redo the colours', { stars: 1 });
    expect(result.ok).toBe(false);
    expect(useStore.getState().tasks[0].clientRating).toBeUndefined();
  });
});

describe('notices after a client rating', () => {
  const staff: User = { id: 'staff', name: 'Sam', role: 'Staff', departments: ['Designer'] };
  const boss: User = { id: 'boss', name: 'Boss', role: 'Project Manager', isSuperAdmin: true, departments: ['Management'] };
  const pm: User = { id: 'pm', name: 'Owner', role: 'Project Manager', departments: ['Management'] };

  beforeEach(() => {
    useStore.setState({ users: [client, staff, boss, pm], notifications: [] });
  });

  it('flags a one or two star rating as an action for everyone accountable', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved', '', { stars: 2, comment: 'Meh' }).ok).toBe(true);
    const low = useStore.getState().notifications.filter(notification => notification.title === 'Low Client Rating');
    expect(low.map(notification => notification.targetUserId).sort()).toEqual(['boss', 'pm', 'staff']);
    expect(low.every(notification => notification.importance === 'action' && notification.category === 'feedback')).toBe(true);
    expect(low[0].message).toContain('rated 2/5');
  });

  it('adds no low-rating notice for a good rating or a change request', () => {
    expect(useStore.getState().reviewClientApproval(task.id, 'Approved', '', { stars: 4 }).ok).toBe(true);
    expect(useStore.getState().notifications.some(notification => notification.title === 'Low Client Rating')).toBe(false);
  });
});
