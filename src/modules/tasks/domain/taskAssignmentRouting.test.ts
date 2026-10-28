import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../../app/store/workspaceStore';
import { eligibleTaskHods, eligibleTaskStaff, resolveTaskAssignmentState } from '../../../shared/authorization/taskWorkflowAccess';
import type { Project, Task, User } from '../../../shared/types/index';

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
  it('keeps direct legacy assignments outside the PM-to-HOD route', () => {
    expect(resolveTaskAssignmentState(staff.id, undefined, staff)).toBeUndefined();
    expect(resolveTaskAssignmentState(staff.id, hod.id, staff)).toBe('assigned_staff');
  });

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

  it('blocks the explicit new-task route when no HOD is configured', () => {
    useStore.setState({ users: [pm, staff, client], projects: [{ ...project, hodMemberIds: [] }] });
    expect(useStore.getState().addTask({ ...taskDraft, assignmentState: 'pending_hod' })).toBe('');
  });

  it('creates a direct Staff assignment when this project has no HOD', () => {
    const fallbackProject = { ...project, hodMemberIds: [], staffMemberIds: [staff.id] };
    useStore.setState({ projects: [fallbackProject] });
    const id = useStore.getState().addTask({ ...taskDraft, assignedTo: staff.id });
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks[0]).toMatchObject({ assignedTo: staff.id });
    expect(useStore.getState().tasks[0].responsibleHodId).toBeUndefined();
    expect(useStore.getState().tasks[0].assignmentState).toBeUndefined();
  });

  it('keeps an unassigned no-HOD task accountable to its creating PM', () => {
    const fallbackProject = { ...project, hodMemberIds: [], staffMemberIds: [staff.id] };
    useStore.setState({ projects: [fallbackProject] });
    const id = useStore.getState().addTask({ ...taskDraft, assignedTo: '' });
    expect(id).toBeTruthy();
    expect(useStore.getState().tasks[0]).toMatchObject({
      assignedTo: '',
      createdBy: pm.id,
      assignedBy: pm.id,
      assignmentState: 'needs_hod',
    });
    expect(useStore.getState().tasks[0].responsibleHodId).toBeUndefined();
  });

  it('rejects a same-department Staff member who is not a member of this project', () => {
    const foreignStaff = { ...staff, id: 'routing-foreign-staff' };
    useStore.setState({ users: [pm, hod, staff, foreignStaff, client], projects: [{ ...project, hodMemberIds: [], staffMemberIds: [staff.id] }] });
    expect(useStore.getState().addTask({ ...taskDraft, assignedTo: foreignStaff.id })).toBe('');
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

  it('lets a PM use the direct fallback when only an unrelated project has a department HOD', () => {
    const fallbackProject = { ...project, hodMemberIds: [], staffMemberIds: [staff.id] };
    const task: Task = { ...taskDraft, id: 'fallback-task', assignedTo: '', projectId: fallbackProject.id, createdBy: pm.id };
    useStore.setState({ projects: [fallbackProject], tasks: [task] });
    expect(useStore.getState().updateTaskAssignee(task.id, staff.id)).toMatchObject({ ok: true });
    expect(useStore.getState().tasks[0]).toMatchObject({ assignedTo: staff.id });
  });

  it('keeps the full edit assignment path aligned with the quick assignment path', () => {
    const fallbackProject = { ...project, hodMemberIds: [], staffMemberIds: [staff.id] };
    const task: Task = { ...taskDraft, id: 'fallback-full-edit', assignedTo: '', projectId: fallbackProject.id, createdBy: pm.id };
    useStore.setState({ projects: [fallbackProject], tasks: [task] });
    expect(useStore.getState().updateTask(task.id, { assignedTo: staff.id })).toMatchObject({ ok: true });
    expect(useStore.getState().tasks[0]).toMatchObject({ assignedTo: staff.id });
  });

  it('rejects inactive and project-unassigned users before local assignment changes', () => {
    const inactive = { ...staff, id: 'routing-inactive-staff', hasLogin: false };
    const foreign = { ...staff, id: 'routing-foreign-staff' };
    const fallbackProject = { ...project, hodMemberIds: [], staffMemberIds: [staff.id] };
    const task: Task = { ...taskDraft, id: 'fallback-task', assignedTo: '', projectId: fallbackProject.id, createdBy: pm.id };
    useStore.setState({ users: [pm, hod, staff, inactive, foreign, client], projects: [fallbackProject], tasks: [task] });
    expect(useStore.getState().updateTaskAssignee(task.id, inactive.id).ok).toBe(false);
    expect(useStore.getState().updateTaskAssignee(task.id, foreign.id).ok).toBe(false);
    expect(useStore.getState().tasks[0].assignedTo).toBe('');
  });
});
