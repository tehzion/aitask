import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const staff: User = {
  id: 'staff-company-owner',
  name: 'Company Owner',
  role: 'Staff',
  department: 'Designer',
};

const otherStaff: User = {
  id: 'staff-company-other',
  name: 'Other Staff',
  role: 'Staff',
  department: 'Editor',
};

const company: Project = {
  id: 'company-owned',
  clientName: 'Acme',
  projectName: 'Acme',
  services: ['Design'],
  startDate: '2026-07-18',
  deadline: '',
  totalTasks: 1,
  completedTasks: 0,
  createdBy: staff.id,
};

const linkedTask: Task = {
  id: 'task-company-other',
  projectId: company.id,
  projectName: company.projectName,
  clientName: company.clientName,
  serviceType: 'Design',
  title: 'Assigned elsewhere',
  description: '',
  department: 'Editor',
  assignedTo: otherStaff.id,
  createdBy: staff.id,
  startDate: '2026-07-18',
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

describe('company store authorization', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: staff,
      users: [staff, otherStaff],
      tasks: [linkedTask],
      projects: [company],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('allows an owner to update services without rewriting linked tasks', () => {
    const previousTask = useStore.getState().tasks[0];
    const result = useStore.getState().updateProject(company.id, { services: ['Design', 'SEO'] });

    expect(result.ok).toBe(true);
    expect(useStore.getState().projects[0]?.services).toEqual(['Design', 'SEO']);
    expect(useStore.getState().tasks[0]).toBe(previousTask);
  });

  it('blocks owner rename and deletion when linked tasks belong to other staff', () => {
    const rename = useStore.getState().updateProject(company.id, {
      clientName: 'Acme Global',
      projectName: 'Acme Global',
    });
    const deletion = useStore.getState().deleteProject(company.id);

    expect(rename).toEqual({
      ok: false,
      error: 'Only an admin can rename this company while it contains tasks assigned to other staff.',
    });
    expect(deletion).toEqual({
      ok: false,
      error: 'Only an admin can delete this company while it contains tasks assigned to other staff.',
    });
    expect(useStore.getState().projects[0]?.clientName).toBe('Acme');
    expect(useStore.getState().tasks[0]?.projectId).toBe(company.id);
  });

  it('allows an owner to rename and delete when every linked task is assigned to them', () => {
    useStore.setState({ tasks: [{ ...linkedTask, assignedTo: staff.id }] });

    expect(useStore.getState().updateProject(company.id, {
      clientName: 'Acme Global',
      projectName: 'Acme Global',
    }).ok).toBe(true);
    expect(useStore.getState().tasks[0]?.clientName).toBe('Acme Global');
    expect(useStore.getState().deleteProject(company.id).ok).toBe(true);
    expect(useStore.getState().tasks[0]?.projectId).toBeUndefined();
  });
});
