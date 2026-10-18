import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { captureTaskFilters, parseTaskPreferences, restoreTaskFilters, taskPreferencesKey } from './personalTaskViews';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', title: 'Design brief', description: '', clientName: 'Acme', serviceType: 'Design', department: 'Designer', assignedTo: 'staff-1', createdBy: 'pm-1', startDate: '2026-10-01', dueDate: '2026-10-20', priority: 'Medium', status: 'Pending', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, recurrenceFrequency: 'None', ...overrides,
});

describe('personal task views', () => {
  it('captures only supported URL filters and excludes task detail/view state', () => {
    const params = new URLSearchParams('search=Acme&status=Pending&view=board&taskId=task-1&unexpected=secret');
    expect(captureTaskFilters(params)).toBe('search=Acme&status=Pending');
  });

  it('parses malformed storage safely and bounds duplicate views', () => {
    expect(parseTaskPreferences('{bad json')).toEqual({ version: 1, mode: 'table', views: [] });
    expect(parseTaskPreferences(JSON.stringify({ version: 1, mode: 'board', views: [
      { id: 'a', name: ' First ', filters: 'status=Pending' },
      { id: 'a', name: 'Duplicate', filters: '' },
      { id: '', name: 'No id', filters: '' },
    ] }))).toEqual({ version: 1, mode: 'board', views: [{ id: 'a', name: 'First', filters: 'status=Pending' }] });
  });

  it('removes obsolete filter choices while retaining valid filters', () => {
    const restored = restoreTaskFilters('client=Gone&status=Pending&priority=Medium&dueFrom=2026-10-01', [task()], ['Pending', 'Completed']);
    expect(restored.removed).toBe(true);
    expect(restored.params.toString()).toBe('status=Pending&priority=Medium&dueFrom=2026-10-01');
  });

  it('keys preferences by backend, workspace, authenticated identity, and member identity', () => {
    const user = { id: 'member', authUserId: 'auth', workspaceId: 'workspace', name: 'Member', role: 'Staff' as const, departments: ['Designer' as const] };
    expect(taskPreferencesKey(user, 'supabase')).not.toBe(taskPreferencesKey({ ...user, id: 'other' }, 'supabase'));
    expect(taskPreferencesKey(user, 'supabase')).not.toBe(taskPreferencesKey(user, 'local'));
  });
});
