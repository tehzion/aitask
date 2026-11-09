import { describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { getStaffingGaps } from './staffingGaps';

const user = (id: string, role: User['role'], departments: User['departments']) => ({ id, name: id, role, departments } as User);
const project = (id: string, extra: Partial<Project> = {}) => ({ id, projectName: id, hodMemberIds: ['mabel'], staffMemberIds: ['ed'], status: 'Active', ...extra } as Project);
const task = (id: string, extra: Partial<Task> = {}) => ({ id, status: 'Pending', isCompleted: false, ...extra } as Task);

describe('staffing gaps', () => {
  const users = [user('mabel', 'HOD', ['Video Shooting', 'Video Editor']), user('ed', 'Staff', ['Video Editor']), user('dee', 'Staff', ['Designer'])];

  it('names departments with an HOD or open work but no Staff', () => {
    const gaps = getStaffingGaps(users, [], [task('t1', { department: 'Video Shooting' }), task('t2', { department: 'Ads Management' }), task('t3', { department: 'Video Shooting', isCompleted: true, status: 'Completed' })]);
    expect(gaps.departmentsWithoutStaff).toEqual([
      { department: 'Video Shooting', hodNames: ['mabel'], openTasks: 1 },
      { department: 'Ads Management', hodNames: [], openTasks: 1 },
    ]);
  });

  it('lists active projects with open work but no Staff, and projects with no HOD', () => {
    const projects = [
      project('busy-no-staff', { staffMemberIds: [] }),
      project('idle-no-staff', { staffMemberIds: [] }),
      project('no-hod', { hodMemberIds: [] }),
      project('closed-no-hod', { hodMemberIds: [], status: 'Closed' }),
      project('fine'),
    ];
    const tasks = [task('a', { projectId: 'busy-no-staff' }), task('b', { projectId: 'busy-no-staff' }), task('c', { projectId: 'no-hod' })];
    const gaps = getStaffingGaps(users, projects, tasks);
    expect(gaps.projectsWithoutStaff.map(item => [item.project.id, item.openTasks])).toEqual([['busy-no-staff', 2]]);
    expect(gaps.projectsWithoutHod.map(item => item.project.id)).toEqual(['no-hod']);
  });
});
