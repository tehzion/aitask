import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CustomRole, Task, User } from '../types';
import { defaultRolePermissions } from '../lib/access';
import { shouldNotifyClientForTask, useStore } from './index';

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
  visibility: 'internal',
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

  it.each(['HOD', 'Staff'] as const)('notifies an assigning %s HOD contact and retains PM oversight', role => {
    const hod: User = { ...staff, id: 'contact-hod', role, customRoleId: role === 'Staff' ? 'builtin-hod' : undefined };
    const unrelated: User = { ...hod, id: 'unrelated-hod' };
    useStore.setState({ users: [boss, pmA, pmB, staff, hod, unrelated], tasks: [{ ...task, assignedBy: hod.id, createdBy: pmA.id, status: 'Waiting Approval' }] });
    expect(useStore.getState().addComment(task.id, 'Please share a review update.').ok).toBe(true);
    expect(useStore.getState().notifications.map(item => item.targetUserId).sort()).toEqual([boss.id, pmA.id, hod.id].sort());
  });

  it('notifies the HOD creator when there is no separate assigner contact', () => {
    const hod: User = { ...staff, id: 'contact-creator', role: 'HOD' };
    useStore.setState({ users: [boss, pmA, staff, hod], tasks: [{ ...task, assignedBy: staff.id, createdBy: hod.id }] });
    expect(useStore.getState().updateTaskWork(task.id, { kind: 'block', reason: 'Need assets' }).ok).toBe(true);
    expect(useStore.getState().notifications.map(item => item.targetUserId).sort()).toEqual([boss.id, pmA.id, hod.id].sort());
  });

  it('notifies a department-scoped Staff lead who delegated the work as the accountable contact', () => {
    const role: CustomRole = {
      id: 'dept-lead-role', name: 'Department lead', baseRole: 'Staff', departmentScoped: true,
      permissions: { ...defaultRolePermissions.Staff, manageCreatedTasks: true }, createdAt: '', updatedAt: '',
    };
    const lead: User = { ...staff, id: 'dept-lead', customRoleId: role.id };
    useStore.setState({
      users: [boss, pmA, staff, lead],
      rolePermissions: [role],
      tasks: [{ ...task, assignedBy: lead.id, createdBy: pmA.id, status: 'Waiting Approval' }],
    });
    expect(useStore.getState().addComment(task.id, 'Please share a review update.').ok).toBe(true);
    expect(useStore.getState().notifications.map(item => item.targetUserId).sort()).toEqual([boss.id, pmA.id, lead.id].sort());
  });

  it('does not notify a former HOD contact that can no longer view the task', () => {
    const hod: User = { ...staff, id: 'former-contact', role: 'HOD', department: 'Editor', departments: ['Editor'] };
    useStore.setState({ users: [boss, pmA, staff, hod], tasks: [{ ...task, assignedBy: hod.id, createdBy: pmA.id }] });
    expect(useStore.getState().addComment(task.id, 'Need a review update').ok).toBe(true);
    expect(useStore.getState().notifications.map(item => item.targetUserId).sort()).toEqual([boss.id, pmA.id].sort());
  });

  it('does not send a contact notice to a HOD with no login account', () => {
    const hod: User = { ...staff, id: 'unreachable-contact', role: 'HOD', hasLogin: false };
    useStore.setState({ users: [boss, pmA, staff, hod], tasks: [{ ...task, assignedBy: hod.id, createdBy: pmA.id }] });
    expect(useStore.getState().addComment(task.id, 'Need a review update').ok).toBe(true);
    expect(useStore.getState().notifications.map(item => item.targetUserId).sort()).toEqual([boss.id, pmA.id].sort());
  });

  it('suppresses client notices for internal or malformed tasks', () => {
    useStore.getState().updateTaskStatus(task.id, 'Completed');
    expect(useStore.getState().notifications.some(notification => notification.targetClient === 'Acme')).toBe(false);
    expect(shouldNotifyClientForTask(task, 'Completed')).toBe(false);
    expect(shouldNotifyClientForTask({ ...task, visibility: 'client-visible', clientName: '   ' }, 'Completed')).toBe(false);
  });

  it('creates client notices consistently for status and full-edit paths only when visible', () => {
    const hod: User = { ...staff, id: 'notify-hod', role: 'HOD' };
    useStore.setState({ currentUser: staff, users: [boss, pmA, pmB, staff, hod], tasks: [{ ...task, visibility: 'client-visible' }] });
    expect(useStore.getState().updateTaskStatus(task.id, 'Waiting Approval').ok).toBe(true);
    expect(useStore.getState().notifications.filter(notification => notification.targetClient === 'Acme')).toHaveLength(0);
    useStore.setState({ currentUser: hod });
    expect(useStore.getState().updateTaskStatus(task.id, 'Approved').ok).toBe(true);
    expect(useStore.getState().notifications.filter(notification => notification.targetClient === 'Acme')).toHaveLength(1);
    useStore.setState({ notifications: [], tasks: [{ ...task, status: 'Waiting Approval', visibility: 'client-visible' }] });
    expect(useStore.getState().updateTask(task.id, { status: 'Approved' })).toMatchObject({ ok: true });
    expect(useStore.getState().notifications.filter(notification => notification.targetClient === 'Acme')).toHaveLength(1);
  });
});
