import '../lib/taskStageCopy';
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import type { Task, User } from '../types';
import { getLocalizedPriority, getLocalizedTaskStatus } from '../lib/localeLabels';
import { getTaskBlockers, getUnavailableTaskDependencyCount } from '../lib/staffWorkspace';
import { getTaskWorkflowSteps, type TaskWorkflowStep } from '../lib/taskStage';
import { isTaskOverdue } from '../lib/taskReporting';
import { cn, getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { formatLocalizedDate } from '../lib/i18n';
import { useLocalToday } from '../hooks/useLocalToday';
import { useTaskNextStep } from '../hooks/useTaskNextStep';
import { StatusChip } from './ui';
import { useI18n } from './I18nProvider';

const statusTone = (task: Pick<Task, 'status' | 'isCompleted'>) => {
  if (task.isCompleted || task.status === 'Completed' || task.status === 'Approved') return 'emerald' as const;
  if (task.status === 'Waiting Approval') return 'amber' as const;
  if (task.status === 'In Progress') return 'blue' as const;
  return 'slate' as const;
};

/** Lifecycle status, with Overdue shown beside it as a deadline condition. */
export const TaskStatusBadges: React.FC<{ task: Task; overdue?: boolean; className?: string }> = ({ task, overdue = false, className }) => {
  const { locale, t } = useI18n();
  return <span className={cn('inline-flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
    <StatusChip tone={statusTone(task)}>{getLocalizedTaskStatus(task.status, locale)}</StatusChip>
    {overdue && <StatusChip tone="red">{t('Overdue')}</StatusChip>}
  </span>;
};

interface TaskCardProps {
  task: Task;
  allTasks: Task[];
  users?: User[];
  onOpen: (task: Task) => void;
  emphasized?: boolean;
  className?: string;
}

/**
 * One task, read like an order: where it belongs and its status, what it is,
 * who has it and when it is due, then the next step the viewer can take.
 */
export const TaskCard: React.FC<TaskCardProps> = ({ task, allTasks, users = [], onOpen, emphasized = false, className }) => {
  const { locale, t } = useI18n();
  const today = useLocalToday();
  const nextStep = useTaskNextStep(task);
  const overdue = isTaskOverdue(task, today);
  const assignee = users.find(user => user.id === task.assignedTo)?.name;
  const blockers = getTaskBlockers(task, allTasks).length;
  const unavailableDependencies = getUnavailableTaskDependencyCount(task, allTasks);
  const open = !task.isCompleted && !['Completed', 'Cancelled'].includes(task.status);
  const flags = [
    task.revisionCount > 0 && open && `${t('Revision')} ${task.revisionCount}`,
    open && task.workState?.blocker && t('Help requested'),
    blockers > 0 && `${blockers} ${t(blockers === 1 ? 'blocker' : 'blockers')}`,
    unavailableDependencies > 0 && t('Dependency status unavailable'),
  ].filter((flag): flag is string => Boolean(flag));

  // Finished work reads like order history: one compact row, newest context only.
  if (!open) {
    const finishedAt = task.completedAt ? parseOptionalDate(task.completedAt.slice(0, 10)) : undefined;
    return (
      <article className={cn(
        'group relative flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-160 hover:bg-inset/60 focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent/40 sm:px-5',
        className,
      )}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-5 text-ink">
            <button
              type="button"
              onClick={() => onOpen(task)}
              className="text-left after:absolute after:inset-0 focus:outline-none"
            ><span data-i18n-skip>{task.title}</span></button>
          </div>
          <p className="truncate text-xs leading-5 text-muted">
            <span data-i18n-skip>{task.clientName}{task.projectName ? ` · ${task.projectName}` : ''}</span>
            {assignee && <> · <span data-i18n-skip>{assignee}</span></>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
          <TaskStatusBadges task={task} />
          {finishedAt && <span className="calm-number">{formatLocalizedDate(finishedAt, locale)}</span>}
        </div>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
      </article>
    );
  }

  return (
    <article className={cn(
      'group relative flex flex-col gap-2 text-left transition-colors duration-160 focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent/40',
      emphasized ? 'rounded-panel bg-surface p-4 shadow-calm sm:p-5' : 'px-4 py-3.5 hover:bg-inset/60 sm:px-5',
      className,
    )}>
      <div className="flex items-start justify-between gap-3">
        <p data-i18n-skip className="min-w-0 truncate text-xs font-medium text-muted">{task.clientName}{task.projectName ? ` · ${task.projectName}` : ''}</p>
        <TaskStatusBadges task={task} className="shrink-0 justify-end" />
      </div>
      <div className="text-base font-semibold leading-6 text-ink">
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="text-left after:absolute after:inset-0 focus:outline-none"
        ><span data-i18n-skip>{task.title}</span></button>
      </div>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <div className="flex gap-1"><dt>{t('Assigned to')}</dt><dd data-i18n-skip className="font-medium text-ink">{assignee || t('Unassigned')}</dd></div>
        <div className="flex gap-1"><dt className="sr-only">{t('Due')}</dt><dd className={overdue ? 'font-semibold text-red-700 dark:text-red-300' : undefined}>{getRelativeDueDateString(task.dueDate, task.isCompleted, task.status, locale)}</dd></div>
        {open && (task.priority === 'Urgent' || task.priority === 'High') && <div><dt className="sr-only">{t('Priority')}</dt><dd className={task.priority === 'Urgent' ? 'font-semibold text-red-700 dark:text-red-300' : 'font-medium text-ink'}>{getLocalizedPriority(task.priority, locale)}</dd></div>}
      </dl>
      {flags.length > 0 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{flags.join(' · ')}</p>}
      {nextStep && <div className="mt-1 flex items-center justify-between gap-3 border-t border-line/60 pt-2.5">
        <span className="text-sm font-semibold text-ink"><span className="font-medium text-muted">{t('Next')}:</span> {t(nextStep)}</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted transition-transform duration-160 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>}
    </article>
  );
};

const STEP_LABELS: Record<TaskWorkflowStep, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  review: 'Waiting Approval',
  approved: 'Approved',
  completed: 'Completed',
};

/**
 * The task's position in its configured workflow. It keeps the progressbar
 * role and milestone value so assistive technology still reads one progress
 * value; the visual is the stage, not a percentage.
 */
export const TaskWorkflowSteps: React.FC<{ task: Task; progress: number; label: string; className?: string }> = ({ task, progress, label, className }) => {
  const { locale, t } = useI18n();
  const projects = useStore(state => state.projects);
  const workflow = getTaskWorkflowSteps(task, projects);
  if (!workflow) return null;
  const stepLabel = (step: TaskWorkflowStep) => step === 'todo' || step === 'in_progress' ? t(STEP_LABELS[step]) : getLocalizedTaskStatus(STEP_LABELS[step], locale);
  const currentLabel = stepLabel(workflow.steps[workflow.current]);
  return (
    <div
      className={className}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-valuetext={currentLabel}
    >
      <ol className="flex gap-1" aria-hidden="true">
        {workflow.steps.map((step, index) => <li key={step} className={cn('h-1.5 flex-1 rounded-full', index <= workflow.current ? 'bg-accent' : 'bg-line')} />)}
      </ol>
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-muted" aria-hidden="true">
        <span className="font-semibold text-ink sm:invisible">{currentLabel}</span>
        <span>{t('Step {current} of {total}', { current: workflow.current + 1, total: workflow.steps.length })}</span>
      </p>
      <ol className="mt-1 hidden gap-1 text-[11px] leading-4 text-muted sm:flex" aria-hidden="true">
        {workflow.steps.map((step, index) => <li key={step} className={cn('flex-1 truncate', index === workflow.current && 'font-semibold text-ink')}>{stepLabel(step)}</li>)}
      </ol>
    </div>
  );
};
