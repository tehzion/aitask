import {
  DEPARTMENTS
} from '../../../shared/authorization/departments';
import {
  type Department,
  type Priority
} from '../../../shared/types/index';
export const HOD_RESTRICTED_TASK_FIELDS = [
  'projectId', 'projectName', 'clientId', 'clientName', 'serviceType',
  'serviceCycleId', 'deliverableId', 'milestoneId', 'department', 'visibility',
  'customerDetails', 'facebookPage', 'website', 'isRecurring',
  'recurrenceFrequency', 'assignedBy', 'assignedAt', 'responsibleHodId',
  'assignmentState', 'assignmentOverride',
] as const;

export const allowedDepartments = new Set<Department>(DEPARTMENTS);

export const allowedPriorities = new Set<Priority>(['Low', 'Medium', 'High', 'Urgent']);

export const resolveTaskStatus = (status: string, statuses: string[]) => {
  const trimmed = status.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === 'approved') return 'Approved';
  if (trimmed.toLowerCase() === 'completed') return 'Completed';
  return [...statuses, 'Approved'].find(item => item.toLowerCase() === trimmed.toLowerCase()) || '';
};
