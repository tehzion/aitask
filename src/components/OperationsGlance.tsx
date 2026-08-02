import React, { useMemo, useState } from 'react';
import { format, isBefore, startOfDay } from 'date-fns';
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDot, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Task, User } from '../types';
import {
  getAgencyPulseMetrics,
  getNeedsAttentionTasks,
  getRecentCompletionTasks,
  type CompletionSegment,
} from '../lib/taskReporting';
import { cn, getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { cardBase } from './uiTokens';

type OperationsScope = 'agency' | 'staff';

interface OperationsGlanceProps {
  tasks: Task[];
  users: User[];
  scope: OperationsScope;
}

interface PulseValueProps {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

const PulseValue = ({ label, value, tone = 'default' }: PulseValueProps) => (
  <div className="min-w-0 px-4 py-3 sm:px-5">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className={cn(
      'mt-1 text-2xl font-bold text-slate-950',
      tone === 'success' && 'text-emerald-700',
      tone === 'warning' && 'text-amber-700',
      tone === 'danger' && 'text-red-700',
    )}>{value}</p>
  </div>
);

const TaskEntry = ({
  task,
  usersById,
  mode,
  scope,
}: {
  task: Task;
  usersById: Map<string, User>;
  mode: 'attention' | 'completion';
  scope: OperationsScope;
}) => {
  const dueDate = parseOptionalDate(task.dueDate);
  const completedAt = parseOptionalDate(task.completedAt);
  const isOverdue = Boolean(dueDate && !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDate, startOfDay(new Date())));
  const timestamp = mode === 'completion' ? completedAt : dueDate;
  const timing = mode === 'completion'
    ? completedAt ? `Completed ${format(completedAt, 'd MMM, h:mm a')}` : 'Completion time unavailable'
    : getRelativeDueDateString(task.dueDate, task.isCompleted, task.status);
  const context = scope === 'agency'
    ? `${task.clientName} · ${usersById.get(task.assignedTo)?.name || 'Unassigned'} · ${task.department}`
    : `${task.clientName} · ${task.department} · ${task.status}`;

  return (
    <Link
      to={`/tasks?taskId=${encodeURIComponent(task.id)}`}
      className="group grid min-w-0 gap-2 px-4 py-3 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {mode === 'attention' && (
            isOverdue
              ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              : <Clock3 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          )}
          {mode === 'completion' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
          <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{context}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <time
          dateTime={timestamp?.toISOString()}
          className={cn('text-xs font-medium text-slate-500', isOverdue && 'text-red-700')}
        >
          {timing}
        </time>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" aria-hidden="true" />
      </div>
    </Link>
  );
};

const OperationsGlance: React.FC<OperationsGlanceProps> = ({ tasks, users, scope }) => {
  const [completionSegment, setCompletionSegment] = useState<CompletionSegment>('today');
  const now = new Date();
  const pulse = getAgencyPulseMetrics(tasks, now);
  const attention = getNeedsAttentionTasks(tasks, now).slice(0, 6);
  const completions = getRecentCompletionTasks(tasks, completionSegment, now).slice(0, 6);
  const usersById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const isStaffScope = scope === 'staff';
  const titleId = isStaffScope ? 'staff-work-pulse-title' : 'agency-pulse-title';

  const segments: Array<{ value: CompletionSegment; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <section className="space-y-4" aria-labelledby={titleId}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-950">
            {isStaffScope ? 'My work pulse' : 'Agency pulse'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{format(now, 'EEEE, d MMMM yyyy')} · Week {pulse.period.label}</p>
        </div>
        <p className="text-xs text-slate-500">{isStaffScope ? 'Your assigned workload' : 'Agency-wide operational status'}</p>
      </div>

      <div className={cn(cardBase, 'overflow-hidden')}>
        <div className="grid border-b border-slate-100 lg:grid-cols-[10rem_1fr]">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 sm:px-5">
            <CircleDot className="h-4 w-4 text-blue-600" aria-hidden="true" /> Today
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            <PulseValue label="Completed" value={pulse.today.completed} tone="success" />
            <PulseValue label="Due" value={pulse.today.due} />
            <PulseValue label="Still open" value={pulse.today.open} tone="warning" />
          </div>
        </div>
        <div className="grid border-b border-slate-100 lg:grid-cols-[10rem_1fr]">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 sm:px-5">
            <Clock3 className="h-4 w-4 text-blue-600" aria-hidden="true" /> This week
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
            <PulseValue label="Completed" value={pulse.week.completed} tone="success" />
            <PulseValue label="Due" value={pulse.week.due} />
            <PulseValue label="Remaining" value={pulse.week.remaining} tone="warning" />
            <PulseValue label="Overdue now" value={pulse.week.overdue} tone="danger" />
          </div>
        </div>
        <div className="grid lg:grid-cols-[10rem_1fr]">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 sm:px-5">
            <CheckCircle2 className="h-4 w-4 text-blue-600" aria-hidden="true" /> Overall
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
            <PulseValue label={isStaffScope ? 'Assigned open' : 'Total open'} value={pulse.overall.open} />
            <PulseValue label="In progress" value={pulse.overall.inProgress} />
            <PulseValue label="Waiting approval" value={pulse.overall.waitingApproval} tone="warning" />
            <PulseValue label="Completed all time" value={pulse.overall.completed} tone="success" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby={`${scope}-attention-title`}>
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <h3 id={`${scope}-attention-title`} className="text-base font-semibold text-slate-900">
              {isStaffScope ? 'My focus' : 'Needs attention'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {isStaffScope ? 'Your overdue assignments first, then work waiting for approval.' : 'Overdue work first, then tasks waiting for approval.'}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {attention.map(task => <TaskEntry key={task.id} task={task} usersById={usersById} mode="attention" scope={scope} />)}
            {attention.length === 0 && (
              <div className="px-5 py-10 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {isStaffScope ? "You're caught up" : 'Nothing urgent right now'}
                </p>
                <p className="mt-1 text-xs text-slate-500">Overdue and approval-ready tasks will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby={`${scope}-completions-title`}>
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 id={`${scope}-completions-title`} className="text-base font-semibold text-slate-900">
                  {isStaffScope ? 'My recent completions' : 'Recent completions'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">Tracked from the actual completion time.</p>
              </div>
              <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label={`${isStaffScope ? 'Personal' : 'Agency'} completion period`}>
                {segments.map(segment => (
                  <button
                    key={segment.value}
                    type="button"
                    aria-pressed={completionSegment === segment.value}
                    onClick={() => setCompletionSegment(segment.value)}
                    className={cn(
                      'min-h-8 rounded-md px-2.5 text-xs font-semibold text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-blue-200',
                      completionSegment === segment.value && 'bg-white text-blue-700 shadow-sm',
                    )}
                  >
                    {segment.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {completions.map(task => <TaskEntry key={task.id} task={task} usersById={usersById} mode="completion" scope={scope} />)}
            {completions.length === 0 && (
              <div className="px-5 py-10 text-center">
                <Clock3 className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No tracked completions in this period</p>
                <p className="mt-1 text-xs text-slate-500">New completions will be timestamped automatically.</p>
              </div>
            )}
          </div>
          {pulse.untrackedHistoricalCompletions > 0 && (
            <p className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">
              {pulse.untrackedHistoricalCompletions} historical completed task{pulse.untrackedHistoricalCompletions === 1 ? '' : 's'} remain in all-time totals, but have no reliable completion date.
            </p>
          )}
        </section>
      </div>
    </section>
  );
};

export default OperationsGlance;
