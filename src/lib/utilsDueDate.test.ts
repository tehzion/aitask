import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRelativeDueDateString } from './utils';

describe('relative due labels and completed tasks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 14));
  });
  afterEach(() => vi.useRealTimers());

  it('recognizes the completed status even when a historical flag is false', () => {
    expect(getRelativeDueDateString('2026-10-06', false, 'Completed')).toBe('1 day ago');
    expect(getRelativeDueDateString('2026-10-06', false, 'Completed', 'zh')).toBe('1 天前');
  });

  it('keeps closed and open past deadlines distinct', () => {
    expect(getRelativeDueDateString('2026-10-06', true, 'In Progress')).toBe('1 day ago');
    expect(getRelativeDueDateString('2026-10-06', false, 'Cancelled')).toBe('1 day ago');
    expect(getRelativeDueDateString('2026-10-06', false, 'In Progress')).toBe('1 day overdue');
  });

  it('preserves today, future and missing-date labels', () => {
    expect(getRelativeDueDateString('2026-10-07', false, 'In Progress')).toBe('Due today');
    expect(getRelativeDueDateString('2026-10-08', false, 'In Progress')).toBe('Due in 1 day');
    expect(getRelativeDueDateString('invalid', false, 'In Progress')).toBe('No due date');
  });
});
