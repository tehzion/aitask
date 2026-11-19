import { describe, expect, it } from 'vitest';
import { buildAttentionDigest, digestDayKey, digestHiddenKey } from './attentionDigest';
import type { ManageWork } from './manageWork';
import type { Task } from '../types';

const now = new Date(2026, 10, 19, 10, 0, 0);
const task = (id: string, values: Partial<Task>) => ({ id, title: id, status: 'In Progress', isCompleted: false, dueDate: '2026-12-30', updatedAt: '2026-11-19T08:00:00', ...values }) as Task;
const work = (active: Task[], review: Task[], client = 0): ManageWork => ({
  byTab: { active, review, waiting: [], revision: [], client: [], completed: [], cancelled: [] },
  counts: { active: active.length, review: review.length, waiting: 0, revision: 0, client, completed: 0, cancelled: 0 },
});

describe('buildAttentionDigest', () => {
  it('counts overdue, at-risk and review work, and each task once in the total', () => {
    const late = task('late', { dueDate: '2026-11-10' });
    const risky = task('risky', { status: 'Pending', dueDate: '2026-11-20' });
    const fine = task('fine', {});
    const review = task('review', { status: 'Waiting Approval' });
    const digest = buildAttentionDigest(work([late, risky, fine, review], [review], 2), now);
    expect(digest.overdue.map(item => item.id)).toEqual(['late']);
    expect(digest.atRisk.map(item => item.id)).toEqual(['risky']);
    expect(digest.review.map(item => item.id)).toEqual(['review']);
    expect(digest.withClient).toBe(2);
    expect(digest.total).toBe(3);
  });

  it('does not double count a task that is both overdue and waiting for review', () => {
    const both = task('both', { status: 'Waiting Approval', dueDate: '2026-11-10' });
    expect(buildAttentionDigest(work([both], [both]), now).total).toBe(1);
  });

  it('shows the most urgent first: overdue, then review, then at risk, capped', () => {
    const items = [
      task('r1', { status: 'Pending', dueDate: '2026-11-20' }),
      task('l1', { dueDate: '2026-11-10' }),
      task('l2', { dueDate: '2026-11-11' }),
      task('v1', { status: 'Waiting Approval' }),
    ];
    const digest = buildAttentionDigest(work(items, [items[3]]), now, 3);
    expect(digest.top.map(item => item.id)).toEqual(['l1', 'l2', 'v1']);
  });

  it('is empty when nothing needs attention', () => {
    expect(buildAttentionDigest(work([task('ok', {})], []), now)).toMatchObject({ total: 0, top: [] });
  });

  it('keys the hidden flag by person and local day', () => {
    expect(digestDayKey(now)).toBe('2026-11-19');
    expect(digestHiddenKey('u1', now)).toBe('aitask:digest-hidden:u1:2026-11-19');
  });
});
