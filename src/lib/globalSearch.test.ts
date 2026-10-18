import { describe, expect, it } from 'vitest';
import { searchWorkspace, type SearchSnapshot } from './globalSearch';
import { allPermissions } from './access';
import type { Task, User } from '../types';

const user: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'], workspaceId: 'one' };
const task: Task = { id: 'task', workspaceId: 'one', title: 'Needle task', clientName: 'Needle company', serviceType: 'Design', description: '', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', startDate: '2026-01-01', dueDate: '', priority: 'Medium', status: 'Pending', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', visibility: 'internal' };
const snapshot: SearchSnapshot = { currentUser: user, tasks: [task], projects: [], clients: [], clientPlans: [], rolePermissions: [] };

describe('permission-aware workspace search', () => {
  it('finds authorized tasks but not other PM or workspace records', () => {
    const results = searchWorkspace({ ...snapshot, tasks: [task, { ...task, id: 'private', createdBy: 'other' }, { ...task, id: 'foreign', workspaceId: 'two' }] }, 'needle');
    expect(results.filter(row => row.type === 'Tasks').map(row => row.id)).toEqual(['task']);
  });
  it('excludes internal tasks and other companies for clients', () => {
    const client: User = { ...user, id: 'client', role: 'Client', companyName: 'Needle company' };
    expect(searchWorkspace({ ...snapshot, currentUser: client }, 'needle').some(row => row.id === 'task')).toBe(false);
    expect(searchWorkspace({ ...snapshot, currentUser: client, tasks: [{ ...task, visibility: 'client-visible', clientName: 'Another company' }] }, 'needle').some(row => row.id === 'task')).toBe(false);
  });
  it('returns no records for anonymous users, empty input, or denied custom routes', () => {
    expect(searchWorkspace({ ...snapshot, currentUser: null }, 'needle')).toEqual([]);
    expect(searchWorkspace(snapshot, ' ')).toEqual([]);
    const permissions = Object.fromEntries(Object.keys(allPermissions).map(key => [key, false])) as typeof allPermissions;
    expect(searchWorkspace({ ...snapshot, currentUser: { ...user, role: 'Staff', customRoleId: 'denied' }, rolePermissions: [{ id: 'denied', name: 'Denied', baseRole: 'Staff', permissions, createdAt: '', updatedAt: '' }] }, 'needle')).toEqual([]);
  });
  it('bounds result groups and matches Chinese labels', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => ({ ...task, id: String(i), title: '设计任务' }));
    expect(searchWorkspace({ ...snapshot, tasks }, '设计').filter(row => row.type === 'Tasks')).toHaveLength(5);
  });
});
