import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const staff: User = {
  id: 'unassigned-staff',
  name: 'Unassigned Staff',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const pm: User = {
  id: 'unassigned-pm',
  name: 'Owning PM',
  role: 'Project Manager',
  departments: ['Management'],
  department: 'Management',
};

const makeTask = (dueDate = ''): Task => ({
  id: 'unassigned-task',
  clientName: 'Unassigned Co',
  serviceType: 'Design',
  title: 'Unassigned task',
  description: '',
  department: 'Designer',
  assignedTo: '',
  assignedBy: pm.id,
  createdBy: staff.id,
  startDate: dueDate,
  dueDate,
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
  visibility: 'internal',
});

describe('unassigned task notification safety', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: staff,
      users: [staff, pm],
      tasks: [makeTask()],
      clients: [],
      projects: [],
      notifications: [],
      rolePermissions: [],
      backend: { ...initialState.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
    }, true);
  });

  afterEach(() => useStore.setState(initialState, true));

  it('saves a Staff comment without creating a blank assignee notification', () => {
    const result = useStore.getState().addComment('unassigned-task', 'The work is ready for review.');

    expect(result.ok).toBe(true);
    expect(useStore.getState().tasks[0]?.comments).toHaveLength(1);
    expect(useStore.getState().notifications.every(notification => Boolean(notification.targetUserId || notification.targetRole || notification.targetClient))).toBe(true);
    expect(useStore.getState().notifications.some(notification => notification.targetUserId === '')).toBe(false);
  });

  it('sends an unassigned reminder only to a valid task owner', () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    useStore.setState({ tasks: [makeTask(today)] });

    useStore.getState().sendDueDateReminders();

    const state = useStore.getState();
    expect(state.tasks[0]?.dueReminderSent).toBe(true);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      targetUserId: pm.id,
      title: 'Task Deadline Approaching',
    });
    expect(state.notifications[0]?.targetUserId).toBeTruthy();
  });
});
