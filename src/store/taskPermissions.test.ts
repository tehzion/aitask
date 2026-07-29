import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultRolePermissions } from '../lib/access';
import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const staff: User = {
  id: 'staff-task-scope',
  name: 'Scoped Staff',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const otherStaff: User = {
  id: 'staff-task-other',
  name: 'Other Staff',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-scope-own',
  clientName: 'Acme',
  serviceType: 'Design',
  title: 'Scoped work',
  description: '',
  department: 'Designer',
  assignedTo: staff.id,
  createdBy: otherStaff.id,
  startDate: '2026-07-13',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
  ...overrides,
});

const ownTask = makeTask({});
const unrelatedTask = makeTask({
  id: 'task-scope-unrelated',
  clientName: 'Beta',
  assignedTo: otherStaff.id,
  createdBy: otherStaff.id,
});
const creatorOnlyTask = makeTask({
  id: 'task-scope-creator-only',
  clientName: 'Creator Only',
  assignedTo: otherStaff.id,
  createdBy: staff.id,
});

describe('task store authorization', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: staff,
      users: [staff, otherStaff],
      tasks: [ownTask, unrelatedTask, creatorOnlyTask],
      projects: [],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('allows assigned work and rejects unrelated work by default', () => {
    expect(useStore.getState().updateTask(ownTask.id, { priority: 'High' }).ok).toBe(true);
    expect(useStore.getState().updateTask(unrelatedTask.id, { priority: 'High' })).toEqual({
      ok: false,
      error: 'You do not have permission to edit this task.',
    });
    expect(useStore.getState().tasks.find(task => task.id === unrelatedTask.id)?.priority).toBe('Medium');
    expect(useStore.getState().updateTask(creatorOnlyTask.id, { priority: 'High' }).ok).toBe(false);
    expect(useStore.getState().deleteTask(creatorOnlyTask.id).ok).toBe(false);
  });

  it('keeps View all tasks read-only for unrelated work', () => {
    useStore.setState({
      currentUser: {
        ...staff,
        permissions: { ...defaultRolePermissions.Staff, viewAllTasks: true },
      },
    });

    expect(useStore.getState().updateTask(unrelatedTask.id, { priority: 'High' }).ok).toBe(false);
    expect(useStore.getState().deleteTask(unrelatedTask.id).ok).toBe(false);
  });

  it('allows Edit all tasks to update and delete unrelated work', () => {
    useStore.setState({
      currentUser: {
        ...staff,
        permissions: { ...defaultRolePermissions.Staff, editTasks: true },
      },
    });

    expect(useStore.getState().updateTask(unrelatedTask.id, { priority: 'High' }).ok).toBe(true);
    expect(useStore.getState().deleteTask(unrelatedTask.id).ok).toBe(true);
    expect(useStore.getState().tasks.some(task => task.id === unrelatedTask.id)).toBe(false);
  });

  it('requires a changed assignee and department pair to match membership', () => {
    useStore.setState({
      currentUser: {
        ...staff,
        permissions: { ...defaultRolePermissions.Staff, editTasks: true },
      },
    });

    expect(useStore.getState().updateTask(ownTask.id, {
      assignedTo: otherStaff.id,
      department: 'Operation',
    })).toEqual({
      ok: false,
      error: 'Other Staff is not assigned to Operation.',
    });

    useStore.setState({
      users: [staff, { ...otherStaff, departments: ['Designer', 'Operation'] }],
    });
    expect(useStore.getState().updateTask(ownTask.id, {
      assignedTo: otherStaff.id,
      department: 'Operation',
    }).ok).toBe(true);
  });

  it('limits Staff task creation to their own departments', () => {
    const taskInput = { ...ownTask, title: 'New scoped work' };
    useStore.setState({
      projects: [{
        id: 'project-staff-created',
        clientName: 'Acme',
        projectName: 'Acme',
        services: ['Design'],
        startDate: '2026-07-13',
        deadline: '',
        totalTasks: 0,
        completedTasks: 0,
      }],
    });

    expect(useStore.getState().addTask({
      ...taskInput,
      projectId: 'project-staff-created',
      department: 'Operation',
      assignedTo: staff.id,
      createdBy: staff.id,
    })).toBe('');

    expect(useStore.getState().addTask({
      ...taskInput,
      projectId: 'project-staff-created',
      department: 'Designer',
      assignedTo: staff.id,
      createdBy: staff.id,
    })).not.toBe('');
  });
});
