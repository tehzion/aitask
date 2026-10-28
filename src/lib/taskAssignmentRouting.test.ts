import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { useStore } from '../store';
import { eligibleTaskHods, eligibleTaskStaff } from './taskWorkflowAccess';

const initial = useStore.getState();
const pm: User = { id: 'routing-pm', name: 'PM', role: 'Project Manager', departments: [] };
const hod: User = { id: 'routing-hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const secondHod: User = { id: 'routing-hod-2', name: 'Second HOD', role: 'HOD', departments: ['Designer'] };
const staff: User = { id: 'routing-staff', name: 'Staff', role: 'Staff', departments: ['Designer'] };
const otherStaff: User = { id: 'routing-other-staff', name: 'Other Staff', role: 'Staff', departments: ['Designer'] };
const client: User = { id: 'routing-client', name: 'Client', role: 'Client', companyName: 'Routing Co', departments: [] };
const project: Project = {
  id: 'routing-project', clientId: 'routing-client-profile', clientName: 'Routing Co', projectName: 'Routing Project',
  createdBy: pm.id, projectManagerIds: [pm.id], hodMemberIds: [hod.id], staffMemberIds: [staff.id],
  services: ['Design'], startDate: '2026-10-01', deadline: '',
};
const taskDraft: Omit<Task, 'id'> = {
  clientId: project.clientId,
  clientName: project.clientName,
  projectId: project.id,
  projectName: project.projectName,
  serviceType: 'Design',
  title: 'Route artwork',
  description: '',
  department: 'Designer',
  assignedTo: '',
  createdBy: pm.id,
  startDate: '2026-10-01',
  dueDate: '2026-10-20',
  priority: 'High',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
};

beforeEach(() => useStore.setState({
  ...initial,
  currentUser: pm,
  users: [pm, hod, staff, client],
  clients: [{ id: project.clientId!, clientName: project.clientName, createdBy: pm.id, createdAt: '', updatedAt: '' }],
  projects: [project],
  tasks: [],
  notifications: [],
  rolePermissions: [],
  backend: { ...initial.backend, mode: 'local', status: 'local', pendingMutations: 0, hasLocalChanges: false },
}, true));

afterEach(() => useStore.setState(initial, true));

describe('PM to HOD routing', () => {
  it('resolves only project-authorized HODs and project-authorized Staff', () => {
    expect(eligibleTaskHods('Designer', project, [pm, hod, secondHod])).toEqual([hod]);
    expect(eligibleTaskStaff('Designer', project, [staff, otherStaff])).toEqual([staff]);
  });

  it('automatically assigns a sole HOD and keeps Staff unassigned', () => {
    const id = useStore.getState().addTask(taskDraft);
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks[0]).toMatchObject({
      assignedTo: hod.id,
      responsibleHodId: hod.id,
      assignmentState: 'pending_hod',
    });
  });

  it('requires an explicit HOD when multiple HODs are eligible', () => {
    useStore.setState({ users: [pm, hod, secondHod, staff, client], projects: [{ ...project, hodMemberIds: [hod.id, secondHod.id] }] });
    expect(useStore.getState().addTask({ ...taskDraft, assignmentState: 'pending_hod' })).toBe('');
    const id = useStore.getState().addTask({ ...taskDraft, responsibleHodId: secondHod.id, assignedTo: secondHod.id, assignmentState: 'pending_hod' });
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks[0].responsibleHodId).toBe(secondHod.id);
  });

  it('blocks the explicit new-task route when the department HOD is not on the project', () => {
    useStore.setState({ projects: [{ ...project, hodMemberIds: [] }] });
    expect(useStore.getState().addTask({ ...taskDraft, assignmentState: 'pending_hod' })).toBe('');
  });

  it('lets the PM assign Staff directly when the department has no HOD', () => {
    useStore.setState({ users: [pm, staff, client], projects: [{ ...project, hodMemberIds: [] }] });
    const id = useStore.getState().addTask({ ...taskDraft, assignedTo: staff.id });
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks.find(task => task.id === id)).toMatchObject({
      assignedTo: staff.id,
      responsibleHodId: undefined,
      assignmentState: 'assigned_staff',
    });
  });
});

describe('HOD delegation state', () => {
  it('moves the task to Staff while retaining the responsible HOD', () => {
    const id = useStore.getState().addTask(taskDraft);
    useStore.setState({ currentUser: hod });
    expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(true);
    expect(useStore.getState().tasks[0]).toMatchObject({
      assignedTo: staff.id,
      responsibleHodId: hod.id,
      assignmentState: 'assigned_staff',
    });
  });

  it('allows a scoped PM override only through the explicit action', () => {
    const id = useStore.getState().addTask(taskDraft);
    expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(false);
    expect(useStore.getState().overrideTaskAssignee(id, staff.id, 'Urgent client escalation').ok).toBe(true);
    expect(useStore.getState().tasks[0].assignmentOverride?.reason).toBe('Urgent client escalation');
    expect(useStore.getState().tasks[0].workHistory?.at(-1)?.fields).toEqual(expect.arrayContaining(['assignedTo', 'assignmentState', 'assignmentOverride']));
  });
});
