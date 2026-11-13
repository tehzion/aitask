import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { defaultRolePermissions } from './access';
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
  it('resolves project-authorized HODs and department Staff', () => {
    expect(eligibleTaskHods('Designer', project, [pm, hod, secondHod])).toEqual([hod]);
    expect(eligibleTaskStaff('Designer', { ...project, staffMemberIds: [] }, [staff, otherStaff, { ...staff, id: 'wrong-department', departments: ['Video Editor'] }, { ...staff, id: 'inactive', hasLogin: false }]).map(user => user.id).sort()).toEqual([staff.id, otherStaff.id].sort());
  });

  it('preserves the PM choice without an HOD handoff even when the project has no Staff members', () => {
    useStore.setState({ projects: [{ ...project, hodMemberIds: [], staffMemberIds: [] }] });
    const id = useStore.getState().addTask({ ...taskDraft, assignedTo: staff.id });
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks[0]).toMatchObject({ assignedTo: staff.id, responsibleHodId: undefined, assignmentState: undefined });
  });

  it('lets the PM assign Staff directly when the department has no HOD', () => {
    useStore.setState({ users: [pm, staff, client], projects: [{ ...project, hodMemberIds: [] }] });
    const id = useStore.getState().addTask({ ...taskDraft, assignedTo: staff.id });
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks.find(task => task.id === id)).toMatchObject({
      assignedTo: staff.id,
      responsibleHodId: undefined,
      assignmentState: undefined,
    });
  });
});

describe('HOD delegation state', () => {
  it('moves the task to Staff while retaining the responsible HOD', () => {
    const id = useStore.getState().addTask({ ...taskDraft, assignedTo: hod.id });
    useStore.setState({ currentUser: hod });
    expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(true);
    expect(useStore.getState().tasks[0]).toMatchObject({
      assignedTo: staff.id,
      responsibleHodId: hod.id,
      assignmentState: 'assigned_staff',
    });
  });

  it('allows the scoped PM to assign directly without an override reason', () => {
    const id = useStore.getState().addTask(taskDraft);
    expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(true);
    expect(useStore.getState().tasks[0].assignmentOverride).toBeUndefined();
  });
});

it('lets the project HOD delegate to department Staff without project Staff membership', () => {
  const id = useStore.getState().addTask({ ...taskDraft, assignedTo: hod.id });
  expect(id).toBeTruthy();
  useStore.setState({ currentUser: hod, projects: [{ ...project, staffMemberIds: [] }] });
  expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(true);
  expect(useStore.getState().tasks.find(task => task.id === id)?.assignedTo).toBe(staff.id);
});

it('refuses ordinary Staff task creation even when their override requests it', () => {
  useStore.setState({ currentUser: { ...staff, permissions: { ...defaultRolePermissions.Staff, createTasks: true } } });
  expect(useStore.getState().addTask({ ...taskDraft, createdBy: staff.id, assignedTo: staff.id })).toBe('');
  expect(useStore.getState().tasks).toHaveLength(0);
});


it('lets an assigned HOD outside project and department accept and edit their task', () => {
  const outsideHod: User = { ...hod, id: 'outside-hod', departments: ['Video Editor'] };
  useStore.setState({ users: [pm, outsideHod, staff, client], projects: [{ ...project, hodMemberIds: [], staffMemberIds: [] }] });
  const id = useStore.getState().addTask({ ...taskDraft, assignedTo: outsideHod.id });
  expect(id).toBeTruthy();
  useStore.setState({ currentUser: outsideHod, projects: [] });
  expect(useStore.getState().updateTaskWork(id, { kind: 'accept' }).ok).toBe(true);
  expect(useStore.getState().updateTask(id, { notes: 'Working on the brief' }).ok).toBe(true);
  expect(useStore.getState().tasks[0].notes).toBe('Working on the brief');
  expect(useStore.getState().tasks[0].projectName).toBe(taskDraft.projectName);
});

it('lets an outside PM edit assigned work but keeps project moves and reassignment scoped', () => {
  const outsidePm: User = { ...pm, id: 'outside-pm' };
  const otherProject: Project = { ...project, id: 'outside-pm-project', projectManagerIds: [outsidePm.id] };
  useStore.setState({ users: [pm, outsidePm, hod, staff, client] });
  const id = useStore.getState().addTask({ ...taskDraft, assignedTo: outsidePm.id });
  useStore.setState({ currentUser: outsidePm, projects: [otherProject] });
  expect(useStore.getState().updateTask(id, { notes: 'Execution update' }).ok).toBe(true);
  expect(useStore.getState().updateTask(id, { projectId: otherProject.id }).ok).toBe(false);
  expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(false);
});

it('lets the responsible HOD reassign an owned task through the full edit path across departments', () => {
  const crossStaff: User = { ...staff, id: 'routing-cross-staff', name: 'Cross Staff', departments: ['Video Editor'], department: 'Video Editor' };
  useStore.setState({ users: [pm, hod, staff, crossStaff, client] });
  const id = useStore.getState().addTask({ ...taskDraft, assignedTo: hod.id });
  useStore.setState({ currentUser: hod });
  expect(useStore.getState().updateTask(id, { assignedTo: crossStaff.id }).ok).toBe(true);
  expect(useStore.getState().tasks.find(task => task.id === id)).toMatchObject({ assignedTo: crossStaff.id, responsibleHodId: hod.id, assignmentState: 'assigned_staff' });
  expect(useStore.getState().notifications.some(notice => notice.targetUserId === crossStaff.id && notice.route?.entityId === id && notice.title === 'Task Assigned To You')).toBe(true);
  expect(useStore.getState().updateTaskAssignee(id, staff.id).ok).toBe(true);
  expect(useStore.getState().tasks.find(task => task.id === id)).toMatchObject({ assignedTo: staff.id, responsibleHodId: hod.id, assignmentState: 'assigned_staff' });
});
