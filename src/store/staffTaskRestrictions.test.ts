import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const pm: User = {
  id: 'pm-staff-restrict',
  name: 'PM Restrict',
  role: 'Project Manager',
  departments: ['Designer'],
  department: 'Designer',
};

const staff: User = {
  id: 'staff-restrict',
  name: 'Staff Restrict',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const staffTwo: User = {
  id: 'staff-restrict-2',
  name: 'Staff Restrict Two',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const task: Task = {
  id: 'task-staff-restrict',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Staff work',
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

describe('staff task restrictions', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: staff,
      users: [pm, staff, staffTwo],
      tasks: [{ ...task }],
      clients: [],
      projects: [],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('lets Staff edit their assigned task fields', () => {
    const result = useStore.getState().updateTask(task.id, { status: 'In Progress' });
    expect(result.ok).toBe(true);
    expect(useStore.getState().tasks.find(item => item.id === task.id)?.status).toBe('In Progress');
  });

  it('blocks Staff from changing the task department', () => {
    const result = useStore.getState().updateTask(task.id, { department: 'Video Editor' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/department/i);
    expect(useStore.getState().tasks.find(item => item.id === task.id)?.department).toBe('Designer');
  });

  it('blocks Staff from reassigning the task', () => {
    const result = useStore.getState().updateTask(task.id, { assignedTo: staffTwo.id });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reassign/i);
    expect(useStore.getState().tasks.find(item => item.id === task.id)?.assignedTo).toBe(staff.id);
  });
});
