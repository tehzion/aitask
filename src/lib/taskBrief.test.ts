import { describe, expect, it } from 'vitest';
import { parseTask } from './security';
import { useStore } from '../store';
import type { Task, User } from '../types';

const pm = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'], department: 'Management' } as unknown as User;
const staff = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'], department: 'Designer' } as unknown as User;
const baseTask = { id: 't1', title: 'Banner', clientName: 'Acme', serviceType: 'Design', priority: 'Medium', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', status: 'In Progress', isCompleted: false, visibility: 'internal', revisionCount: 0, clientApprovalStatus: 'Pending' } as unknown as Task;
const setup = (user: User) => useStore.setState({
  currentUser: user, users: [pm, staff], tasks: [baseTask], clients: [{ id: 'c', clientName: 'Acme', createdBy: 'pm' }] as never, projects: [], rolePermissions: [],
  backend: { ...useStore.getState().backend, mode: 'local', status: 'local', isSaving: false, isPulling: false, pendingMutations: 0, hasLocalChanges: false } as never,
});

describe('client brief', () => {
  it('lets a Project Manager write a brief with only valid https links', () => {
    setup(pm);
    expect(useStore.getState().updateTaskBrief('t1', { references: ['https://example.com/a', ''], mustHave: ' Logo top left ', avoid: '' }).ok).toBe(true);
    expect(useStore.getState().tasks[0].brief).toMatchObject({ references: ['https://example.com/a'], mustHave: 'Logo top left', updatedBy: 'pm' });
    expect(useStore.getState().updateTaskBrief('t1', { references: ['http://insecure.example'] }).ok).toBe(false);
    expect(useStore.getState().updateTaskBrief('t1', { references: ['javascript:alert(1)'] }).ok).toBe(false);
  });
  it('clears the brief when every field is empty', () => {
    setup(pm);
    useStore.getState().updateTaskBrief('t1', { references: [], mustHave: 'x' });
    useStore.getState().updateTaskBrief('t1', { references: [], mustHave: '  ', avoid: '' });
    expect(useStore.getState().tasks[0].brief).toBeUndefined();
  });
  it('tells the assignee, not the author, when the brief changes', () => {
    setup(pm);
    useStore.setState({ notifications: [] });
    expect(useStore.getState().updateTaskBrief('t1', { references: [], mustHave: 'Use brand blue' }).ok).toBe(true);
    const notices = useStore.getState().notifications.filter(notice => notice.title === 'Client Brief Updated');
    expect(notices.map(notice => notice.targetUserId)).toEqual(['staff']);
  });
  it('stays quiet for finished work', () => {
    setup(pm);
    useStore.setState({ notifications: [], tasks: [{ ...baseTask, status: 'Completed', isCompleted: true } as Task] });
    expect(useStore.getState().updateTaskBrief('t1', { references: [], mustHave: 'Late edit' }).ok).toBe(true);
    expect(useStore.getState().notifications).toEqual([]);
  });
  it('refuses Staff', () => {
    setup(staff);
    expect(useStore.getState().updateTaskBrief('t1', { references: [], mustHave: 'x' }).ok).toBe(false);
    expect(useStore.getState().tasks[0].brief).toBeUndefined();
  });
  it('sanitizes a stored brief', () => {
    const kept = parseTask({ ...baseTask, brief: { references: ['https://ok.example', 'ftp://bad', 'x'], mustHave: 'A', updatedBy: 'pm', updatedAt: '2026-11-19T01:00:00.000Z' } });
    expect(kept?.brief?.references).toEqual(['https://ok.example/']);
    expect(parseTask({ ...baseTask, brief: { references: [], updatedBy: 'pm', updatedAt: '2026-11-19T01:00:00.000Z' } })?.brief).toBeUndefined();
  });
});
