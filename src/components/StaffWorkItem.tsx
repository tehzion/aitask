import React from 'react';
import { AlertTriangle, ArrowRight, Paperclip, RotateCcw } from 'lucide-react';
import type { Task } from '../types';
import { getRelativeDueDateString } from '../lib/utils';
import { ProgressBar, StatusChip } from './ui';

const statusTone = (task: Task) => {
  if (task.isCompleted || task.status === 'Completed') return 'emerald' as const;
  if (task.status === 'Waiting Approval') return 'amber' as const;
  if (task.status === 'Cancelled') return 'red' as const;
  if (task.status === 'In Progress') return 'blue' as const;
  return 'slate' as const;
};

interface StaffWorkItemProps {
  task: Task;
  allTasks: Task[];
  onOpen: (task: Task) => void;
  emphasized?: boolean;
}

const StaffWorkItem: React.FC<StaffWorkItemProps> = ({ task, allTasks, onOpen, emphasized = false }) => {
  const incompletePredecessors = (task.predecessorTaskIds || []).filter(id => (
    allTasks.some(item => item.id === id && !item.isCompleted && item.status !== 'Completed')
  ));
  const isRevision = task.revisionCount > 0 && !task.isCompleted;

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={`group flex min-h-24 w-full items-start gap-3 text-left transition-[transform,background-color] duration-160 active:scale-[0.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${emphasized ? 'rounded-panel bg-surface p-4 shadow-calm sm:p-5' : 'px-4 py-4 hover:bg-inset/65 sm:px-5'}`}
    >
      <span className={`mt-1 h-10 w-1 shrink-0 rounded-full ${isRevision ? 'bg-amber-500' : task.priority === 'Urgent' ? 'bg-red-500' : task.status === 'In Progress' ? 'bg-accent' : 'bg-line'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span data-i18n-skip className="min-w-0 flex-1 truncate font-semibold text-ink">{task.title}</span>
          <StatusChip tone={statusTone(task)}>{task.status}</StatusChip>
        </span>
        <span data-i18n-skip className="mt-1 block truncate text-sm text-muted">{task.clientName}{task.projectName ? ` · ${task.projectName}` : ''}</span>
        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
          <span>{getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}</span>
          {isRevision && <span className="inline-flex items-center gap-1 text-amber-700"><RotateCcw className="h-3.5 w-3.5" />Revision {task.revisionCount}</span>}
          {incompletePredecessors.length > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{incompletePredecessors.length} blocker{incompletePredecessors.length === 1 ? '' : 's'}</span>}
          {task.attachmentLink && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />File</span>}
        </span>
        {task.status === 'In Progress' && (
          <ProgressBar className="mt-3 max-w-64" label={`${task.title} progress`} value={task.completionPercentage} />
        )}
      </span>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted transition-transform duration-160 group-hover:translate-x-0.5 group-hover:text-accent" />
    </button>
  );
};

export default StaffWorkItem;
