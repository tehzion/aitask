import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileCheck2, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isBefore } from 'date-fns/isBefore';
import { isToday } from 'date-fns/isToday';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { canViewServicePrices, getClientKey, getDashboardPersona, getOwnedPortfolioClientKeys, getVisibleClientNames, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { formatMoney } from '../lib/serviceManagement';
import { parseOptionalDate } from '../lib/utils';
import { isTaskCompleted } from '../lib/taskCompletion';
import { isTaskOpen } from '../lib/taskReporting';
import { CountLabel, DataRow, MetricStrip, ProgressBar, StatGroup, StatusChip, Surface } from './ui';
import { formatLocalizedDate } from '../lib/i18n';
import { useI18n } from './I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import { getContractDaysRemaining, getPlanDeliverySummary, getCompanyTaskActivity } from '../lib/dashboardData';
import { assessProjectHealth, getPersonalReviewQueues, getPortfolioReviewQueues } from '../lib/pmDashboard';
import { projectStatus } from '../lib/projectManagement';
import { getCyclePace, type CyclePace } from '../lib/opsSignals';
import NeedsMyAttention from './NeedsMyAttention';
import RenewalSignals from './RenewalSignals';
import StuckWorkPanel from './StuckWorkPanel';

type WorkspaceTask = ReturnType<typeof useStore.getState>['tasks'][number];

const DeliveryReviewPanel = React.lazy(() => import('./DeliveryReviewPanel'));

const WorkbenchHeader = ({ id, title, description, action }: { id: string; title: string; description: string; action?: React.ReactNode }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div><h2 id={id} className="text-xl font-semibold tracking-[-0.025em] text-ink">{title}</h2><p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted">{description}</p></div>
    {action}
  </div>
);

const SpotlightMetric = ({ label, value, icon: Icon, detail, tone = 'accent' }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; detail: React.ReactNode; tone?: 'accent' | 'danger' }) => (
  <div className={`calm-raised min-h-44 border-l-2 p-5 sm:p-6 ${tone === 'danger' ? 'border-red-500' : 'border-accent'}`}>
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted">{label}</p><span className={tone === 'danger' ? 'rounded-control bg-red-50 p-2 text-red-700' : 'rounded-control bg-accent-soft p-2 text-accent'}><Icon className="h-5 w-5" /></span></div>
      <div><p className="calm-number text-4xl font-semibold tracking-[-0.055em] text-ink">{value}</p><p className="mt-2 text-xs leading-5 text-muted">{detail}</p></div>
    </div>
  </div>
);

const CompactStat = ({ label, value, icon: Icon, tone = 'neutral' }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: 'neutral' | 'danger' | 'warning' | 'success' }) => {
  const toneClass = tone === 'danger' ? 'bg-red-50 text-red-700' : tone === 'warning' ? 'bg-amber-50 text-amber-700' : tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-soft text-accent';
  return <div className="min-h-36 p-5"><div className={`inline-flex rounded-control p-2 ${toneClass}`}><Icon className="h-4 w-4" /></div><p className="calm-number mt-5 text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</p><p className="mt-1 text-xs font-medium text-muted">{label}</p></div>;
};

const paceDisplay: Record<CyclePace, { label: string; tone: 'emerald' | 'amber' | 'red' }> = {
  done: { label: 'All delivered', tone: 'emerald' },
  onTrack: { label: 'On track', tone: 'emerald' },
  atRisk: { label: 'At risk', tone: 'amber' },
  missed: { label: 'Missed', tone: 'red' },
};

const PaceChip = ({ pace }: { pace: CyclePace }) => {
  const { t } = useI18n();
  return <StatusChip tone={paceDisplay[pace].tone}>{t(paceDisplay[pace].label)}</StatusChip>;
};

const TaskQueue = ({ title, tasks, empty }: { title: string; tasks: WorkspaceTask[]; empty: string }) => (
  <TaskQueueContent title={title} tasks={tasks} empty={empty} />
);

const TaskQueueContent = ({ title, tasks, empty }: { title: string; tasks: WorkspaceTask[]; empty: string }) => {
  const { locale, t } = useI18n();
  const users = useStore(state => state.users);
  return <Surface className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{title}</h3><CountLabel>{tasks.length}</CountLabel></div>
    <div className="divide-y divide-line/60">
      {tasks.slice(0, 6).map(task => {
        const dueDate = parseOptionalDate(task.dueDate);
        const assignmentOverdue = task.assignmentState === 'pending_hod' && Boolean(dueDate && isBefore(dueDate, new Date()) && isTaskOpen(task));
        return <DataRow
          key={task.id}
          titleI18nSkip={false}
          descriptionI18nSkip={false}
          title={<Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="hover:text-accent"><span data-i18n-skip>{task.title}</span></Link>}
          description={<><span data-i18n-skip>{task.clientName}</span> · {dueDate ? formatLocalizedDate(dueDate, locale) : t('No deadline')}</>}
          meta={task.responsibleHodId
            ? `${t('Responsible HOD')}: ${users.find(user => user.id === task.responsibleHodId)?.name || t('Unavailable member')} · ${t(task.assignmentState === 'assigned_staff' ? 'Assigned to Staff' : task.assignmentState === 'pending_hod' ? 'Pending HOD Assignment' : 'Awaiting HOD')}${assignmentOverdue ? ` · ${t('Overdue assignment')}` : ''}`
            : task.assignedTo ? t('Assigned') : t('Unassigned')}
          action={<StatusChip tone={task.isCompleted ? 'emerald' : task.status === 'Waiting Approval' ? 'amber' : 'slate'}>{t(task.status)}</StatusChip>}
        />;
      })}
      {tasks.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>}
    </div>
  </Surface>
};

const CompanyTaskActivity = ({ activity }: { activity: ReturnType<typeof getCompanyTaskActivity> }) => {
  const { t } = useI18n();
  const renderHandler = (handler: typeof activity.handlers[number]) => <li key={handler.id} className="flex items-start justify-between gap-3">
    <span className="min-w-0 break-words">{handler.name ? <span data-i18n-skip>{handler.name}</span> : t('Assigned member unavailable')}</span>
    <span className="shrink-0">{handler.open} {t('open tasks')}</span>
  </li>;
  return <div className="mt-3 border-t border-line/60 pt-3 text-xs text-muted">
    <p className="font-medium text-ink">{t('Tasks completed this month')}: <span className="calm-number">{activity.completedThisMonth}</span></p>
    {activity.completionDateUnavailable > 0 && <p className="mt-1">{t('Completion date unavailable')}: {activity.completionDateUnavailable}</p>}
    <p className="mt-2 font-medium text-ink">{t('Currently handled by')}</p>
    <ul className="mt-1 space-y-1">{activity.handlers.slice(0, 3).map(renderHandler)}</ul>
    {activity.handlers.length > 3 && <details className="mt-1">
      <summary className="cursor-pointer py-2 font-medium text-accent">{t('Show more handlers')} ({activity.handlers.length - 3})</summary>
      <ul className="space-y-1">{activity.handlers.slice(3).map(renderHandler)}</ul>
    </details>}
    {activity.unassignedOpen > 0 && <p className="mt-1">{t('Unassigned open tasks')}: {activity.unassignedOpen}</p>}
    {activity.handlers.length === 0 && activity.unassignedOpen === 0 && <p className="mt-1">{t('No open company tasks')}</p>}
    <p className="mt-2">{t('Company-wide task activity; separate from plan delivery progress.')}</p>
  </div>;
};

const ServiceRoleDashboard = () => {
  const store = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    tasks: state.tasks,
    clients: state.clients,
    projects: state.projects,
    clientPlans: state.clientPlans,
    servicePricingSnapshots: state.servicePricingSnapshots,
    deliverables: state.deliverables,
    serviceCycles: state.serviceCycles,
    users: state.users,
  })));
  const { locale, t } = useI18n();
  const persona = getDashboardPersona(store.currentUser);
  const canSeePrices = canViewServicePrices(store.currentUser, store.rolePermissions);
  const now = useLocalToday();
  const visibleTasks = React.useMemo(
    () => getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions, { clients: store.clients, projects: store.projects }),
    [store.currentUser, store.rolePermissions, store.tasks, store.clients, store.projects],
  );
  const visibleProjects = React.useMemo(
    () => getVisibleProjects(store.currentUser, store.projects, store.tasks, store.rolePermissions, { clients: store.clients, projects: store.projects }),
    [store.currentUser, store.rolePermissions, store.tasks, store.clients, store.projects],
  );
  const visibleClientKeys = React.useMemo(() => new Set(
    getVisibleClientNames(store.currentUser, store.tasks, store.projects, store.rolePermissions, { clients: store.clients, projects: store.projects }).map(getClientKey)
  ), [store.currentUser, store.projects, store.rolePermissions, store.tasks, store.clients]);
  // Assigned projects determine the PM's delivery and commercial scope.
  const commercialClientKeys = React.useMemo(
    () => persona === 'projectManager' && store.currentUser
      ? getOwnedPortfolioClientKeys(store.currentUser, { clients: store.clients, projects: store.projects })
      : visibleClientKeys,
    [persona, store.currentUser, store.clients, store.projects, visibleClientKeys],
  );
  const serviceTasks = visibleTasks.filter(task => Boolean(task.clientId));
  const myTasks = serviceTasks.filter(task => task.assignedTo === store.currentUser?.id);
  // Project Manager visibility already applies their portfolio boundary and
  // also includes directly created/assigned legacy or independent tasks that
  // may not have a clientId. Keep those tasks in the PM's delivery queues.
  const scopeTasks = persona === 'production'
    ? myTasks
    : persona === 'boss' || persona === 'projectManager'
      ? visibleTasks
      : serviceTasks;
  const overdue = scopeTasks.filter(task => { const due = parseOptionalDate(task.dueDate); return Boolean(due && isTaskOpen(task) && isBefore(due, now) && !isToday(due)); });
  const dueToday = scopeTasks.filter(task => { const due = parseOptionalDate(task.dueDate); return Boolean(due && isTaskOpen(task) && isToday(due)); });
  const activePlans = store.clientPlans.filter(plan => plan.status === 'Active' && commercialClientKeys.has(getClientKey(plan.clientName)));
  const contractedMonthly = canSeePrices ? activePlans.reduce((sum, plan) => sum + (store.servicePricingSnapshots.find(item => item.parentType === 'client_plan' && item.parentId === plan.id)?.totalMinor || 0), 0) : 0;
  const delivered = store.deliverables.filter(item => item.status === 'Delivered' && commercialClientKeys.has(getClientKey(item.clientName)));
  const portfolioReviews = getPortfolioReviewQueues(scopeTasks);
  const waitingInternal = portfolioReviews.internal;
  const waitingClient = portfolioReviews.client;
  const awaitingStaffAssignment = scopeTasks.filter(task => isTaskOpen(task) && task.assignmentState === 'pending_hod');
  const revisions = scopeTasks.filter(task => task.revisionCount > 0 && isTaskOpen(task));
  const completed = scopeTasks.filter(isTaskCompleted);
  const renewalPlans = activePlans.filter(plan => plan.contractEndDate).sort((a, b) => (a.contractEndDate || '').localeCompare(b.contractEndDate || ''));
  const workers = store.users.filter(user => user.role === 'Staff' || user.role === 'HOD').map(user => ({
    user,
    open: serviceTasks.filter(task => task.assignedTo === user.id && isTaskOpen(task)).length,
    completed: serviceTasks.filter(task => task.assignedTo === user.id && isTaskCompleted(task)).length,
    delivered: delivered.filter(item => serviceTasks.some(task => task.assignedTo === user.id && task.deliverableId === item.id)).length,
  }));
  const activeCompanies = React.useMemo(() => activePlans.map(plan => {
    return {
      clientId: plan.clientId,
      clientName: plan.clientName,
      plan,
      ...getPlanDeliverySummary(plan, store.serviceCycles, store.deliverables, visibleTasks, now),
      taskActivity: getCompanyTaskActivity(plan.clientId, visibleTasks, store.users, now),
    };
  }).map(item => ({ ...item, pace: item.currentCycle ? getCyclePace(item.currentCycle, item.delivered, item.total, now) : undefined })),
  [activePlans, store.deliverables, store.serviceCycles, visibleTasks, store.users, now]);
  const plansAtRisk = activeCompanies.filter(item => item.pace === 'atRisk' || item.pace === 'missed');
  const renewingSoon = renewalPlans
    .map(plan => ({ plan, days: getContractDaysRemaining(plan.contractEndDate, now) }))
    .filter((item): item is { plan: typeof item.plan; days: number } => item.days !== null && item.days >= 0 && item.days <= 30);

  if (persona === 'client') return null;

  if (persona === 'production') {
    const open = myTasks.filter(isTaskOpen);
    return <section className="space-y-5" aria-labelledby="production-workbench-title">
      <WorkbenchHeader id="production-workbench-title" title={t('Assigned production work')} description={t('Deadlines, revisions, review queues, and completed output.')} />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label={t('My open tasks')} value={open.length} icon={Clock3} detail={t('Only tasks assigned to you are included.')} /><StatGroup className="grid-cols-3"><CompactStat label={t('Overdue')} value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label={t('Revisions')} value={revisions.length} icon={FileCheck2} tone="warning" /><CompactStat label={t('Completed')} value={completed.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]"><TaskQueue title={t('Deadline')} tasks={[...open].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))} empty={t('No assigned deadlines.')} /><TaskQueue title={t('Revision / internal review')} tasks={[...revisions, ...waitingInternal.filter(task => !revisions.some(item => item.id === task.id))]} empty={t('No revision or review work.')} /></div>
      <React.Suspense fallback={null}><DeliveryReviewPanel /></React.Suspense>
  </section>;
  }

  if (persona === 'operation') return <section className="space-y-5" aria-labelledby="operation-workbench-title">
    <WorkbenchHeader id="operation-workbench-title" title={t('Production queue')} description={t('Delivery deadlines, review handoffs, and team workload.')} action={<Link to="/calendar" className="inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft"><CalendarDays className="h-4 w-4" />{t('Open schedule')}</Link>} />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label={t('Due today')} value={dueToday.length} icon={Clock3} detail={<>{overdue.length} {t('overdue tasks require attention.')}</>} /><StatGroup className="grid-cols-3"><CompactStat label={t('Overdue')} value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label={t('Internal review')} value={waitingInternal.length} icon={FileCheck2} tone="warning" /><CompactStat label={t('Client approval')} value={waitingClient.length} icon={UsersRound} /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-3"><TaskQueue title={t('Urgent today')} tasks={[...overdue, ...dueToday]} empty={t('No urgent production work.')} /><TaskQueue title={t('Internal review')} tasks={waitingInternal} empty={t('The internal review queue is clear.')} /><TaskQueue title={t('Client approval')} tasks={waitingClient} empty={t('No client approval is waiting.')} /></div>
    <Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{t('Team handoffs')}</h3><p className="mt-1 text-sm text-muted">{t('Open work and delivered output by person.')}</p></div><div className="grid divide-y divide-line/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">{workers.slice(0, 4).map(item => <div key={item.user.id} className="p-4"><p data-i18n-skip className="font-semibold text-ink">{item.user.name}</p><p className="mt-1 text-xs text-muted">{item.open} {t('open')} · {item.completed} {t('completed')}</p><ProgressBar className="mt-4" label={t('Delivered output')} value={item.delivered} max={Math.max(1, item.completed)} /></div>)}</div></Surface>
    <React.Suspense fallback={null}><DeliveryReviewPanel /></React.Suspense>
  </section>;

  if (persona === 'account') return <section className="space-y-5" aria-labelledby="account-workbench-title">
    <WorkbenchHeader id="account-workbench-title" title={t('Accounts')} description={t('Client plans, renewals, commercial records, and delivery output.')} />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label={t('Monthly management value')} value={canSeePrices ? formatMoney(contractedMonthly, 'MYR', locale) : t('Restricted')} icon={WalletCards} detail={<>{activePlans.length} {t(activePlans.length === 1 ? 'active client package.' : 'active client packages.')}</>} /><StatGroup className="grid-cols-3"><CompactStat label={t('Active packages')} value={activePlans.length} icon={UsersRound} /><CompactStat label={t('Contract reminders')} value={renewalPlans.length} icon={CalendarDays} tone="warning" /><CompactStat label={t('Delivered outputs')} value={delivered.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-2"><Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{t('Plans and renewals')}</h3></div><div className="divide-y divide-line/60">{activePlans.map(plan => { const contractEnd = parseOptionalDate(plan.contractEndDate); return <DataRow key={plan.id} titleI18nSkip={false} descriptionI18nSkip={false} title={<Link to={`/clients/${encodeURIComponent(plan.clientId)}`} className="hover:text-accent"><span data-i18n-skip>{plan.clientName}</span></Link>} description={<><span data-i18n-skip>{plan.name}</span> · {t('renewal')} {contractEnd ? formatLocalizedDate(contractEnd, locale) : t('not set')}</>} action={canSeePrices ? <span className="calm-number text-sm font-semibold text-ink">{formatMoney(store.servicePricingSnapshots.find(item => item.parentId === plan.id)?.totalMinor || 0, 'MYR', locale)}</span> : undefined} />; })}</div></Surface><Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{t('Delivery output by worker')}</h3></div><div className="divide-y divide-line/60">{workers.map(item => <DataRow key={item.user.id} titleI18nSkip={false} descriptionI18nSkip={false} title={<span data-i18n-skip>{item.user.name}</span>} description={<span data-i18n-skip>{item.user.workerType || t('employee')}</span>} action={<span className="calm-number text-xs text-muted">{item.completed} {t('tasks')} · {item.delivered} {t('delivered')}</span>} />)}</div></Surface></div>
    <React.Suspense fallback={null}><DeliveryReviewPanel /></React.Suspense>
  </section>;

  if (persona === 'projectManager') {
    // Decisions for this PM only: reviews in their lane and work they can finalize.
    const personal = getPersonalReviewQueues(scopeTasks, { user: store.currentUser, users: store.users, roles: store.rolePermissions, scope: { clients: store.clients, projects: store.projects, users: store.users } });
    const urgent = [...overdue, ...dueToday].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const waitingOnOthers = [
      { title: t('With department review'), tasks: personal.department },
      { title: t('Awaiting Staff Assignment'), tasks: awaitingStaffAssignment },
      { title: t('Client review (optional)'), tasks: personal.client },
    ].filter(item => item.tasks.length > 0);
    const projectRows = visibleProjects
      .filter(project => projectStatus(project) !== 'Closed')
      .map(project => ({ project, health: assessProjectHealth(project, visibleTasks, now) }))
      .sort((left, right) => {
        const rank = { atRisk: 0, attentionRequired: 1, onTrack: 2 } as const;
        return rank[left.health.health] - rank[right.health.health] || right.health.overdueCount - left.health.overdueCount;
      });
    return <section className="space-y-6" aria-labelledby="portfolio-workbench-title">
      <h2 id="portfolio-workbench-title" className="sr-only">{t('Portfolio delivery')}</h2>
      <MetricStrip label={t('Portfolio summary')} items={[
        { label: t('Open tasks'), value: scopeTasks.filter(isTaskOpen).length, to: '/tasks' },
        { label: t('Overdue'), value: overdue.length, to: '/tasks?queue=needs_action', tone: 'danger' },
        { label: t('Awaiting your review'), value: personal.mine.length, to: '/tasks?queue=needs_action', tone: 'warning' },
        { label: t('Ready to finalize'), value: personal.completion.length, to: '/tasks?queue=needs_action', tone: 'warning' },
      ]} />
      <section aria-labelledby="pm-action-title" className="space-y-3">
        <h2 id="pm-action-title" className="text-lg font-semibold text-ink">{t('Requires your action')}</h2>
        <div className="grid gap-4 xl:grid-cols-3">
          <TaskQueue title={t('Awaiting your review')} tasks={personal.mine} empty={t('Nothing is waiting for your review.')} />
          <TaskQueue title={t('Ready to finalize')} tasks={personal.completion} empty={t('No tasks awaiting final completion.')} />
          <TaskQueue title={t('Due today / overdue')} tasks={urgent} empty={t('No urgent portfolio delivery work.')} />
        </div>
      </section>
      {/* Unassigned work needs the PM to act, so it is listed here, not under waiting on others. */}
      <StuckWorkPanel tasks={scopeTasks} />
      {plansAtRisk.length > 0 && <Surface className="overflow-hidden" aria-labelledby="pm-plans-risk-title">
        <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div><h3 id="pm-plans-risk-title" className="font-semibold text-ink">{t('Monthly plans at risk')}</h3><p className="mt-1 text-sm text-muted">{t('Deliveries are behind the calendar for this month.')}</p></div>
          <CountLabel>{plansAtRisk.length}</CountLabel>
        </div>
        <ul className="divide-y divide-line/60">{plansAtRisk.map(item => <li key={item.plan.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link to={`/clients/${encodeURIComponent(item.clientId)}`} className="min-w-0 truncate text-sm font-semibold text-ink hover:text-accent"><span data-i18n-skip>{item.clientName}</span></Link>
          <span className="flex items-center gap-2 text-xs text-muted">{item.delivered}/{item.total} {t('Delivered')} {item.pace && <PaceChip pace={item.pace} />}</span>
        </li>)}</ul>
      </Surface>}
      {renewingSoon.length > 0 && <Surface className="overflow-hidden" aria-labelledby="pm-renewals-title">
        <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div><h3 id="pm-renewals-title" className="font-semibold text-ink">{t('Renewals in the next 30 days')}</h3><p className="mt-1 text-sm text-muted">{t('Their recent delivery record, to prepare the renewal conversation.')}</p></div>
          <CountLabel>{renewingSoon.length}</CountLabel>
        </div>
        <ul className="divide-y divide-line/60">{renewingSoon.map(({ plan, days }) => <li key={plan.id} className="flex items-start justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <Link to={`/clients/${encodeURIComponent(plan.clientId)}`} className="block truncate text-sm font-semibold text-ink hover:text-accent"><span data-i18n-skip>{plan.clientName} · {plan.name}</span></Link>
            <RenewalSignals plan={plan} />
          </div>
          <StatusChip tone={days <= 7 ? 'red' : 'amber'}>{days === 0 ? t('Ends today') : `${days} ${t('days left')}`}</StatusChip>
        </li>)}</ul>
      </Surface>}
      <NeedsMyAttention excludeProjectRisks taskDecisions={false} hideWhenEmpty />
      {waitingOnOthers.length > 0 && <section aria-labelledby="pm-waiting-title" className="space-y-3">
        <div><h2 id="pm-waiting-title" className="text-lg font-semibold text-ink">{t('Waiting on others')}</h2><p className="mt-1 text-sm text-muted">{t('Follow up if these stall. No decision is needed from you yet.')}</p></div>
        <div className="grid gap-4 xl:grid-cols-2">
          {waitingOnOthers.map(item => <TaskQueue key={item.title} title={item.title} tasks={item.tasks} empty="" />)}
        </div>
      </section>}
      <Surface className="overflow-hidden" aria-labelledby="project-health-title">
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
          <div><h3 id="project-health-title" className="font-semibold text-ink">{t('Your projects')}</h3><p className="mt-1 text-sm text-muted">{t('Riskiest first. Open a project to see its tasks.')}</p></div>
          <CountLabel>{projectRows.length}</CountLabel>
        </div>
        <div className="divide-y divide-line/60">
          {projectRows.slice(0, 6).map(({ project, health }) => {
            const tone = health.health === 'atRisk' ? 'red' : health.health === 'attentionRequired' ? 'amber' : 'emerald';
            const label = health.health === 'atRisk' ? 'At risk' : health.health === 'attentionRequired' ? 'Attention required' : 'On track';
            return <div key={project.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(230px,0.9fr)] sm:items-center sm:px-5">
              <div className="min-w-0">
                <Link to={`/tasks?project=${encodeURIComponent(project.projectName)}`} className="truncate text-sm font-semibold text-ink hover:text-accent"><span data-i18n-skip>{project.projectName}</span></Link>
                <p className="mt-1 truncate text-xs text-muted"><span data-i18n-skip>{project.clientName}</span> · {t('Next deadline')}: {health.nextDueDate ? formatLocalizedDate(parseOptionalDate(health.nextDueDate)!, locale) : t('No deadline')}</p>
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <StatusChip tone={tone}>{t(label)}</StatusChip>
                  <span className="text-xs text-muted">{health.completedCount}/{health.taskCount} {t('tasks complete')}</span>
                </div>
                <ProgressBar label={`${t('Task progress')} ${health.progressPercent ?? 0}%`} value={health.progressPercent ?? 0} max={100} />
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>{health.openCount} {t('open tasks')}</span>
                  {health.overdueCount > 0 && <span className="text-red-700">{health.overdueCount} {t('overdue')}</span>}
                  {health.pendingApprovalCount > 0 && <span>{health.pendingApprovalCount} {t('pending reviews')}</span>}
                </div>
              </div>
            </div>;
          })}
          {projectRows.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t('No projects are assigned to you yet.')}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-5 py-3 text-sm">
          <Link to="/projects" className="font-semibold text-accent hover:underline">{projectRows.length > 6 ? `${t('View all projects')} (${projectRows.length})` : t('View companies and projects')}</Link>
          <Link to="/clients" className="font-semibold text-accent hover:underline">{t('Monthly deliverables in Delivery tracker')}</Link>
        </div>
      </Surface>
      <Surface variant="inset" className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-sm font-semibold text-ink">{t('Commercial summary')}</p><p className="mt-0.5 text-xs text-muted">{activePlans.length} {t(activePlans.length === 1 ? 'active client package.' : 'active client packages.')}</p></div><p className="calm-number text-xl font-semibold text-ink">{canSeePrices ? formatMoney(contractedMonthly, 'MYR', locale) : t('Restricted')}</p></Surface>
      <React.Suspense fallback={null}><DeliveryReviewPanel /></React.Suspense>
    </section>;
  }

  return <section className="space-y-4" aria-labelledby="management-workbench-title">
    <WorkbenchHeader id="management-workbench-title" title={t('Company operations')} description={t('Contract value and current-cycle delivery for each active company.')} />
    <MetricStrip label={t('Company operations')} items={[
      { label: t('Contracted monthly value'), value: formatMoney(contractedMonthly, 'MYR', locale) },
      { label: t('Active clients'), value: activePlans.length, to: '/clients' },
      { label: t('Delivered outputs'), value: delivered.length, to: '/clients' },
      { label: t('Plans at risk this month'), value: plansAtRisk.length, to: '/clients', tone: plansAtRisk.length ? 'danger' : undefined },
    ]} />
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
        <div><h3 className="font-semibold text-ink">{t('Monthly deliverables')}</h3><p className="mt-1 text-sm text-muted">{t('Current cycle delivery progress for each active company.')}</p></div>
        <CountLabel>{activeCompanies.length}</CountLabel>
      </div>
      <div className="divide-y divide-line/60">
        {activeCompanies.map(item => (
          <div key={item.plan.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,auto)] sm:items-center sm:px-5">
            <div className="min-w-0">
              <Link to={`/clients/${encodeURIComponent(item.clientId)}`} data-i18n-skip className="truncate text-sm font-semibold text-ink hover:text-accent">{item.clientName}</Link>
              <p className="mt-1 truncate text-xs text-muted"><span data-i18n-skip>{item.plan.name}</span>{item.currentCycle ? <> · {formatLocalizedDate(parseOptionalDate(item.currentCycle.periodStart)!, locale)} – {formatLocalizedDate(parseOptionalDate(item.currentCycle.periodEnd)!, locale)}</> : <> · {t(item.draftCycle ? 'Current cycle not published' : 'No published cycle covering today')}</>}</p>
            </div>
            <div className="min-w-0">
              {item.currentCycle && item.total > 0 ? <>
              {item.pace && <div className="mb-1.5"><PaceChip pace={item.pace} /></div>}
              <ProgressBar className="mb-1.5" label={`${t('Deliverables')} ${item.delivered}/${item.total}`} value={item.delivered} max={Math.max(item.total, 1)} />
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                <StatusChip tone="emerald">{item.delivered} {t('Delivered')}</StatusChip>
                <StatusChip tone="blue">{item.ready} {t('Ready')}</StatusChip>
                <StatusChip tone="indigo">{item.inProgress} {t('In Progress')}</StatusChip>
                <StatusChip tone="slate">{item.planned} {t('Planned')}</StatusChip>
              </div>
              </> : <StatusChip tone="slate">{t(item.draftCycle
                ? 'Awaiting publication'
                : item.currentCycle ? 'No deliverables in this cycle' : 'No current published cycle')}</StatusChip>}
              <CompanyTaskActivity activity={item.taskActivity} />
              {item.currentCycle && item.total > 0 && <p className="mt-2 text-xs text-muted">
                {t('Progress counts confirmed deliveries, not completed tasks.')}
              </p>}
            </div>
          </div>
        ))}
        {activeCompanies.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t('No active companies yet.')}</p>}
      </div>
    </Surface>
  </section>;
};

export default ServiceRoleDashboard;
