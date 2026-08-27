import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileCheck2, MessageSquareText, TimerReset } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Task, WorkspaceMember } from '../types';
import {
  getClientDeliveryStage,
  getClientDeliveryStageLabel,
  getClientFocusTask,
  getClientLatestUpdates,
  groupClientDeliveries,
} from '../lib/clientPortal';
import { parseOptionalDate } from '../lib/utils';
import { useStore } from '../store';
import { ProgressBar, StatusChip, Surface } from './ui';

interface ClientPortalDashboardProps {
  tasks: Task[];
  users: WorkspaceMember[];
}

const taskPath = (task: Task) => `/tasks?taskId=${encodeURIComponent(task.id)}`;

const stageTone = (task: Task): 'amber' | 'emerald' | 'blue' | 'slate' => {
  const stage = getClientDeliveryStage(task);
  if (stage === 'needs_review' || stage === 'timing_changed') return 'amber';
  if (stage === 'delivered') return 'emerald';
  if (stage === 'in_delivery') return 'blue';
  return 'slate';
};

const expectedDate = (task: Task) => {
  const dueDate = parseOptionalDate(task.dueDate);
  return dueDate ? format(dueDate, 'd MMM yyyy') : 'Date to be confirmed';
};

const ClientPortalDashboard = ({ tasks, users }: ClientPortalDashboardProps) => {
  const currentUser = useStore(state => state.currentUser);
  const clients = useStore(state => state.clients);
  const clientPlans = useStore(state => state.clientPlans);
  const serviceCycles = useStore(state => state.serviceCycles);
  const deliverables = useStore(state => state.deliverables);
  const clientKey = currentUser?.companyName?.trim().toLowerCase();
  const client = clients.find(item => item.clientName.trim().toLowerCase() === clientKey);
  const activePlan = clientPlans.find(item => item.clientId === client?.id && item.status === 'Active');
  const currentCycle = [...serviceCycles]
    .filter(item => item.clientId === client?.id && ['Published', 'Completed'].includes(item.status))
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart))[0];
  const cycleDeliverables = currentCycle ? deliverables.filter(item => item.cycleId === currentCycle.id) : [];
  const deliveredCount = cycleDeliverables.filter(item => item.status === 'Delivered').length;
  const cycleCompletion = cycleDeliverables.length ? Math.round((deliveredCount / cycleDeliverables.length) * 100) : 0;
  const groups = groupClientDeliveries(tasks);
  const focusTask = getClientFocusTask(tasks);
  const focusStage = focusTask ? getClientDeliveryStage(focusTask) : null;
  const reviewQueue = groups.needs_review.filter(task => task.id !== focusTask?.id).slice(0, 4);
  const activeQueue = [...groups.timing_changed, ...groups.in_delivery, ...groups.scheduled]
    .filter(task => task.id !== focusTask?.id)
    .slice(0, 6);
  const updates = getClientLatestUpdates(tasks).filter(task => task.id !== focusTask?.id).slice(0, 5);
  const delivered = getClientLatestUpdates(groups.delivered).slice(0, 5);
  const contactName = (id: string) => users.find(user => user.id === id)?.name || 'Agency team';
  const latestTeamComment = focusTask?.comments
    ?.filter(comment => comment.userId !== currentUser?.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  const deliveryRow = (task: Task, actionLabel = 'View delivery') => (
    <article key={task.id} className="group grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link data-i18n-skip to={taskPath(task)} className="truncate text-sm font-semibold text-ink transition-colors duration-160 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
            {task.title}
          </Link>
          <StatusChip tone={stageTone(task)}>{getClientDeliveryStageLabel(task)}</StatusChip>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          <span data-i18n-skip>{task.serviceType} · {contactName(task.assignedTo)}</span>
          <span> · {expectedDate(task)}</span>
        </p>
      </div>
      <Link to={taskPath(task)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold text-accent transition-colors duration-160 hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:translate-y-px">
        {actionLabel}<ArrowRight className="h-4 w-4 transition-transform duration-160 group-hover:translate-x-0.5" />
      </Link>
    </article>
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.7fr)]" aria-labelledby="client-focus-title">
        <Surface variant="inset" className="relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          {focusTask ? (
            <div className="relative max-w-3xl">
              <div className="flex items-center gap-2 text-accent">
                {focusStage === 'needs_review' ? <FileCheck2 className="h-4 w-4" /> : focusStage === 'timing_changed' ? <TimerReset className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                <p className="calm-eyebrow text-current">{focusStage === 'needs_review' ? 'Your next decision' : focusStage === 'timing_changed' ? 'Timing changed' : 'Next delivery'}</p>
              </div>
              <h2 id="client-focus-title" data-i18n-skip className="mt-4 max-w-[22ch] text-pretty text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">{focusTask.title}</h2>
              <p data-i18n-skip className="mt-3 max-w-[62ch] text-pretty text-sm leading-6 text-muted">
                {focusTask.description || (focusStage === 'needs_review' ? 'This delivery is ready for your decision.' : 'The agency team is preparing this delivery.')}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <span data-i18n-skip className="font-medium text-ink">{focusTask.serviceType}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{expectedDate(focusTask)}</span>
                <span data-i18n-skip>{contactName(focusTask.assignedTo)}</span>
              </div>
              {focusStage === 'timing_changed' && (
                <div className="mt-5 max-w-2xl rounded-control border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">Expected timing has changed</p>
                  <p data-i18n-skip className="mt-1">{latestTeamComment?.text || `The current expected date is ${expectedDate(focusTask)}. ${contactName(focusTask.assignedTo)} is your contact for timing.`}</p>
                </div>
              )}
              <Link to={taskPath(focusTask)} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-semibold text-white shadow-[0_12px_28px_-18px_rgb(var(--calm-accent)/0.9)] transition duration-160 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 active:translate-y-px dark:text-[rgb(var(--calm-accent-ink))]">
                {focusStage === 'needs_review' ? 'Review deliverable' : 'View delivery'}<ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="relative py-5">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <h2 id="client-focus-title" className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-ink">You are all caught up</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">New deliveries and review requests will appear here when the team shares them.</p>
            </div>
          )}
        </Surface>

        <Surface className="p-6">
          <p className="calm-eyebrow">Monthly service progress</p>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div><p className="calm-number text-4xl font-semibold tracking-tight text-ink">{cycleCompletion}%</p><p className="mt-2 text-sm text-muted">{cycleDeliverables.length ? `${deliveredCount} of ${cycleDeliverables.length} delivered this cycle` : 'No published deliverables yet'}</p></div>
            {currentCycle && <StatusChip tone="emerald">{currentCycle.status}</StatusChip>}
          </div>
          <ProgressBar className="mt-6" value={deliveredCount} max={Math.max(cycleDeliverables.length, 1)} label="Monthly service progress" />
          {client && activePlan && (
            <Link to={`/clients/${encodeURIComponent(client.id)}`} className="mt-6 inline-flex min-h-11 w-full items-center justify-between rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
              <span data-i18n-skip>{activePlan.name}</span><ArrowRight className="h-4 w-4 text-accent" />
            </Link>
          )}
        </Surface>
      </section>

      <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby="needs-review-title">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
          <div><h2 id="needs-review-title" className="font-semibold text-ink">Needs your review</h2><p className="mt-1 text-sm text-muted">Approve completed work or request a specific change.</p></div>
          <Link to="/tasks?stage=needs_review" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">View all<ArrowRight className="h-4 w-4" /></Link>
        </header>
        <div className="divide-y divide-line/70">
          {reviewQueue.map(task => deliveryRow(task, 'Review deliverable'))}
          {reviewQueue.length === 0 && focusStage !== 'needs_review' && <p className="px-5 py-8 text-sm text-muted">Nothing is waiting for your review.</p>}
          {reviewQueue.length === 0 && focusStage === 'needs_review' && <p className="px-5 py-5 text-sm text-muted">Your current review is highlighted above.</p>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
        <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby="in-delivery-title">
          <header className="border-b border-line/70 px-4 py-4 sm:px-5"><h2 id="in-delivery-title" className="font-semibold text-ink">In delivery</h2><p className="mt-1 text-sm text-muted">Expected work, including any timing changes.</p></header>
          <div className="divide-y divide-line/70">{activeQueue.map(task => deliveryRow(task))}{activeQueue.length === 0 && <p className="px-5 py-8 text-sm text-muted">No active deliveries right now.</p>}</div>
        </section>

        <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby="shared-updates-title">
          <header className="border-b border-line/70 px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-accent" /><h2 id="shared-updates-title" className="font-semibold text-ink">Shared updates</h2></div><p className="mt-1 text-sm text-muted">The latest movement across your deliveries.</p></header>
          <div className="divide-y divide-line/70">
            {updates.map(task => <Link key={task.id} to={taskPath(task)} className="group flex min-h-16 items-center justify-between gap-4 px-4 py-3 transition-colors duration-160 hover:bg-inset sm:px-5"><span className="min-w-0"><span data-i18n-skip className="block truncate text-sm font-medium text-ink">{task.title}</span><span className="mt-1 block text-xs text-muted">{getClientDeliveryStageLabel(task)}</span></span><span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted"><Clock3 className="h-3.5 w-3.5" />{task.updatedAt ? formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true }) : ''}</span></Link>)}
            {updates.length === 0 && <p className="px-5 py-8 text-sm text-muted">Updates will appear as work progresses.</p>}
          </div>
        </section>
      </div>

      {delivered.length > 0 && (
        <section aria-labelledby="recently-delivered-title">
          <div className="mb-3 flex items-center justify-between"><h2 id="recently-delivered-title" className="font-semibold text-ink">Recently delivered</h2><Link to="/tasks?stage=delivered" className="text-sm font-semibold text-accent">View history</Link></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {delivered.slice(0, 3).map(task => <Link key={task.id} to={taskPath(task)} className="group rounded-panel bg-surface p-4 ring-1 ring-line/80 transition duration-160 hover:-translate-y-0.5 hover:ring-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p data-i18n-skip className="mt-3 truncate text-sm font-semibold text-ink">{task.title}</p><p data-i18n-skip className="mt-1 text-xs text-muted">{task.serviceType}</p></Link>)}
          </div>
        </section>
      )}
    </div>
  );
};

export default ClientPortalDashboard;
