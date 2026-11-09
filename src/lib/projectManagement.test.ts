import { describe, expect, it } from 'vitest';
import type { Project, Task } from '../types';
import { assessProjectHealth } from './pmDashboard';
import {
  effectiveMilestoneStatus,
  getEffectiveTaskApprovalMode,
  getProjectClosureWarnings,
  milestoneTaskProgress,
  projectDeletionBlocker,
} from './projectManagement';

const project: Project = {
  id: 'project-a', clientName: 'Client', projectName: 'Launch', services: ['Design'],
  startDate: '2026-10-01', deadline: '2026-11-30', defaultApprovalMode: 'pm',
  milestones: [{ id: 'milestone-a', name: 'Build', targetDate: '2026-10-15', status: 'Not Started', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }],
};
const task = (id: string, status: Task['status']): Task => ({
  id, title: id, clientName: 'Client', projectId: project.id, milestoneId: 'milestone-a',
  status, visibility: 'internal', clientApprovalStatus: 'Pending',
} as Task);

describe('project approval defaults', () => {
  it('uses the project default only for explicit inheritance', () => {
    expect(getEffectiveTaskApprovalMode({ projectId: project.id, approvalMode: 'inherit' }, [project])).toBe('pm');
    expect(getEffectiveTaskApprovalMode({ projectId: project.id, approvalMode: 'none' }, [project])).toBe('none');
    expect(getEffectiveTaskApprovalMode({ projectId: project.id, approvalMode: 'hod' }, [project])).toBe('hod');
  });

  it('preserves legacy task approval flags', () => {
    expect(getEffectiveTaskApprovalMode({ projectId: project.id, requiresInternalApproval: true }, [project])).toBe('hod');
    expect(getEffectiveTaskApprovalMode({ projectId: project.id, requiresInternalApproval: false }, [project])).toBe('none');
  });
});

describe('milestones and closure', () => {
  it('derives progress and completion from related tasks', () => {
    const tasks = [task('done', 'Completed'), task('open', 'In Progress')];
    expect(milestoneTaskProgress('milestone-a', tasks)).toEqual({ taskCount: 2, completedCount: 1, percent: 50 });
    expect(effectiveMilestoneStatus(project.milestones![0], tasks)).toBe('Delayed');
    expect(effectiveMilestoneStatus(project.milestones![0], [task('done', 'Completed')])).toBe('Completed');
  });

  it('includes tasks, approvals, overdue work, and milestones in closure warnings', () => {
    const warnings = getProjectClosureWarnings(project, [
      { ...task('review', 'Waiting Approval'), dueDate: '2026-10-01' },
      task('done', 'Completed'),
    ], new Date(2026, 9, 20, 12));
    expect(warnings).toEqual({ outstandingTasks: 1, pendingApprovals: 1, overdueTasks: 1, incompleteMilestones: 1 });
  });

  it('marks an overdue milestone project at risk without inventing task progress', () => {
    const health = assessProjectHealth(project, [], new Date(2026, 9, 20, 12));
    expect(health.health).toBe('atRisk');
    expect(health.milestoneCount).toBe(1);
    expect(health.progressPercent).toBeUndefined();
  });
});

describe('project deletion blocker', () => {
  const linked = [{ projectId: project.id, assignedTo: 'staff-a' }];
  const pm = { id: 'pm-a', role: 'Project Manager' as const };
  const staff = { id: 'staff-a', role: 'Staff' as const };

  it('allows any role to delete a project without tasks', () => {
    expect(projectDeletionBlocker(staff, project, [], true)).toBeUndefined();
    expect(projectDeletionBlocker(staff, { ...project, status: 'Closed' } as Project, [])).toBeUndefined();
  });

  it('asks to reopen a closed project that still has tasks', () => {
    expect(projectDeletionBlocker(pm, { ...project, status: 'Closed' } as Project, linked)).toMatch(/^Reopen this project/);
  });

  it('blocks an HOD but not a Project Manager or Boss Koo', () => {
    expect(projectDeletionBlocker(pm, project, linked)).toBeUndefined();
    expect(projectDeletionBlocker({ id: 'boss', role: 'Staff', isSuperAdmin: true }, project, linked)).toBeUndefined();
    expect(projectDeletionBlocker({ id: 'staff-a', role: 'Staff' }, project, linked, true)).toMatch(/^Only a Project Manager or Boss Koo can delete a project that still has tasks/);
  });

  it('lets Staff delete only when every linked task is theirs', () => {
    expect(projectDeletionBlocker(staff, project, linked)).toBeUndefined();
    expect(projectDeletionBlocker(staff, project, [...linked, { projectId: project.id, assignedTo: 'staff-b' }])).toMatch(/assigned to other staff/);
  });
});
