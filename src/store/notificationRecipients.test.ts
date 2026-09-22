import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const boss: User = { id: 'boss-notify', name: 'Boss Koo', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true };
const pmA: User = { id: 'pm-notify-a', name: 'PM A', role: 'Project Manager', departments: ['Management'], department: 'Management' };
const pmB: User = { id: 'pm-notify-b', name: 'PM B', role: 'Project Manager', departments: ['Management'], department: 'Management' };
const staff: User = { id: 'staff-notify', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' };

const task: Task = {
  id: 'task-notify',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Notify work',
  description: '',
  department: 'Designer',
  assignedTo: staff.id,
  createdBy: staff.id,
  startDate: '2026-09-01',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
};

describe('task update notification recipients', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: staff,
      users: [boss, pmA, pmB, staff],
      clients: [{ id: 'client-notify', clientName: 'Acme', createdBy: pmA.id, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
      projects: [],
      tasks: [{ ...task }],
      notifications: [],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('notifies Boss and the owning PM, not every Project Manager', () => {
    useStore.getState().updateTaskStatus(task.id, 'In Progress');

    const statusNotices = useStore.getState().notifications.filter(notification => notification.title === 'Task Status Updated');
    const recipients = statusNotices.map(notification => notification.targetUserId).sort();

    expect(recipients).toEqual([boss.id, pmA.id].sort());
    expect(recipients).not.toContain(pmB.id);
    expect(statusNotices.every(notification => !notification.targetRole)).toBe(true);
  });
});
