import type { Task, User } from '../types';

/** Operational milestones; a submitted task is not a completed task. */
export const getTaskProgress = (task: Task, users: readonly Pick<User, 'id' | 'role' | 'customRoleId'>[] = [], clientView = false): number => {
  if (task.status === 'Cancelled') return 0;
  if (task.status === 'Approved') return 80;
  if (task.status === 'Completed' || task.isCompleted) return clientView && task.clientApprovalStatus !== 'Approved' ? 60 : 100;
  if (task.status === 'Waiting Approval') return 60;
  if (task.clientApprovalStatus === 'Rejected' || task.status === 'Revision') return 50;
  if (task.status === 'In Progress' || (task.assignedTo && task.workState?.acceptedBy === task.assignedTo)) return 30;
  if (!task.assignedTo?.trim()) return clientView && [10, 20, 30].includes(task.completionPercentage) ? task.completionPercentage : 0;
  const assignee = users.find(user => user.id === task.assignedTo);
  if (assignee) return assignee.role === 'HOD' || assignee.customRoleId === 'builtin-hod' || assignee.role === 'Project Manager' ? 10 : 20;
  // Client projections omit the staff directory. Prefer the server's milestone.
  return task.completionPercentage === 10 ? 10 : 20;
};

export const averageTaskProgress = (tasks: readonly Task[], users: readonly Pick<User, 'id' | 'role' | 'customRoleId'>[], clientView = false) => {
  const active = tasks.filter(task => task.status !== 'Cancelled');
  if (!active.length) return 0;
  const values = active.map(task => getTaskProgress(task, users, clientView));
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return values.every(value => value === 100) ? 100 : Math.min(99, average);
};
