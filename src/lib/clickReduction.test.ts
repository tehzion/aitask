import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { rankLinkCandidates, scoreLinkCandidate } from './deliveryLinks';
import { defaultDueDateForMonth, readCreateTaskChoice, rememberCreateTaskChoice } from './createTaskDefaults';

const task = (id: string, extra: Partial<Task> = {}) => ({ id, title: id, serviceType: '', dueDate: '', ...extra } as Task);
const november = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };

describe('click reduction: suggested task links', () => {
  it('scores due-in-month and shared words, ignoring filler words and numbers', () => {
    expect(scoreLinkCandidate(task('a', { dueDate: '2026-11-12' }), { title: 'Social Posts 1' }, november)).toBe(3);
    expect(scoreLinkCandidate(task('b', { title: 'Instagram reel for launch', dueDate: '2026-12-20' }), { title: 'Instagram Reel 2' }, november)).toBe(4);
    expect(scoreLinkCandidate(task('c', { title: 'Post 1 for the month' }), { title: 'Social Posts 1' }, november)).toBe(0);
    expect(scoreLinkCandidate(task('d', { dueDate: '2026-12-05' }), { title: 'X' }, november)).toBe(1);
  });

  it('suggests one task only when it clearly leads', () => {
    const reel = task('reel', { title: 'Launch reel edit', dueDate: '2026-11-20' });
    const other = task('other', { title: 'Logo refresh', dueDate: '2026-10-01' });
    const ranked = rankLinkCandidates([other, reel], { title: 'Launch Reel' }, november);
    expect(ranked.suggestion?.id).toBe('reel');
    expect(ranked.ordered.map(item => item.id)).toEqual(['reel', 'other']);
  });

  it('makes no suggestion on a tie or without evidence', () => {
    const one = task('one', { dueDate: '2026-11-03' });
    const two = task('two', { dueDate: '2026-11-04' });
    expect(rankLinkCandidates([one, two], { title: 'Social Posts 1' }, november).suggestion).toBeUndefined();
    expect(rankLinkCandidates([task('none')], { title: 'Social Posts 1' }, november).suggestion).toBeUndefined();
  });
});

describe('click reduction: Create task defaults', () => {
  let items: Record<string, string> = {};
  beforeEach(() => {
    items = {};
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => items[key] ?? null, setItem: (key: string, value: string) => { items[key] = value; } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('works when browser storage is blocked', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } });
    expect(() => rememberCreateTaskChoice('pm-1', { department: 'Designer', assignedTo: '', projectId: '' })).not.toThrow();
    expect(readCreateTaskChoice('pm-1')).toBeNull();
  });

  it('remembers the last choice per person', () => {
    rememberCreateTaskChoice('pm-1', { department: 'Designer', assignedTo: 'staff-1', projectId: 'p1' });
    expect(readCreateTaskChoice('pm-1')).toEqual({ department: 'Designer', assignedTo: 'staff-1', projectId: 'p1' });
    expect(readCreateTaskChoice('pm-2')).toBeNull();
    expect(readCreateTaskChoice(undefined)).toBeNull();
  });

  it('ignores damaged stored values', () => {
    items['aitask:create-task-last:pm-1'] = '{not json';
    expect(readCreateTaskChoice('pm-1')).toBeNull();
    items['aitask:create-task-last:pm-1'] = JSON.stringify({ department: 7 });
    expect(readCreateTaskChoice('pm-1')).toEqual({ department: '', assignedTo: '', projectId: '' });
  });

  it('defaults the due date to month end, never to a past date', () => {
    expect(defaultDueDateForMonth('2026-11-30', '2026-11-10')).toBe('2026-11-30');
    expect(defaultDueDateForMonth('2026-10-31', '2026-11-10')).toBe('');
    expect(defaultDueDateForMonth(undefined, '2026-11-10')).toBe('');
  });
});
