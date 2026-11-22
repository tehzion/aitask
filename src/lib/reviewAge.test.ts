import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { compareByReviewAge, getReviewWaitDays } from './reviewAge';

const task = (status: string, reviewRequestedAt?: string) => ({ status, workState: reviewRequestedAt ? { reviewRequestedAt } : {} }) as unknown as Task;
const now = new Date('2026-11-23T12:00:00Z');

describe('review age', () => {
  it('counts whole days only for submitted work', () => {
    expect(getReviewWaitDays(task('Waiting Approval', '2026-11-20T09:00:00Z'), now)).toBe(3);
    expect(getReviewWaitDays(task('Waiting Approval', '2026-11-23T09:00:00Z'), now)).toBe(0);
    expect(getReviewWaitDays(task('In Progress', '2026-11-20T09:00:00Z'), now)).toBeUndefined();
    expect(getReviewWaitDays(task('Waiting Approval'), now)).toBeUndefined();
  });

  it('sorts the oldest submission first and undated last', () => {
    const list = [task('Waiting Approval'), task('Waiting Approval', '2026-11-22T00:00:00Z'), task('Waiting Approval', '2026-11-19T00:00:00Z')];
    const sorted = [...list].sort(compareByReviewAge);
    expect(sorted.map(item => item.workState?.reviewRequestedAt)).toEqual(['2026-11-19T00:00:00Z', '2026-11-22T00:00:00Z', undefined]);
  });
});
