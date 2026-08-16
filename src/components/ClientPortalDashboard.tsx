import { format, formatDistanceToNow, isBefore, isToday } from 'date-fns';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
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
  const reviewReady = getClientReviewReadyTasks(tasks).slice(0, 5);
  const upcoming = getClientUpcomingDeliveries(tasks).slice(0, 6);
  const latest = getClientLatestUpdates(tasks).slice(0, 6);
  const contactName = (id: string) => users.find(user => user.id === id)?.name || 'Agency team';

  const completion = progress.total ? Math.round((progress.approved / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
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
                <div className="flex items-center gap-2"><h2 className="font-semibold text-ink">{activePlan.name}</h2><StatusChip tone="emerald">Active</StatusChip></div>
                <p className="mt-1 text-sm text-muted">{activePlan.serviceItems.length} services · {publishedCycles.length} published cycle(s)</p>
              </div>
              <Link to={`/clients/${encodeURIComponent(client.id)}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition active:translate-y-px dark:text-[rgb(var(--calm-accent-ink))]">Open service workspace <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </Surface>
        <StatGroup className="grid-cols-2" aria-label="Task summary">
          {[
            ['Active', progress.active],
            ['Awaiting review', progress.awaitingReview],
            ['Approved', progress.approved],
            ['Total tasks', progress.total],
            ...(progress.cancelled > 0 ? [['Cancelled', progress.cancelled]] as const : []),
          ].map(([label, value]) => <div key={label} className="p-5"><p className="calm-number text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs font-medium text-muted">{label}</p></div>)}
        </StatGroup>
      </section>

      <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="client-review-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 id="client-review-title" className="text-base font-semibold text-slate-950">Ready for your review</h2>
            <p className="mt-1 text-sm text-slate-500">Review completed work, approve it, or ask for changes.</p>
          </div>
          <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800">
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
              <Link to={taskPath(task)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition active:translate-y-px">
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
                <DataRow key={task.id} title={<Link to={taskPath(task)} className="hover:text-accent">{task.title}</Link>} description={`${task.serviceType} · ${contactName(task.assignedTo)}`} action={<span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-muted', overdue && 'text-red-700')}><CalendarDays className="h-4 w-4" />{overdue ? 'Overdue · ' : ''}{dueDate ? format(dueDate, 'd MMM') : ''}</span>} />
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
              <DataRow key={task.id} title={<Link to={taskPath(task)} className="hover:text-accent">{task.title}</Link>} description={`${task.status} · ${task.serviceType}`} action={<span className="inline-flex items-center gap-1.5 text-xs text-muted"><Clock3 className="h-4 w-4" />{task.updatedAt ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true }) : ''}</span>} />
            ))}
            {latest.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Updates will appear here as work progresses.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ClientPortalDashboard;
