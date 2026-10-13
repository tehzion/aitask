import { describe, expect, it } from 'vitest';
import type { Task, User } from '../types';
import { averageTaskProgress, getTaskProgress } from './taskProgress';

const staff = { id: 'staff', role: 'Staff' } as User;
const hod = { id: 'hod', role: 'HOD' } as User;
const users = [staff, hod];
const task = (patch: Partial<Task> = {}) => ({ id: 'task', status: 'Pending', assignedTo: staff.id, completionPercentage: 0, isCompleted: false, clientApprovalStatus: 'Pending', ...patch }) as Task;

describe('task progress milestones', () => {
  it('follows the requested assignment, acceptance, review, approval and completion percentages', () => {
    expect(getTaskProgress(task({ assignedTo: '' }), users)).toBe(0);
    expect(getTaskProgress(task({ assignedTo: hod.id }), users)).toBe(10);
    expect(getTaskProgress(task(), users)).toBe(20);
    expect(getTaskProgress(task({ workState: { acceptedBy: staff.id } }), users)).toBe(30);
    expect(getTaskProgress(task({ status: 'In Progress' }), users)).toBe(30);
    expect(getTaskProgress(task({ status: 'Waiting Approval', completionPercentage: 100 }), users)).toBe(60);
    expect(getTaskProgress(task({ status: 'In Progress', clientApprovalStatus: 'Rejected' }), users)).toBe(50);
    expect(getTaskProgress(task({ status: 'Approved' }), users)).toBe(80);
    expect(getTaskProgress(task({ status: 'Completed', isCompleted: true }), users)).toBe(100);
  });
  it('clears revision progress when work is resubmitted and ignores historic revision counts', () => {
    expect(getTaskProgress(task({ status: 'Waiting Approval', revisionCount: 3 }), users)).toBe(60);
    expect(getTaskProgress(task({ status: 'Pending', revisionCount: 3 }), users)).toBe(20);
  });
  it('requires client confirmation for completed client-facing work', () => {
    expect(getTaskProgress(task({ status: 'Completed', isCompleted: true }), [], true)).toBe(60);
    expect(getTaskProgress(task({ status: 'Completed', clientApprovalStatus: 'Approved' }), [], true)).toBe(100);
    expect(getTaskProgress(task({ clientApprovalStatus: 'Approved' }), [], true)).toBe(20);
    expect(getTaskProgress(task({ assignedTo: '', completionPercentage: 10 }), [], true)).toBe(10);
    expect(getTaskProgress(task({ assignedTo: '', completionPercentage: 30 }), [], true)).toBe(30);
  });
  it('averages milestones, excludes cancellation, and never rounds unfinished work to 100%', () => {
    expect(averageTaskProgress([task({ id: 'done', status: 'Completed' }), task()], users)).toBe(60);
    expect(averageTaskProgress([task({ status: 'Completed' }), task({ status: 'Cancelled' })], users)).toBe(100);
    expect(averageTaskProgress([...Array.from({ length: 100 }, (_, i) => task({ id: String(i), status: 'Completed' })), task({ status: 'Approved' })], users)).toBe(99);
  });
});
