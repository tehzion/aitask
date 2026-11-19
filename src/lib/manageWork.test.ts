import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { buildManageWork, defaultManageTab, filterManageTasks, summarizeManageClients } from './manageWork';

const pm = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'], department: 'Management' } as unknown as User;
const staff = { id: 'staff', name: 'Gan Khuan', role: 'Staff', departments: ['Designer'], department: 'Designer' } as unknown as User;
const users = [pm, staff];
const now = new Date('2026-11-19T12:00:00');
const task = (id: string, values: Partial<Task>): Task => ({
  id, title: id, clientName: 'Acme', status: 'In Progress', isCompleted: false, revisionCount: 0, visibility: 'internal',
  department: 'Designer', assignedTo: 'staff', createdBy: 'pm', dueDate: '2026-12-01', clientApprovalStatus: 'Pending', ...values,
}) as unknown as Task;

describe('manage work', () => {
  it('lists work another reviewer decides first under With reviewer, never under my decisions', () => {
    const hod = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' } as unknown as User;
    const submitted = task('submitted', { status: 'Waiting Approval', approvalMode: 'hod', responsibleHodId: 'hod' } as Partial<Task>);
    const { byTab, counts } = buildManageWork([submitted], { user: pm, users: [pm, hod, staff], now });
    expect(counts.review).toBe(0);
    expect(byTab.waiting.map(item => item.id)).toEqual(['submitted']);
    expect(byTab.active.map(item => item.id)).toEqual(['submitted']);
  });
  it('splits work into the tabs it needs next, as lenses over the same tasks', () => {
    const tasks = [
      task('open', {}),
      task('revising', { status: 'Revision', revisionCount: 1 }),
      task('with-client', { status: 'Completed', isCompleted: true, visibility: 'client-visible', completedAt: '2026-11-10T00:00:00Z' }),
      task('accepted', { status: 'Completed', isCompleted: true, clientApprovalStatus: 'Approved', visibility: 'client-visible', completedAt: '2026-11-11T00:00:00Z' }),
      task('cancelled', { status: 'Cancelled' }),
    ];
    const { counts, byTab } = buildManageWork(tasks, { user: pm, users, now });
    expect(counts).toMatchObject({ active: 2, revision: 1, client: 1, completed: 2, cancelled: 1 });
    expect(byTab.revision.map(item => item.id)).toEqual(['revising']);
    expect(byTab.active.map(item => item.id).sort()).toEqual(['open', 'revising']);
    expect(byTab.client.map(item => item.id)).toEqual(['with-client']);
  });
  it('orders active work overdue first, then by due date, undated last', () => {
    const { byTab } = buildManageWork([
      task('later', { dueDate: '2026-12-20' }),
      task('undated', { dueDate: '' }),
      task('soon', { dueDate: '2026-11-25' }),
      task('late', { dueDate: '2026-11-10' }),
    ], { user: pm, users, now });
    expect(byTab.active.map(item => item.id)).toEqual(['late', 'soon', 'later', 'undated']);
  });
  it('lists finished work newest first', () => {
    const { byTab } = buildManageWork([
      task('old', { status: 'Completed', isCompleted: true, completedAt: '2026-10-01T00:00:00Z' }),
      task('new', { status: 'Completed', isCompleted: true, completedAt: '2026-11-15T00:00:00Z' }),
    ], { user: pm, users, now });
    expect(byTab.completed.map(item => item.id)).toEqual(['new', 'old']);
  });
  it('starts on review when something needs a decision, otherwise on active', () => {
    const base = { active: 3, review: 0, waiting: 0, revision: 0, client: 0, completed: 0, cancelled: 0 };
    expect(defaultManageTab(base)).toBe('active');
    expect(defaultManageTab({ ...base, review: 2 })).toBe('review');
  });
  it('searches title, company, project and assignee name', () => {
    const tasks = [task('Launch banner', { clientName: 'Jean Yip' }), task('Reel', { clientName: 'Acme', projectName: 'Summer push' })];
    expect(filterManageTasks(tasks, 'jean', users).map(item => item.id)).toEqual(['Launch banner']);
    expect(filterManageTasks(tasks, 'summer', users).map(item => item.id)).toEqual(['Reel']);
    expect(filterManageTasks(tasks, 'gan', users)).toHaveLength(2);
    expect(filterManageTasks(tasks, '  ', users)).toHaveLength(2);
    expect(filterManageTasks(tasks, 'nobody', users)).toEqual([]);
  });
  it('summarizes companies, putting those waiting on a client first', () => {
    const rows = summarizeManageClients([
      task('a1', { clientName: 'Acme' }), task('a2', { clientName: 'Acme' }),
      task('j1', { clientName: 'Jean Yip', status: 'Completed', isCompleted: true, visibility: 'client-visible', clientRating: { stars: 5, ratedBy: 'pm', ratedAt: '2026-11-01T00:00:00Z' } }),
    ]);
    expect(rows.map(row => row.clientName)).toEqual(['Jean Yip', 'Acme']);
    expect(rows[0]).toMatchObject({ waitingOnClient: 1, ratingAverage: 5, ratingCount: 1 });
    expect(rows[1]).toMatchObject({ open: 2, waitingOnClient: 0 });
  });
});
