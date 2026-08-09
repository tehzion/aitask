import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Department, Task, User } from '../types';
import { getMemberDepartments } from '../lib/departments';
import {
  getTeamMemberTaskGroups,
  getTeamWorkloadSummaries,
  type TeamTaskGroups,
  type TeamWorkloadPeriod,
  type TeamWorkloadSignal,
  type TeamWorkloadSummary,
} from '../lib/taskReporting';
import { cn, parseOptionalDate } from '../lib/utils';
import ModalShell from './ModalShell';
import { Button } from './ui';
import { cardBase, inputBase, modalFooter } from './uiTokens';

interface TeamWorkloadProps {
  tasks: Task[];
  users: User[];
  onCreateTaskFor: (member: User) => void;
}

type TeamSort = 'attention' | 'name' | 'open';

const periodOptions: Array<{ value: TeamWorkloadPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'overall', label: 'Overall' },
];

const signalLabels: Record<TeamWorkloadSignal, string> = {
  available: 'Available',
  balanced: 'Balanced',
  busy: 'Busy',
  attention: 'Attention',
};

const signalClasses: Record<TeamWorkloadSignal, string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  balanced: 'border-blue-200 bg-blue-50 text-blue-700',
  busy: 'border-amber-200 bg-amber-50 text-amber-700',
  attention: 'border-red-200 bg-red-50 text-red-700',
};

const priorityClasses: Record<Task['priority'], string> = {
  Low: 'bg-slate-100 text-slate-600',
  Medium: 'bg-blue-50 text-blue-700',
  High: 'bg-amber-50 text-amber-700',
  Urgent: 'bg-red-50 text-red-700',
};

const MemberIdentity = ({ member }: { member: User }) => (
  <div className="flex min-w-0 items-center gap-3">
    {member.avatar ? (
      <img src={member.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
    ) : (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
        {member.name.charAt(0).toUpperCase()}
      </span>
    )}
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-slate-900">{member.name}</p>
      <p className="truncate text-xs text-slate-500">{getMemberDepartments(member).join(' · ') || member.role}</p>
    </div>
  </div>
);

const WorkloadSignal = ({ summary }: { summary: TeamWorkloadSummary }) => (
  <span
    className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-semibold', signalClasses[summary.signal])}
    title="Based on assigned due work for the selected period; this is not a performance score."
  >
    {signalLabels[summary.signal]}
  </span>
);

const Metric = ({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-medium text-slate-500">{label}</p>
    <p className={cn('mt-0.5 text-lg font-bold text-slate-900', danger && value > 0 && 'text-red-700')}>{value}</p>
  </div>
);

const formatTaskDate = (value?: string) => {
  const date = parseOptionalDate(value);
  return date ? format(date, 'd MMM') : 'No date';
};

const TaskGroup = ({
  title,
  tasks,
  tone = 'default',
}: {
  title: string;
  tasks: Task[];
  tone?: 'default' | 'danger' | 'success';
}) => {
  if (tasks.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between border-y border-slate-100 bg-slate-50 px-4 py-2.5 sm:px-5">
        <h4 className={cn(
          'text-xs font-semibold uppercase text-slate-600',
          tone === 'danger' && 'text-red-700',
          tone === 'success' && 'text-emerald-700',
        )}>{title}</h4>
        <span className="text-xs font-semibold text-slate-500">{tasks.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {tasks.map(task => (
          <Link
            key={task.id}
            to={`/tasks?taskId=${encodeURIComponent(task.id)}`}
            className="group grid gap-2 px-4 py-3 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{task.clientName} · {task.status}</p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className={cn('rounded-md px-2 py-1 text-[11px] font-semibold', priorityClasses[task.priority])}>{task.priority}</span>
              <span className="text-xs font-medium text-slate-500">
                {formatTaskDate(task.startDate)} - {formatTaskDate(task.dueDate)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

const TeamWorkload: React.FC<TeamWorkloadProps> = ({ tasks, users, onCreateTaskFor }) => {
  const [period, setPeriod] = useState<TeamWorkloadPeriod>('week');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<Department | 'All'>('All');
  const [sort, setSort] = useState<TeamSort>('attention');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const departmentOptions = useMemo(() => Array.from(new Set(
    users
      .filter(member => member.role !== 'Client' && !member.directoryOnly)
      .flatMap(getMemberDepartments),
  )).sort((left, right) => left.localeCompare(right)), [users]);

  const summaries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = getTeamWorkloadSummaries(tasks, users, period)
      .filter(summary => (
        (!normalizedQuery || summary.member.name.toLowerCase().includes(normalizedQuery))
        && (department === 'All' || getMemberDepartments(summary.member).includes(department))
      ));

    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.member.name.localeCompare(right.member.name);
      if (sort === 'open') return right.open - left.open || left.member.name.localeCompare(right.member.name);
      return right.overdue - left.overdue
        || right.waitingApproval - left.waitingApproval
        || right.periodOpen - left.periodOpen
        || left.member.name.localeCompare(right.member.name);
    });
  }, [department, period, query, sort, tasks, users]);

  const selectedSummary = useMemo(
    () => getTeamWorkloadSummaries(tasks, users, period).find(summary => summary.member.id === selectedMemberId),
    [period, selectedMemberId, tasks, users],
  );
  const selectedGroups: TeamTaskGroups | null = useMemo(
    () => selectedMemberId ? getTeamMemberTaskGroups(tasks, selectedMemberId) : null,
    [selectedMemberId, tasks],
  );
  const selectedTaskCount = selectedGroups
    ? Object.values(selectedGroups).reduce((total, group) => total + group.length, 0)
    : 0;

  const openMember = (memberId: string) => setSelectedMemberId(memberId);

  return (
    <section className="space-y-4" aria-labelledby="team-workload-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="team-workload-title" className="text-lg font-semibold text-slate-950">Team workload</h2>
          <p className="mt-1 text-sm text-slate-500">See assigned work by person and open the details that need action.</p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="Team workload period">
          {periodOptions.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={cn(
                'min-h-8 rounded-md px-3 text-xs font-semibold text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-blue-200',
                period === option.value && 'bg-white text-blue-700 shadow-sm',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(cardBase, 'overflow-hidden')}>
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(0,1fr)_12rem_11rem]">
          <label className="relative block">
            <span className="sr-only">Search team members</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              className={cn(inputBase, 'py-2 pl-9 pr-3')}
              placeholder="Search team members"
            />
          </label>
          <select
            value={department}
            onChange={event => setDepartment(event.target.value as Department | 'All')}
            className={cn(inputBase, 'px-3 py-2')}
            aria-label="Filter team by department"
          >
            <option value="All">All departments</option>
            {departmentOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <select
            value={sort}
            onChange={event => setSort(event.target.value as TeamSort)}
            className={cn(inputBase, 'px-3 py-2')}
            aria-label="Sort team workload"
          >
            <option value="attention">Needs attention</option>
            <option value="name">Name</option>
            <option value="open">Most open tasks</option>
          </select>
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[1020px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Team member</th>
                <th className="px-3 py-3 text-center font-semibold">Today</th>
                <th className="px-3 py-3 text-center font-semibold">This week</th>
                <th className="px-3 py-3 text-center font-semibold">Open</th>
                <th className="px-3 py-3 text-center font-semibold">Overdue</th>
                <th className="px-3 py-3 text-center font-semibold">Review</th>
                <th className="px-3 py-3 text-center font-semibold">Done this week</th>
                <th className="px-4 py-3 text-right font-semibold">Workload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map(summary => (
                <tr key={summary.member.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openMember(summary.member.id)}
                      className="w-full rounded-md text-left focus:outline-none focus:ring-2 focus:ring-blue-200"
                      aria-label={`View ${summary.member.name} workload`}
                    >
                      <MemberIdentity member={summary.member} />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-700">{summary.dueToday}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-700">{summary.dueThisWeek}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-700">{summary.open}</td>
                  <td className={cn('px-3 py-3 text-center font-semibold text-slate-700', summary.overdue > 0 && 'text-red-700')}>{summary.overdue}</td>
                  <td className={cn('px-3 py-3 text-center font-semibold text-slate-700', summary.waitingApproval > 0 && 'text-amber-700')}>{summary.waitingApproval}</td>
                  <td className="px-3 py-3 text-center font-semibold text-emerald-700">{summary.completedThisWeek}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openMember(summary.member.id)} className="rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200" aria-label={`Open ${summary.member.name} task details`}>
                      <WorkloadSignal summary={summary} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:hidden">
          {summaries.map(summary => (
            <button
              key={summary.member.id}
              type="button"
              onClick={() => openMember(summary.member.id)}
              className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
              aria-label={`View ${summary.member.name} workload`}
            >
              <div className="flex items-start justify-between gap-3">
                <MemberIdentity member={summary.member} />
                <WorkloadSignal summary={summary} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                <Metric label="Today" value={summary.dueToday} />
                <Metric label="This week" value={summary.dueThisWeek} />
                <Metric label="Open" value={summary.open} />
                <Metric label="Overdue" value={summary.overdue} danger />
                <Metric label="Review" value={summary.waitingApproval} />
                <Metric label="Done week" value={summary.completedThisWeek} />
              </div>
            </button>
          ))}
        </div>

        {summaries.length === 0 && (
          <div className="px-5 py-12 text-center">
            <Users className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No matching team members</p>
            <p className="mt-1 text-xs text-slate-500">Try another name or department.</p>
          </div>
        )}
      </div>

      {selectedSummary && selectedGroups && (
        <ModalShell
          labelledBy={titleId}
          describedBy={descriptionId}
          onClose={() => setSelectedMemberId(null)}
          overlayClassName="items-stretch justify-end p-0 sm:p-0"
          panelClassName="h-full max-h-none max-w-xl rounded-none sm:max-h-full sm:rounded-l-lg"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-700">Team workload</p>
              <h3 id={titleId} className="mt-1 truncate text-xl font-semibold text-slate-950">{selectedSummary.member.name}</h3>
              <p id={descriptionId} className="mt-1 text-sm text-slate-500">
                {getMemberDepartments(selectedSummary.member).join(' · ') || selectedSummary.member.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMemberId(null)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              aria-label="Close team member details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4">
            <div className="border-b border-r border-slate-100 px-4 py-3 sm:border-b-0"><Metric label="Open" value={selectedSummary.open} /></div>
            <div className="border-b border-slate-100 px-4 py-3 sm:border-b-0 sm:border-r"><Metric label="Overdue" value={selectedSummary.overdue} danger /></div>
            <div className="border-r border-slate-100 px-4 py-3"><Metric label="Waiting review" value={selectedSummary.waitingApproval} /></div>
            <div className="px-4 py-3"><Metric label="Done this week" value={selectedSummary.completedThisWeek} /></div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedTaskCount === 0 ? (
              <div className="px-6 py-16 text-center">
                <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-800">No current or recently completed tasks</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Create a task or view this member’s full assignment history.</p>
              </div>
            ) : (
              <>
                <TaskGroup title="Overdue" tasks={selectedGroups.overdue} tone="danger" />
                <TaskGroup title="Due today" tasks={selectedGroups.today} />
                <TaskGroup title="Due this week" tasks={selectedGroups.thisWeek} />
                <TaskGroup title="Later" tasks={selectedGroups.later} />
                <TaskGroup title="No due date" tasks={selectedGroups.noDueDate} />
                <TaskGroup title="Completed this week" tasks={selectedGroups.completedThisWeek} tone="success" />
              </>
            )}
          </div>

          <div className={modalFooter}>
            <Link
              to={`/tasks?assignee=${encodeURIComponent(selectedSummary.member.id)}&period=${period}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              View assigned tasks <ArrowRight className="h-4 w-4" />
            </Link>
            <Button
              type="button"
              onClick={() => {
                const member = selectedSummary.member;
                setSelectedMemberId(null);
                onCreateTaskFor(member);
              }}
            >
              <Plus className="h-4 w-4" /> Create task for {selectedSummary.member.name.split(' ')[0]}
            </Button>
          </div>
        </ModalShell>
      )}
    </section>
  );
};

export default TeamWorkload;
