import { addDays, format, formatDistanceToNow, isBefore, isToday } from 'date-fns';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
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
import { useStore } from '../store';
import { DataRow, ProgressBar, StatGroup, StatusChip, Surface } from './ui';

interface ClientPortalDashboardProps {
  tasks: Task[];
  users: WorkspaceMember[];
}

const taskPath = (task: Task) => `/tasks?taskId=${encodeURIComponent(task.id)}`;

const ClientPortalDashboard = ({ tasks, users }: ClientPortalDashboardProps) => {
  const currentUser = useStore(state => state.currentUser);
  const clients = useStore(state => state.clients);
  const clientPlans = useStore(state => state.clientPlans);
  const serviceCycles = useStore(state => state.serviceCycles);
  const client = clients.find(item => item.clientName.trim().toLowerCase() === currentUser?.companyName?.trim().toLowerCase());
  const activePlan = clientPlans.find(item => item.clientId === client?.id && item.status === 'Active');
  const publishedCycles = serviceCycles.filter(item => item.clientId === client?.id && ['Published', 'Completed'].includes(item.status));
  const progress = getClientProgress(tasks);
  const reviewReadyAll = getClientReviewReadyTasks(tasks);
  const reviewReady = reviewReadyAll.slice(0, 5);
  const upcomingAll = getClientUpcomingDeliveries(tasks);
  const upcoming = upcomingAll.slice(0, 6);
  const latest = getClientLatestUpdates(tasks).slice(0, 6);
  const contactName = (id: string) => users.find(user => user.id === id)?.name || 'Agency team';

  const completion = progress.total ? Math.round((progress.approved / progress.total) * 100) : 0;

  const today = new Date();
  const isOverdue = (task: Task) => {
    const dueDate = parseOptionalDate(task.dueDate);
    return Boolean(dueDate && isBefore(dueDate, today) && !isToday(dueDate));
  };
  const overdueCount = upcomingAll.filter(isOverdue).length;
  const dueSoonCount = upcomingAll.filter(task => {
    const dueDate = parseOptionalDate(task.dueDate);
    return Boolean(dueDate && !isBefore(dueDate, today) && isBefore(dueDate, addDays(today, 7)));
  }).length;
  const sortedUpcoming = [...upcoming].sort((left, right) => {
    const leftDue = parseOptionalDate(left.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
    const rightDue = parseOptionalDate(right.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
    return Number(isOverdue(right)) - Number(isOverdue(left)) || leftDue - rightDue;
  });
  const tasksLink = currentUser?.companyName ? `/tasks?client=${encodeURIComponent(currentUser.companyName)}` : '/tasks';

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Client briefing">
        <Link to={tasksLink} className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', reviewReadyAll.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-inset text-muted')}><FileCheck2 className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="calm-number block text-xl font-semibold text-ink">{reviewReadyAll.length}</span>
            <span className="block truncate text-xs text-muted">Ready for your review</span>
          </span>
        </Link>
        <Link to={tasksLink} className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-inset text-muted')}><AlertCircle className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="calm-number block text-xl font-semibold text-ink">{overdueCount}</span>
            <span className="block truncate text-xs text-muted">Overdue</span>
          </span>
        </Link>
        <Link to={tasksLink} className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', dueSoonCount > 0 ? 'bg-blue-50 text-blue-700' : 'bg-inset text-muted')}><CalendarClock className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="calm-number block text-xl font-semibold text-ink">{dueSoonCount}</span>
            <span className="block truncate text-xs text-muted">Due soon</span>
          </span>
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.85fr)]" aria-label="Company progress">
        <Surface variant="inset" className="relative overflow-hidden p-6 sm:p-8">
          <p className="calm-eyebrow">Current service cycle</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="calm-number text-5xl font-semibold tracking-tight text-ink">{completion}%</p>
              <p className="mt-2 text-sm text-muted">of visible work approved</p>
            </div>
          </div>
          <ProgressBar value={completion} className="mt-6" label={`${completion}% of work approved`} />
          {client && activePlan && (
            <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><h2 data-i18n-skip className="font-semibold text-ink">{activePlan.name}</h2><StatusChip tone="emerald">Active</StatusChip></div>
                <p className="mt-1 text-sm text-muted">{activePlan.serviceItems.length} services · {publishedCycles.length} published cycle(s)</p>
              </div>
              <Link to={`/clients/${encodeURIComponent(client.id)}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition active:translate-y-px dark:text-[rgb(var(--calm-accent-ink))]">Open service workspace <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </Surface>
        <StatGroup className="grid-cols-2" aria-label="Task summary">
          {[
            ['In progress', progress.active],
            ['Awaiting review', progress.awaitingReview],
            ['Approved', progress.approved],
            ['Total tasks', progress.total],
            ...(progress.cancelled > 0 ? [['Cancelled', progress.cancelled]] as const : []),
          ].map(([label, value]) => <div key={label} className="p-5"><p className="calm-number text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs font-medium text-muted">{label}</p></div>)}
        </StatGroup>
      </section>

      <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-review-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 id="client-review-title" className="text-base font-semibold text-ink">Ready for your review</h2>
            <p className="mt-1 text-sm text-muted">Review completed work, approve it, or ask for changes.</p>
          </div>
          <Link to={tasksLink} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent/80">
            Company tasks <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="divide-y divide-line">
          {reviewReady.map(task => (
            <div key={task.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p data-i18n-skip className="truncate text-sm font-semibold text-ink">{task.title}</p>
                <p className="mt-1 text-xs text-muted">
                  <span data-i18n-skip>{task.serviceType} · {contactName(task.assignedTo)}</span>
                  {task.dueDate ? ` · Due ${format(parseOptionalDate(task.dueDate)!, 'd MMM yyyy')}` : ''}
                </p>
              </div>
              <Link to={taskPath(task)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition active:translate-y-px">
                Review task <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
          {reviewReady.length === 0 && (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-ink">You are all caught up</p>
              <p className="mt-1 text-xs text-muted">New deliverables will appear here when they are ready.</p>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-upcoming-title">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <h2 id="client-upcoming-title" className="text-base font-semibold text-ink">Upcoming deliveries</h2>
            <p className="mt-1 text-sm text-muted">Active work ordered by delivery date.</p>
          </div>
          <div className="divide-y divide-line">
            {sortedUpcoming.map(task => {
              const dueDate = parseOptionalDate(task.dueDate);
              const overdue = isOverdue(task);
              return (
                <DataRow key={task.id} title={<Link data-i18n-skip to={taskPath(task)} className="hover:text-accent">{task.title}</Link>} description={<span data-i18n-skip>{task.serviceType} · {contactName(task.assignedTo)}</span>} action={<span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-muted', overdue && 'text-red-700')}><CalendarDays className="h-4 w-4" />{overdue ? 'Overdue · ' : ''}{dueDate ? format(dueDate, 'd MMM') : ''}</span>} />
              );
            })}
            {upcoming.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">No scheduled deliveries right now.</p>}
          </div>
        </section>

        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-updates-title">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <h2 id="client-updates-title" className="text-base font-semibold text-ink">Latest updates</h2>
            <p className="mt-1 text-sm text-muted">Recently updated work for your company.</p>
          </div>
          <div className="divide-y divide-line">
            {latest.map(task => (
              <DataRow key={task.id} title={<Link data-i18n-skip to={taskPath(task)} className="hover:text-accent">{task.title}</Link>} description={<>{task.status} · <span data-i18n-skip>{task.serviceType}</span></>} action={<span className="inline-flex items-center gap-1.5 text-xs text-muted"><Clock3 className="h-4 w-4" />{task.updatedAt ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true }) : ''}</span>} />
            ))}
            {latest.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">Updates will appear here as work progresses.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ClientPortalDashboard;
