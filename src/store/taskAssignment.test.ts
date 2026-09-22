import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const pm: User = {
  id: 'pm-assign',
  name: 'PM Assign',
  role: 'Project Manager',
  departments: ['Designer'],
  department: 'Designer',
};

const staff: User = {
  id: 'staff-assign',
  name: 'Staff Assign',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const staffTwo: User = {
  id: 'staff-assign-2',
  name: 'Staff Assign Two',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const task: Task = {
  id: 'task-assign',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Assigned work',
  description: '',
  department: 'Designer',
  assignedTo: staff.id,
  createdBy: pm.id,
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

const findTask = () => useStore.getState().tasks.find(item => item.id === task.id)!;

describe('task assignment attribution', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: pm,
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

  it('stamps assignedBy and assignedAt when a task is reassigned', () => {
    useStore.getState().updateTaskAssignee(task.id, staffTwo.id);

    const updated = findTask();
    expect(updated.assignedTo).toBe(staffTwo.id);
    expect(updated.assignedBy).toBe(pm.id);
    expect(updated.assignedAt).toBeTruthy();
  });

  it('keeps the existing assigner when only non-assignment fields change', () => {
    useStore.getState().updateTaskAssignee(task.id, staffTwo.id);
    const afterAssign = findTask();

    const result = useStore.getState().updateTask(task.id, { priority: 'High' });
    expect(result.ok).toBe(true);

    const afterEdit = findTask();
    expect(afterEdit.assignedBy).toBe(pm.id);
    expect(afterEdit.assignedAt).toBe(afterAssign.assignedAt);
  });
});
