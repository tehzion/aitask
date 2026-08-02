import { format, formatDistanceToNow, isBefore, isToday } from 'date-fns';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageSquareText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Task, WorkspaceMember } from '../types';
import {
  getClientLatestUpdates,
  getClientProgress,
  getClientReviewReadyTasks,
  getClientUpcomingDeliveries,
} from '../lib/clientPortal';
import { cn, parseOptionalDate } from '../lib/utils';
import { cardBase } from './uiTokens';

interface ClientPortalDashboardProps {
  tasks: Task[];
  users: WorkspaceMember[];
}

const taskPath = (task: Task) => `/tasks?taskId=${encodeURIComponent(task.id)}`;

const ClientPortalDashboard = ({ tasks, users }: ClientPortalDashboardProps) => {
  const progress = getClientProgress(tasks);
  const reviewReady = getClientReviewReadyTasks(tasks).slice(0, 5);
  const upcoming = getClientUpcomingDeliveries(tasks).slice(0, 6);
  const latest = getClientLatestUpdates(tasks).slice(0, 6);
  const contactName = (id: string) => users.find(user => user.id === id)?.name || 'Agency team';

  const metrics = [
    { label: 'Active', value: progress.active, icon: CircleDot, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Awaiting review', value: progress.awaitingReview, icon: MessageSquareText, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Approved', value: progress.approved, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Total tasks', value: progress.total, icon: CalendarDays, tone: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Company progress">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={cn(cardBase, 'flex min-h-28 items-center gap-3 p-4 sm:p-5')}>
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tone)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-slate-950">{value}</p>
              <p className="mt-0.5 text-sm text-slate-600">{label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-review-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 id="client-review-title" className="text-base font-semibold text-slate-950">Ready for your review</h2>
            <p className="mt-1 text-sm text-slate-500">Review completed work, approve it, or ask for changes.</p>
          </div>
          <Link to="/tasks?status=Waiting%20Approval" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800">
            Company tasks <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {reviewReady.map(task => (
            <div key={task.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{task.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {task.serviceType} · {contactName(task.assignedTo)}
                  {task.dueDate ? ` · Due ${format(parseOptionalDate(task.dueDate)!, 'd MMM yyyy')}` : ''}
                </p>
              </div>
              <Link to={taskPath(task)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Review task <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
          {reviewReady.length === 0 && (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-700">You are all caught up</p>
              <p className="mt-1 text-xs text-slate-500">New deliverables will appear here when they are ready.</p>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-upcoming-title">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <h2 id="client-upcoming-title" className="text-base font-semibold text-slate-950">Upcoming deliveries</h2>
            <p className="mt-1 text-sm text-slate-500">Active work ordered by delivery date.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {upcoming.map(task => {
              const dueDate = parseOptionalDate(task.dueDate);
              const overdue = Boolean(dueDate && isBefore(dueDate, new Date()) && !isToday(dueDate));
              return (
                <Link key={task.id} to={taskPath(task)} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700', overdue && 'bg-red-50 text-red-700')}>
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{task.serviceType} · {contactName(task.assignedTo)}</p>
                  </div>
                  <span className={cn('shrink-0 text-xs font-semibold text-slate-600', overdue && 'text-red-700')}>
                    {overdue ? 'Overdue · ' : ''}{dueDate ? format(dueDate, 'd MMM') : ''}
                  </span>
                </Link>
              );
            })}
            {upcoming.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">No scheduled deliveries right now.</p>}
          </div>
        </section>

        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-updates-title">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <h2 id="client-updates-title" className="text-base font-semibold text-slate-950">Latest updates</h2>
            <p className="mt-1 text-sm text-slate-500">Recently updated work for your company.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {latest.map(task => (
              <Link key={task.id} to={taskPath(task)} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Clock3 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{task.status} · {task.serviceType}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {task.updatedAt ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true }) : ''}
                </span>
              </Link>
            ))}
            {latest.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Updates will appear here as work progresses.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ClientPortalDashboard;
