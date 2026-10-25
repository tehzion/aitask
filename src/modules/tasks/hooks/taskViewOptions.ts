import '../../../shared/i18n/actionFeedbackCopy';
import { type Priority } from '../../../shared/types/index';
export const CLIENT_BOARD_COLUMNS = [
  { value: 'active', label: 'In progress' },
  { value: 'awaiting_review', label: 'Awaiting your review' },
  { value: 'approved', label: 'Approved' },
] as const;

export const PRIORITY_OPTIONS: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];

export const PAGE_SIZE = 8;

export const normalizeClientName = (value: string) => value.trim().toLowerCase();

export const statusColors: Record<string, string> = {
  'Pending': 'bg-slate-100 text-slate-700 border border-slate-200',
  'In Progress': 'bg-blue-50 text-blue-700 border border-blue-100',
  'Waiting Approval': 'bg-amber-50 text-amber-800 border border-amber-100',
  'Completed': 'bg-emerald-50 text-emerald-800 border border-emerald-100',
  'Cancelled': 'bg-red-50 text-red-700 border border-red-100',
};

export const getStatusColor = (status: string): string => {
  return statusColors[status] || 'bg-slate-100 text-slate-700 border border-slate-200';
};

export const priorityColors: Record<Priority, string> = {
  'Low': 'bg-slate-100 text-slate-700',
  'Medium': 'bg-blue-50 text-blue-700',
  'High': 'bg-amber-50 text-amber-800',
  'Urgent': 'bg-red-50 text-red-700',
};

