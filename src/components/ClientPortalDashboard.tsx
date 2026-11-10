import React from 'react';
import { DeliveryProgress } from './DeliveryProgress';
import ClientDeliveryFocus from './ClientDeliveryFocus';
import { canReviewTaskAsClient } from '../lib/access';
import { getCycleServiceProgress, isDeliverableWorkDone } from '../lib/serviceManagement';
import { useLocalToday } from '../hooks/useLocalToday';
import { getCurrentPlanCycle, isAwaitingPublication } from '../lib/dashboardData';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileCheck2, MessageSquareText, TimerReset } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Task, WorkspaceMember } from '../types';
import {
  getClientServicePlan,
  getClientDeliveryStage,
  getClientDeliveryStageLabel,
  getClientFocusTask,
  getClientTaskTitle,
  getClientLatestUpdates,
  groupClientDeliveries,
} from '../lib/clientPortal';
import { formatLocalizedDate, type AppLocale } from '../lib/i18n';
import { formatLocalizedDistanceToNow } from '../lib/relativeTime';
import { getLocalizedDeliveryStage } from '../lib/localeLabels';
import { parseOptionalDate } from '../lib/utils';
import { useStore } from '../store';
import { StatusChip, Surface } from './ui';
import { useI18n } from './I18nProvider';

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

const expectedDate = (task: Task, locale: AppLocale, fallback: string) => {
  const dueDate = parseOptionalDate(task.dueDate);
  return dueDate ? formatLocalizedDate(dueDate, locale) : fallback;
};

const ClientPortalDashboard = ({ tasks }: ClientPortalDashboardProps) => {
  const { locale, t } = useI18n();
  const today = useLocalToday();
  const currentUser = useStore(state => state.currentUser);
  const rolePermissions = useStore(state => state.rolePermissions);
  const [reviewTaskId, setReviewTaskId] = React.useState<string | null>(null);
  const clients = useStore(state => state.clients);
  const clientPlans = useStore(state => state.clientPlans);
  const serviceCycles = useStore(state => state.serviceCycles);
  const deliverables = useStore(state => state.deliverables);
  const clientKey = currentUser?.companyName?.trim().toLowerCase();
  const client = clients.find(item => item.clientName.trim().toLowerCase() === clientKey);
  const activePlan = getClientServicePlan(clientPlans, client?.id);
  const currentCycle = activePlan ? getCurrentPlanCycle(activePlan, serviceCycles, today) : undefined;
  const cycleDeliverables = currentCycle ? deliverables.filter(item => item.cycleId === currentCycle.id) : [];
  const deliveredCount = cycleDeliverables.filter(isDeliverableWorkDone).length;
  // This month at a glance: completed vs planned per service (Ready counts as completed).
  const serviceProgress = currentCycle?.serviceItems?.length ? getCycleServiceProgress(currentCycle, deliverables).filter(item => item.included > 0) : [];
  const groups = groupClientDeliveries(tasks, today);
  const focusTask = getClientFocusTask(tasks, today);
  const focusStage = focusTask ? getClientDeliveryStage(focusTask) : null;
  const reviewQueue = groups.needs_review.filter(task => canReviewTaskAsClient(currentUser, task, rolePermissions));
  const selectedReview = reviewTaskId ? tasks.find(task => task.id === reviewTaskId) || null : null;
  const activeQueue = [...groups.timing_changed, ...groups.in_delivery, ...groups.scheduled]
    .filter(task => task.id !== focusTask?.id)
    .slice(0, 6);
  const updates = getClientLatestUpdates(tasks).filter(task => task.id !== focusTask?.id).slice(0, 5);
  const delivered = getClientLatestUpdates(groups.delivered).slice(0, 5);
  const contactName = () => t('Agency team');
  const latestTeamComment = focusTask?.comments
    ?.filter(comment => comment.userId !== currentUser?.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  const deliveryRow = (task: Task, actionLabel = t('delivery.view')) => (
    <article key={task.id} className="group grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link data-i18n-skip to={taskPath(task)} className="truncate text-sm font-semibold text-ink transition-colors duration-160 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
            {getClientTaskTitle(task)}
          </Link>
          <StatusChip tone={stageTone(task)}>{getLocalizedDeliveryStage(getClientDeliveryStageLabel(task), locale)}</StatusChip>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          <span data-i18n-skip>{task.serviceType}</span> · {contactName()}
          <span> · {expectedDate(task, locale, t('Date to be confirmed'))}</span>
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
          {focusTask ? (
            <div className="relative max-w-3xl">
              <div className="flex items-center gap-2 text-accent">
                {focusStage === 'needs_review' ? <FileCheck2 className="h-4 w-4" /> : focusStage === 'timing_changed' ? <TimerReset className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                <p className="calm-eyebrow text-current">{focusStage === 'needs_review' ? t('clientPortal.needsReview') : focusStage === 'timing_changed' ? t('clientPortal.timingChanged') : t('clientPortal.nextDelivery')}</p>
              </div>
              <h2 id="client-focus-title" data-i18n-skip className="mt-4 max-w-[22ch] text-pretty text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">{getClientTaskTitle(focusTask)}</h2>
              <p className="mt-3 max-w-[62ch] text-pretty text-sm leading-6 text-muted">
                {focusTask.description ? <span data-i18n-skip>{focusTask.description}</span> : t(focusStage === 'needs_review' ? 'clientPortal.deliveryReadyDescription' : 'clientPortal.agencyPreparing')}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <span data-i18n-skip className="font-medium text-ink">{focusTask.serviceType}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{expectedDate(focusTask, locale, t('Date to be confirmed'))}</span>
                <span>{contactName()}</span>
              </div>
              {focusStage === 'timing_changed' && (
                <div className="mt-5 max-w-2xl rounded-control border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">{t('clientPortal.expectedTimingChanged')}</p>
                  <p className="mt-1">{latestTeamComment?.text ? <span data-i18n-skip>{latestTeamComment.text}</span> : <>{t('clientPortal.currentExpectedDate')} {expectedDate(focusTask, locale, t('clientPortal.dateToBeConfirmed'))}. {contactName()} {t('clientPortal.contactForTiming')}</>}</p>
                </div>
              )}
              <Link to={taskPath(focusTask)} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-semibold text-white transition duration-160 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 active:translate-y-px dark:text-[rgb(var(--calm-accent-ink))]">
                {focusStage === 'needs_review' ? t('delivery.review') : t('delivery.view')}<ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="relative py-5">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <h2 id="client-focus-title" className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-ink">{t('clientPortal.youAreCaughtUp')}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{t('clientPortal.newDeliveriesNotice')}</p>
            </div>
          )}
        </Surface>

        <Surface className="p-6">
          <p className="calm-eyebrow">{t('clientPortal.deliveryProgress')}</p>
          <DeliveryProgress published={Boolean(currentCycle)} total={cycleDeliverables.length} delivered={deliveredCount} draft={isAwaitingPublication(client, activePlan, serviceCycles, today)} />
          {serviceProgress.length > 1 && <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-semibold text-muted">{t('This month by service')}</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {serviceProgress.map(item => <li key={item.serviceItemId} className="flex items-center justify-between gap-3">
                <span data-i18n-skip className="min-w-0 truncate text-ink">{item.name}</span>
                <span className="calm-number shrink-0 font-semibold text-ink"><span aria-hidden="true">{item.completed}/{item.included}</span><span className="sr-only">{t('{completed} of {included} completed', { completed: item.completed, included: item.included })}</span></span>
              </li>)}
            </ul>
          </div>}
          {client && activePlan && (
            <Link to={`/clients/${encodeURIComponent(client.id)}`} className="mt-6 inline-flex min-h-11 w-full items-center justify-between rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
              <span data-i18n-skip>{activePlan.name}</span><ArrowRight className="h-4 w-4 text-accent" />
            </Link>
          )}
        </Surface>
      </section>

      <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby="needs-review-title">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
          <div><h2 id="needs-review-title" className="font-semibold text-ink">{t('Waiting on you')}</h2><p className="mt-1 text-sm text-muted">{t('clientPortal.reviewCount', { count: reviewQueue.length })}</p></div>
          {groups.needs_review.length > 0 && <Link to="/tasks?stage=needs_review" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">{t('clientPortal.viewAllReviews', { count: groups.needs_review.length })}<ArrowRight className="h-4 w-4" /></Link>}
        </header>
        <div className="divide-y divide-line/70">
          {reviewQueue.map(task => <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div><p data-i18n-skip className="font-semibold text-ink">{getClientTaskTitle(task)}</p><p className="mt-1 text-xs text-muted"><span data-i18n-skip>{task.serviceType}</span> · {expectedDate(task, locale, t('Date to be confirmed'))}</p></div>
            <button type="button" onClick={() => setReviewTaskId(task.id)} className="min-h-11 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{t('Review deliverable')} <ArrowRight className="ml-1 inline h-4 w-4" /></button>
          </article>)}
          {reviewQueue.length === 0 && <p className="px-5 py-8 text-sm text-muted">{t('clientPortal.nothingWaiting')}</p>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
        <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby="in-delivery-title">
          <header className="border-b border-line/70 px-4 py-4 sm:px-5"><h2 id="in-delivery-title" className="font-semibold text-ink">{t('clientPortal.inDelivery')}</h2><p className="mt-1 text-sm text-muted">{t('clientPortal.expectedWork')}</p></header>
          <div className="divide-y divide-line/70">{activeQueue.map(task => deliveryRow(task))}{activeQueue.length === 0 && <p className="px-5 py-8 text-sm text-muted">{t('clientPortal.noActiveDeliveries')}</p>}</div>
        </section>

        <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby="shared-updates-title">
          <header className="border-b border-line/70 px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-accent" /><h2 id="shared-updates-title" className="font-semibold text-ink">{t('clientPortal.sharedUpdates')}</h2></div><p className="mt-1 text-sm text-muted">{t('clientPortal.latestMovement')}</p></header>
          <div className="divide-y divide-line/70">
            {updates.map(task => <Link key={task.id} to={taskPath(task)} className="group flex min-h-16 items-center justify-between gap-4 px-4 py-3 transition-colors duration-160 hover:bg-inset sm:px-5"><span className="min-w-0"><span data-i18n-skip className="block truncate text-sm font-medium text-ink">{getClientTaskTitle(task)}</span><span className="mt-1 block text-xs text-muted">{getLocalizedDeliveryStage(getClientDeliveryStageLabel(task), locale)}</span></span><span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted"><Clock3 className="h-3.5 w-3.5" />{task.updatedAt ? formatLocalizedDistanceToNow(new Date(task.updatedAt), locale) : ''}</span></Link>)}
            {updates.length === 0 && <p className="px-5 py-8 text-sm text-muted">{t('clientPortal.updatesProgress')}</p>}
          </div>
        </section>
      </div>

      {delivered.length > 0 && (
        <section aria-labelledby="recently-delivered-title">
          <div className="mb-3 flex items-center justify-between"><h2 id="recently-delivered-title" className="font-semibold text-ink">{t('clientPortal.recentlyDelivered')}</h2><Link to="/tasks?stage=delivered" className="text-sm font-semibold text-accent">{t('clientPortal.viewHistory')}</Link></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {delivered.slice(0, 3).map(task => <Link key={task.id} to={taskPath(task)} className="group rounded-panel bg-surface p-4 ring-1 ring-line/80 transition duration-160 hover:-translate-y-0.5 hover:ring-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p data-i18n-skip className="mt-3 truncate text-sm font-semibold text-ink">{getClientTaskTitle(task)}</p><p data-i18n-skip className="mt-1 text-xs text-muted">{task.serviceType}</p></Link>)}
          </div>
        </section>
      )}
      <ClientDeliveryFocus task={selectedReview} onClose={() => setReviewTaskId(null)} />
    </div>
  );
};

export default ClientPortalDashboard;
