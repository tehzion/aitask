import type { Department, Project, Task, User } from '../types';
import { STAFF_DEPARTMENTS } from './departments';
import { projectHasNoHod } from './taskWorkflowAccess';

export interface DepartmentGap { department: Department; hodNames: string[]; openTasks: number }
export interface ProjectGap { project: Project; openTasks: number }
export interface StaffingGaps {
  departmentsWithoutStaff: DepartmentGap[];
  projectsWithoutStaff: ProjectGap[];
  projectsWithoutHod: ProjectGap[];
}

const memberDepartments = (user: Pick<User, 'departments' | 'department'>) => (
  user.departments?.length ? user.departments : user.department ? [user.department] : []
);
const isActiveProject = (project: Project) => !project.status || project.status === 'Active';
const isOpen = (task: Task) => !task.isCompleted && task.status !== 'Completed';

/**
 * Where work cannot reach a Staff member (team feedback item 7): departments
 * that have an HOD or open work but no Staff, active projects with no Staff
 * members, and active projects with no HOD (the PM assigns directly there).
 */
export const getStaffingGaps = (users: readonly User[], projects: readonly Project[], tasks: readonly Task[]): StaffingGaps => {
  const openTasks = tasks.filter(isOpen);
  const departmentsWithoutStaff = STAFF_DEPARTMENTS.flatMap(department => {
    const members = users.filter(user => memberDepartments(user).includes(department));
    if (members.some(user => user.role === 'Staff')) return [];
    const hodNames = members.filter(user => user.role === 'HOD').map(user => user.name).sort();
    const open = openTasks.filter(task => task.department === department).length;
    return hodNames.length || open ? [{ department, hodNames, openTasks: open }] : [];
  });
  const openByProject = new Map<string, number>();
  for (const task of openTasks) if (task.projectId) openByProject.set(task.projectId, (openByProject.get(task.projectId) || 0) + 1);
  const active = projects.filter(isActiveProject)
    .map(project => ({ project, openTasks: openByProject.get(project.id) || 0 }))
    .sort((left, right) => right.openTasks - left.openTasks || left.project.projectName.localeCompare(right.project.projectName));
  return {
    departmentsWithoutStaff,
    projectsWithoutStaff: active.filter(item => !(item.project.staffMemberIds?.length) && item.openTasks > 0),
    projectsWithoutHod: active.filter(item => projectHasNoHod(item.project)),
  };
};
