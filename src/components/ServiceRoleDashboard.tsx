import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileCheck2, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isBefore, isToday } from 'date-fns';
import { useStore } from '../store';
import { canViewServicePrices, getClientKey, getDashboardPersona, getVisibleClientNames, getVisibleTasks } from '../lib/access';
import { formatMoney } from '../lib/serviceManagement';
import { parseOptionalDate } from '../lib/utils';
import { isTaskCompleted } from '../lib/taskCompletion';
import { isTaskOpen } from '../lib/taskReporting';
import { CountLabel, DataRow, ProgressBar, StatGroup, StatusChip, Surface } from './ui';
import { formatLocalizedDate } from '../lib/i18n';
import { useI18n } from './I18nProvider';

type WorkspaceTask = ReturnType<typeof useStore.getState>['tasks'][number];

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

const TaskQueue = ({ title, tasks, empty }: { title: string; tasks: WorkspaceTask[]; empty: string }) => (
  <TaskQueueContent title={title} tasks={tasks} empty={empty} />
);

const TaskQueueContent = ({ title, tasks, empty }: { title: string; tasks: WorkspaceTask[]; empty: string }) => {
  const { locale, t } = useI18n();
  return <Surface className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{title}</h3><CountLabel>{tasks.length}</CountLabel></div>
    <div className="divide-y divide-line/60">
      {tasks.slice(0, 6).map(task => {
        const dueDate = parseOptionalDate(task.dueDate);
        return <DataRow
          key={task.id}
          titleI18nSkip={false}
          descriptionI18nSkip={false}
          title={<Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="hover:text-accent"><span data-i18n-skip>{task.title}</span></Link>}
          description={<><span data-i18n-skip>{task.clientName}</span> · {dueDate ? formatLocalizedDate(dueDate, locale) : t('No deadline')}</>}
          meta={task.assignedTo ? t('Assigned') : t('Unassigned')}
          action={<StatusChip tone={task.isCompleted ? 'emerald' : task.status === 'Waiting Approval' ? 'amber' : 'slate'}>{t(task.status)}</StatusChip>}
        />;
      })}
      {tasks.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>}
    </div>
  </Surface>
};

const ServiceRoleDashboard = () => {
  const store = useStore();
  const { locale, t } = useI18n();
  const persona = getDashboardPersona(store.currentUser);
  const canSeePrices = canViewServicePrices(store.currentUser, store.rolePermissions);
  const now = new Date();
  const visibleTasks = React.useMemo(
    () => getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions, { clients: store.clients, projects: store.projects }),
    [store.currentUser, store.rolePermissions, store.tasks, store.clients, store.projects],
  );
  const visibleClientKeys = React.useMemo(() => new Set(
    getVisibleClientNames(store.currentUser, store.tasks, store.projects, store.rolePermissions, { clients: store.clients, projects: store.projects }).map(getClientKey)
  ), [store.currentUser, store.projects, store.rolePermissions, store.tasks, store.clients]);
  const serviceTasks = visibleTasks.filter(task => Boolean(task.clientId));
  const myTasks = serviceTasks.filter(task => task.assignedTo === store.currentUser?.id);
  const scopeTasks = persona === 'production' ? myTasks : persona === 'boss' ? visibleTasks : serviceTasks;
  const overdue = scopeTasks.filter(task => { const due = parseOptionalDate(task.dueDate); return Boolean(due && isTaskOpen(task) && isBefore(due, now) && !isToday(due)); });
  const dueToday = scopeTasks.filter(task => { const due = parseOptionalDate(task.dueDate); return Boolean(due && isTaskOpen(task) && isToday(due)); });
  const activePlans = store.clientPlans.filter(plan => plan.status === 'Active' && visibleClientKeys.has(getClientKey(plan.clientName)));
  const contractedMonthly = canSeePrices ? activePlans.reduce((sum, plan) => sum + (store.servicePricingSnapshots.find(item => item.parentType === 'client_plan' && item.parentId === plan.id)?.totalMinor || 0), 0) : 0;
  const delivered = store.deliverables.filter(item => item.status === 'Delivered' && visibleClientKeys.has(getClientKey(item.clientName)));
  const waitingInternal = scopeTasks.filter(task => task.status === 'Waiting Approval' && task.visibility !== 'client-visible');
  const waitingClient = scopeTasks.filter(task => task.status === 'Waiting Approval' && task.visibility === 'client-visible');
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
    const currentCycle = store.serviceCycles
      .filter(cycle => cycle.clientId === plan.clientId && (cycle.status === 'Published' || cycle.status === 'Completed'))
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
    const cycleDeliverables = currentCycle
      ? store.deliverables.filter(item => item.cycleId === currentCycle.id)
      : [];
    const count = (status: string) => cycleDeliverables.filter(item => item.status === status).length;
    return {
      clientId: plan.clientId,
      clientName: plan.clientName,
      plan,
      currentCycle,
      total: cycleDeliverables.length,
      delivered: count('Delivered'),
      ready: count('Ready'),
      inProgress: count('In Progress'),
      planned: count('Planned'),
    };
  }), [activePlans, store.deliverables, store.serviceCycles]);

  if (persona === 'client') return null;

  if (persona === 'production') {
    const open = myTasks.filter(isTaskOpen);
    return <section className="space-y-5" aria-labelledby="production-workbench-title">
      <WorkbenchHeader id="production-workbench-title" title={t('Assigned production work')} description={t('Deadlines, revisions, review queues, and completed output.')} />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label={t('My open tasks')} value={open.length} icon={Clock3} detail={t('Only tasks assigned to you are included.')} /><StatGroup className="grid-cols-3"><CompactStat label={t('Overdue')} value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label={t('Revisions')} value={revisions.length} icon={FileCheck2} tone="warning" /><CompactStat label={t('Completed')} value={completed.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]"><TaskQueue title={t('Deadline')} tasks={[...open].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))} empty={t('No assigned deadlines.')} /><TaskQueue title={t('Revision / internal review')} tasks={[...revisions, ...waitingInternal.filter(task => !revisions.some(item => item.id === task.id))]} empty={t('No revision or review work.')} /></div>
    </section>;
  }

  if (persona === 'operation') return <section className="space-y-5" aria-labelledby="operation-workbench-title">
    <WorkbenchHeader id="operation-workbench-title" title={t('Production queue')} description={t('Delivery deadlines, review handoffs, and team workload.')} action={<Link to="/calendar" className="inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft"><CalendarDays className="h-4 w-4" />{t('Open schedule')}</Link>} />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label={t('Due today')} value={dueToday.length} icon={Clock3} detail={<>{overdue.length} {t('overdue tasks require attention.')}</>} /><StatGroup className="grid-cols-3"><CompactStat label={t('Overdue')} value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label={t('Internal review')} value={waitingInternal.length} icon={FileCheck2} tone="warning" /><CompactStat label={t('Client approval')} value={waitingClient.length} icon={UsersRound} /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-3"><TaskQueue title={t('Urgent today')} tasks={[...overdue, ...dueToday]} empty={t('No urgent production work.')} /><TaskQueue title={t('Internal review')} tasks={waitingInternal} empty={t('The internal review queue is clear.')} /><TaskQueue title={t('Client approval')} tasks={waitingClient} empty={t('No client approval is waiting.')} /></div>
    <Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{t('Team handoffs')}</h3><p className="mt-1 text-sm text-muted">{t('Open work and delivered output by person.')}</p></div><div className="grid divide-y divide-line/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">{workers.slice(0, 4).map(item => <div key={item.user.id} className="p-4"><p data-i18n-skip className="font-semibold text-ink">{item.user.name}</p><p className="mt-1 text-xs text-muted">{item.open} {t('open')} · {item.completed} {t('completed')}</p><ProgressBar className="mt-4" label={t('Delivered output')} value={item.delivered} max={Math.max(1, item.completed)} /></div>)}</div></Surface>
  </section>;

  if (persona === 'account') return <section className="space-y-5" aria-labelledby="account-workbench-title">
    <WorkbenchHeader id="account-workbench-title" title={t('Accounts')} description={t('Client plans, renewals, commercial records, and delivery output.')} />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label={t('Monthly management value')} value={canSeePrices ? formatMoney(contractedMonthly, 'MYR', locale) : t('Restricted')} icon={WalletCards} detail={<>{activePlans.length} {t(activePlans.length === 1 ? 'active client package.' : 'active client packages.')}</>} /><StatGroup className="grid-cols-3"><CompactStat label={t('Active packages')} value={activePlans.length} icon={UsersRound} /><CompactStat label={t('Contract reminders')} value={renewalPlans.length} icon={CalendarDays} tone="warning" /><CompactStat label={t('Delivered outputs')} value={delivered.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-2"><Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{t('Plans and renewals')}</h3></div><div className="divide-y divide-line/60">{activePlans.map(plan => { const contractEnd = parseOptionalDate(plan.contractEndDate); return <DataRow key={plan.id} titleI18nSkip={false} descriptionI18nSkip={false} title={<Link to={`/clients/${encodeURIComponent(plan.clientId)}`} className="hover:text-accent"><span data-i18n-skip>{plan.clientName}</span></Link>} description={<><span data-i18n-skip>{plan.name}</span> · {t('renewal')} {contractEnd ? formatLocalizedDate(contractEnd, locale) : t('not set')}</>} action={canSeePrices ? <span className="calm-number text-sm font-semibold text-ink">{formatMoney(store.servicePricingSnapshots.find(item => item.parentId === plan.id)?.totalMinor || 0, 'MYR', locale)}</span> : undefined} />; })}</div></Surface><Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{t('Delivery output by worker')}</h3></div><div className="divide-y divide-line/60">{workers.map(item => <DataRow key={item.user.id} titleI18nSkip={false} descriptionI18nSkip={false} title={<span data-i18n-skip>{item.user.name}</span>} description={<span data-i18n-skip>{item.user.workerType || t('employee')}</span>} action={<span className="calm-number text-xs text-muted">{item.completed} {t('tasks')} · {item.delivered} {t('delivered')}</span>} />)}</div></Surface></div>
  </section>;

  if (persona === 'projectManager') return <section className="space-y-5" aria-labelledby="portfolio-workbench-title">
    <WorkbenchHeader id="portfolio-workbench-title" title={t('Portfolio delivery')} description={t('Companies, deadlines, review work, and output in your portfolio.')} />
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]"><SpotlightMetric label={t('Open delivery tasks')} value={scopeTasks.filter(isTaskOpen).length} icon={Clock3} detail={<>{dueToday.length} {t('Due today')} · {overdue.length} {t('overdue in your portfolio.')}</>} /><StatGroup className="grid-cols-3"><CompactStat label={t('Overdue delivery')} value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label={t('Waiting review')} value={waitingInternal.length + waitingClient.length} icon={FileCheck2} tone="warning" /><CompactStat label={t('Active companies')} value={activePlans.length} icon={UsersRound} /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-2"><TaskQueue title={t('Due today / overdue')} tasks={[...overdue, ...dueToday].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))} empty={t('No urgent portfolio delivery work.')} /><TaskQueue title={t('Waiting review')} tasks={[...waitingInternal, ...waitingClient]} empty={t('No portfolio review work is waiting.')} /></div>
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
        <div><h3 className="font-semibold text-ink">{t('Monthly deliverables')}</h3><p className="mt-1 text-sm text-muted">{t('Current cycle delivery progress for each active company.')}</p></div>
        <CountLabel>{activeCompanies.length}</CountLabel>
      </div>
      <div className="divide-y divide-line/60">
        {activeCompanies.map(item => (
          <div key={item.clientId} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,auto)] sm:items-center sm:px-5">
            <div className="min-w-0">
              <Link to={`/clients/${encodeURIComponent(item.clientId)}`} data-i18n-skip className="truncate text-sm font-semibold text-ink hover:text-accent">{item.clientName}</Link>
              <p className="mt-1 truncate text-xs text-muted"><span data-i18n-skip>{item.plan.name}</span>{item.currentCycle ? <> · {formatLocalizedDate(parseOptionalDate(item.currentCycle.periodStart)!, locale)} – {formatLocalizedDate(parseOptionalDate(item.currentCycle.periodEnd)!, locale)}</> : <> · {t('No published cycle for this month')}</>}</p>
            </div>
            <div className="min-w-0">
              <ProgressBar className="mb-1.5" label={`${t('Deliverables')} ${item.delivered}/${item.total}`} value={item.delivered} max={Math.max(item.total, 1)} />
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                <StatusChip tone="emerald">{item.delivered} {t('Delivered')}</StatusChip>
                <StatusChip tone="blue">{item.ready} {t('Ready')}</StatusChip>
                <StatusChip tone="indigo">{item.inProgress} {t('In Progress')}</StatusChip>
                <StatusChip tone="slate">{item.planned} {t('Planned')}</StatusChip>
              </div>
            </div>
          </div>
        ))}
        {activeCompanies.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t('No active companies yet.')}</p>}
      </div>
    </Surface>
    <Surface variant="inset" className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="calm-eyebrow">{t('Commercial summary')}</p><p className="mt-1 text-sm text-muted">{t('Active plan value in your visible portfolio.')}</p></div><p className="calm-number text-2xl font-semibold text-ink">{formatMoney(contractedMonthly, 'MYR', locale)}</p></Surface>
  </section>;

  return <section className="space-y-5" aria-labelledby="management-workbench-title">
    <WorkbenchHeader id="management-workbench-title" title={t('Company operations')} description={t('Client delivery, team workload, output, and commercial records across the company.')} />
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]"><SpotlightMetric label="Contracted monthly value" value={formatMoney(contractedMonthly, 'MYR', locale)} icon={WalletCards} detail={<>{activePlans.length} {t(activePlans.length === 1 ? 'active client under management.' : 'active clients under management.')}</>} /><StatGroup className="grid-cols-3"><CompactStat label="Active clients" value={activePlans.length} icon={UsersRound} /><CompactStat label="Overdue production" value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label="Delivered outputs" value={delivered.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
        <div><h3 className="font-semibold text-ink">{t('Monthly deliverables')}</h3><p className="mt-1 text-sm text-muted">{t('Current cycle delivery progress for each active company.')}</p></div>
        <CountLabel>{activeCompanies.length}</CountLabel>
      </div>
      <div className="divide-y divide-line/60">
        {activeCompanies.map(item => (
          <div key={item.clientId} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,auto)] sm:items-center sm:px-5">
            <div className="min-w-0">
              <Link to={`/clients/${encodeURIComponent(item.clientId)}`} data-i18n-skip className="truncate text-sm font-semibold text-ink hover:text-accent">{item.clientName}</Link>
              <p className="mt-1 truncate text-xs text-muted"><span data-i18n-skip>{item.plan.name}</span>{item.currentCycle ? <> · {formatLocalizedDate(parseOptionalDate(item.currentCycle.periodStart)!, locale)} – {formatLocalizedDate(parseOptionalDate(item.currentCycle.periodEnd)!, locale)}</> : <> · {t('No published cycle for this month')}</>}</p>
            </div>
            <div className="min-w-0">
              <ProgressBar className="mb-1.5" label={`${t('Deliverables')} ${item.delivered}/${item.total}`} value={item.delivered} max={Math.max(item.total, 1)} />
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                <StatusChip tone="emerald">{item.delivered} {t('Delivered')}</StatusChip>
                <StatusChip tone="blue">{item.ready} {t('Ready')}</StatusChip>
                <StatusChip tone="indigo">{item.inProgress} {t('In Progress')}</StatusChip>
                <StatusChip tone="slate">{item.planned} {t('Planned')}</StatusChip>
              </div>
            </div>
          </div>
        ))}
        {activeCompanies.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t('No active companies yet.')}</p>}
      </div>
    </Surface>
  </section>;
};

export default ServiceRoleDashboard;
