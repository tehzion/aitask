import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { canManageServiceCycles, getDashboardPersona, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { getManagementAttentionItems, type ManagementAttentionItem } from '../lib/managementIntelligence';
import { getPersonalReviewQueues } from '../lib/pmDashboard';
import { formatLocalizedDate } from '../lib/i18n';
import { parseOptionalDate, cn } from '../lib/utils';
import { useI18n } from './I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import { cardBase } from './uiTokens';
import { Button } from './ui';
import SystemMessage from './SystemMessage';

const severityStyles = {
  critical: { icon: AlertTriangle, className: 'text-red-700 dark:text-red-300' },
  attention: { icon: Clock3, className: 'text-amber-700 dark:text-amber-300' },
  information: { icon: Info, className: 'text-muted' },
} as const;

type Translate = ReturnType<typeof useI18n>['t'];

// Compose the line from structured fields so it localizes; record names stay verbatim.
const describeItem = (item: ManagementAttentionItem, t: Translate) => {
  switch (item.kind) {
    case 'projectRisk': return `${t('At risk')} · ${item.overdueCount ?? 0} ${t('overdue')} · ${item.openCount ?? 0} ${t('open tasks')}`;
    case 'review': return t('Awaiting your review');
    case 'completion': return t('Ready to finalize');
    case 'renewal': return t('Renewal due');
    case 'deliverable': return t('Service cycle ended before delivery');
    case 'clientReview': return t('Ready for your review');
    default: return item.blocked ? t('Blocked work') : item.waitingReview ? t('Waiting review') : item.revisionCount ? `${t('Revision')} ${item.revisionCount}` : '';
  }
};

/**
 * Marks a past deliverable delivered in one step. Linking tasks is optional:
 * the PM's confirmation is what counts. A month that was never published is
 * published first, since only a published month can record a delivery.
 */
const MarkDelivered: React.FC<{ deliverableId: string; title: string }> = ({ deliverableId, title }) => {
  const { t } = useI18n();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const store = useStore.getState();
      const deliverable = store.deliverables.find(item => item.id === deliverableId);
      const cycle = store.serviceCycles.find(item => item.id === deliverable?.cycleId);
      if (cycle?.status === 'Draft') {
        const published = store.setServiceCycleStatus(cycle.id, 'Published');
        if (!published.ok) { setError(published.error || 'Unable to publish this month.'); return; }
        const saved = await useStore.getState().commitPendingMutation('service_cycle.manage');
        if (!saved.ok) { setError(saved.error || 'The month is waiting to be published.'); return; }
      }
      const delivered = useStore.getState().updateDeliverableStatus(deliverableId, 'Delivered');
      if (!delivered.ok) { setError(delivered.error || 'Unable to mark this delivered.'); return; }
      const saved = await useStore.getState().commitPendingMutation('deliverable.manage');
      if (!saved.ok) setError(saved.error || 'The delivery is waiting to be saved.');
    } finally {
      setBusy(false);
    }
  };
  return <span className="flex shrink-0 flex-col items-end gap-1">
    <Button variant="secondary" disabled={busy} onClick={() => void run()} aria-label={t('Mark {title} delivered', { title })}>{busy ? t('Saving…') : t('Mark delivered')}</Button>
    {error && <span role="alert" className="max-w-56 text-right text-xs text-red-700"><SystemMessage message={t(error)} /></span>}
  </span>;
};

type NeedsMyAttentionProps = {
  /** Set when the page already lists project risk next to this panel. */
  excludeProjectRisks?: boolean;
  /** Set to false when the page shows its own review and completion queues. */
  taskDecisions?: boolean;
  hideWhenEmpty?: boolean;
};

const NeedsMyAttention: React.FC<NeedsMyAttentionProps> = ({ excludeProjectRisks = false, taskDecisions = true, hideWhenEmpty = false }) => {
  const { t, locale } = useI18n();
  const now = useLocalToday();
  const {
    currentUser,
    rolePermissions,
    tasks,
    projects,
    clients,
    deliverables,
    clientPlans,
    serviceCycles,
    users,
  } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    tasks: state.tasks,
    projects: state.projects,
    clients: state.clients,
    deliverables: state.deliverables,
    clientPlans: state.clientPlans,
    serviceCycles: state.serviceCycles,
    users: state.users,
  })));

  const attention = React.useMemo(() => {
    const persona = getDashboardPersona(currentUser);
    if (persona !== 'boss' && persona !== 'projectManager') return null;
    const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects });
    const visibleProjects = getVisibleProjects(currentUser, projects, tasks, rolePermissions, { clients, projects });
    const clientIds = new Set(visibleProjects.map(project => project.clientId).filter(Boolean));
    visibleTasks.forEach(task => { if (task.clientId) clientIds.add(task.clientId); });
    const scopedPlans = persona === 'boss' ? clientPlans : clientPlans.filter(plan => clientIds.has(plan.clientId));
    const scopedCycles = persona === 'boss' ? serviceCycles : serviceCycles.filter(cycle => clientIds.has(cycle.clientId));
    const scopedDeliverables = persona === 'boss' ? deliverables : deliverables.filter(item => clientIds.has(item.clientId));
    // A PM sees only reviews in their own lane; department-lane reviews stay
    // with the HOD and are followed up from the dashboard queues instead.
    const personal = persona === 'projectManager'
      ? getPersonalReviewQueues(visibleTasks, { user: currentUser, users, roles: rolePermissions, scope: { clients, projects, users } })
      : undefined;
    return getManagementAttentionItems({
      persona,
      userId: currentUser?.id,
      projects: visibleProjects,
      tasks: visibleTasks,
      deliverables: scopedDeliverables,
      clientPlans: scopedPlans,
      serviceCycles: scopedCycles,
      now,
      reviewQueue: taskDecisions ? personal?.mine : [],
      completionQueue: taskDecisions ? personal?.completion : [],
      excludeProjectRisks,
    });
  }, [clientPlans, clients, currentUser, deliverables, excludeProjectRisks, now, taskDecisions, projects, rolePermissions, serviceCycles, tasks, users]);

  const canDeliver = canManageServiceCycles(currentUser, rolePermissions);
  if (!attention || (hideWhenEmpty && attention.length === 0)) return null;

  return (
    <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="needs-attention-title">
      <div className="flex flex-col gap-1 border-b border-line/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="needs-attention-title" className="text-base font-semibold text-ink">{t('Needs my attention')}</h2>
          <p className="mt-1 text-sm text-muted">{t('Decisions and risks that need you today.')}</p>
        </div>
        <Link to="/tasks" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent hover:underline">
          {t('Open work')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-line/60">
        {attention.map(item => {
          const style = severityStyles[item.severity];
          const Icon = style.icon;
          const dueDate = parseOptionalDate(item.dueDate);
          const deliverableId = item.kind === 'deliverable' && canDeliver ? item.id.replace(/^deliverable:/, '') : '';
          const row = (
            <Link key={item.id} to={item.to} className="group flex min-w-0 flex-1 items-start gap-3 px-5 py-3 transition-colors hover:bg-inset/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35">
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center', style.className)}><Icon className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t(item.severity === 'critical' ? 'Critical' : item.severity === 'attention' ? 'Attention' : 'Information')}</span></span>
              <span className="min-w-0 flex-1">
                <span data-i18n-skip className="block truncate text-sm font-semibold text-ink">{item.subject}</span>
                <span className="mt-1 block truncate text-xs text-muted">{item.context ? <span data-i18n-skip>{item.context}</span> : null}{item.context && describeItem(item, t) ? ' · ' : ''}{describeItem(item, t)}{dueDate ? ` · ${formatLocalizedDate(dueDate, locale)}` : ''}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          );
          return deliverableId
            ? <div key={item.id} className="flex flex-wrap items-center gap-2 pr-5">{row}<MarkDelivered deliverableId={deliverableId} title={dueDate ? `${item.subject} (${formatLocalizedDate(dueDate, locale)})` : item.subject} /></div>
            : row;
        })}
        {attention.length === 0 && (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-ink">{t('Everything is under control')}</p>
            <p className="mt-1 text-xs text-muted">{t('No urgent work needs your attention right now.')}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default NeedsMyAttention;
