import React from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Plus,
  UsersRound,
} from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { useI18n } from '../components/I18nProvider';
import { canCreateTasks, canViewAllClients, getClientKey, getVisibleClientNames, getVisibleTasks } from '../lib/access';
import TaskDetailsModal from '../components/TaskDetailsModal';
import {
  buildClientDeliverySummaries,
  getDeliveryPeriodRange,
  moveDeliveryPeriod,
  type DeliveryTrackerPeriod,
  type DeliveryTrackerStatusFilter,
} from '../lib/deliveryTracker';
import { Badge, Button, EmptyState, PageHeader, ProgressBar, SegmentedTabs, StatusChip } from '../components/ui';
import { pageShell, tableShell } from '../components/uiTokens';
import { cn } from '../lib/utils';

const PERIOD_TABS = [
  { id: 'week' as const, label: 'Week' },
  { id: 'month' as const, label: 'Month' },
  { id: 'all' as const, label: 'All work' },
];

const STATUS_FILTERS: { id: DeliveryTrackerStatusFilter; label: string }[] = [
  { id: 'all', label: 'All clients' },
  { id: 'open', label: 'Open work' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];

const readableDate = (value?: string) => {
  if (!value) return 'No deadline';
  const date = parseISO(value);
  return isValid(date) ? format(date, 'd MMM yyyy') : 'No deadline';
};

const DeliveryTracker: React.FC = () => {
  const { t } = useI18n();
  const {
    currentUser,
    rolePermissions,
    clients,
    projects,
    tasks: allTasks,
    deliverables,
    serviceCycles,
    users,
    setCreateTaskModalOpen,
  } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    clients: state.clients,
    projects: state.projects,
    tasks: state.tasks,
    deliverables: state.deliverables,
    serviceCycles: state.serviceCycles,
    users: state.users,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
  })));
  const [searchParams, setSearchParams] = useSearchParams();
  const routeSearch = searchParams.get('search') || '';
  const routeClient = searchParams.get('client') || '';
  const routeTaskId = searchParams.get('taskId') || '';
  const requestedPeriod = searchParams.get('period');
  const [period, setPeriod] = React.useState<DeliveryTrackerPeriod>(
    requestedPeriod === 'month' || requestedPeriod === 'all' ? requestedPeriod : 'week',
  );
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [statusFilter, setStatusFilter] = React.useState<DeliveryTrackerStatusFilter>('all');
  const search = routeSearch;
  const [expandedClients, setExpandedClients] = React.useState<Set<string>>(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const deferredSearch = React.useDeferredValue(search);

  React.useEffect(() => {
    if (requestedPeriod === 'week' || requestedPeriod === 'month' || requestedPeriod === 'all') setPeriod(requestedPeriod);
  }, [requestedPeriod]);

  const visibleTasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients, projects }),
    [allTasks, clients, currentUser, projects, rolePermissions],
  );
  const visibleClientNames = React.useMemo(() => {
    const names = getVisibleClientNames(currentUser, allTasks, projects, rolePermissions, { clients, projects });
    if (canViewAllClients(currentUser, rolePermissions)) names.push(...clients.map(client => client.clientName));
    if (currentUser?.role === 'Client' && currentUser.companyName) names.push(currentUser.companyName);
    return Array.from(new Map(names.filter(Boolean).map(name => [name.trim().toLowerCase(), name.trim()])).values())
      .sort((left, right) => left.localeCompare(right));
  }, [allTasks, clients, currentUser, projects, rolePermissions]);
  const visibleClientKeys = React.useMemo(
    () => new Set(visibleClientNames.map(name => name.toLowerCase())),
    [visibleClientNames],
  );
  const range = React.useMemo(() => getDeliveryPeriodRange(period, anchor), [anchor, period]);
  const summaries = React.useMemo(() => buildClientDeliverySummaries({
    clientNames: visibleClientNames,
    tasks: visibleTasks,
    deliverables: deliverables.filter(item => visibleClientKeys.has(getClientKey(item.clientName))),
    cycles: serviceCycles.filter(item => visibleClientKeys.has(getClientKey(item.clientName))),
    users,
    period,
    range,
  }), [deliverables, period, range, serviceCycles, users, visibleClientKeys, visibleClientNames, visibleTasks]);

  const filteredSummaries = React.useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const focusedClient = routeClient.trim().toLowerCase();
    return summaries.filter(summary => {
      const matchesClient = !focusedClient || summary.clientName.trim().toLowerCase() === focusedClient;
      const matchesSearch = !query || [
        summary.clientName,
        ...summary.tasks.map(task => `${task.title} ${task.serviceType}`),
        ...summary.deliverables.map(item => item.title),
      ].join(' ').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'open' && summary.open > 0)
        || (statusFilter === 'overdue' && summary.overdue > 0)
        || (statusFilter === 'completed' && (summary.completed > 0 || summary.delivered > 0));
      return matchesClient && matchesSearch && matchesStatus;
    });
  }, [deferredSearch, routeClient, statusFilter, summaries]);

  const selectedTask = React.useMemo(() => (
    selectedTaskId ? visibleTasks.find(task => task.id === selectedTaskId) || null : null
  ), [selectedTaskId, visibleTasks]);

  const updateQuery = React.useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    const focusedTask = routeTaskId ? visibleTasks.find(task => task.id === routeTaskId) : undefined;
    const clientToExpand = focusedTask?.clientName || routeClient;
    if (!clientToExpand) return;
    if (focusedTask && period !== 'all') {
      setPeriod('all');
      updateQuery({ period: 'all' });
    }
    setExpandedClients(current => current.has(clientToExpand) ? current : new Set(current).add(clientToExpand));
    if (focusedTask) setSelectedTaskId(focusedTask.id);
  }, [period, routeClient, routeTaskId, updateQuery, visibleTasks]);

  const totals = React.useMemo(() => summaries.reduce((result, summary) => ({
    open: result.open + summary.open,
    overdue: result.overdue + summary.overdue,
    completed: result.completed + summary.completed,
    delivered: result.delivered + summary.delivered,
  }), { open: 0, overdue: 0, completed: 0, delivered: 0 }), [summaries]);

  const toggleExpanded = (clientName: string) => {
    setExpandedClients(current => {
      const next = new Set(current);
      if (next.has(clientName)) next.delete(clientName);
      else next.add(clientName);
      return next;
    });
  };

  const assigneeNames = (ids: string[]) => ids
    .map(id => users.find(user => user.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className={pageShell}>
      <PageHeader
        title={t('Delivery tracker')}
        description={t('Track tasks, deliverables, deadlines, and completion by client.')}
        meta={<><span>{range.label}</span><span aria-hidden="true">·</span><span>{filteredSummaries.length} clients shown</span></>}
        action={canCreateTasks(currentUser, rolePermissions) ? <Button onClick={() => setCreateTaskModalOpen(true)}><Plus className="h-4 w-4" />New task</Button> : undefined}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line/70 py-3 text-sm" aria-label={t('Delivery tracker summary')}>
        {[['Open work', totals.open], ['Overdue', totals.overdue], ['Completed', totals.completed], ['Deliverables', totals.delivered]].map(([label, value]) => <span key={String(label)} className="inline-flex items-baseline gap-1.5"><strong className="calm-number text-base text-ink">{value}</strong><span className="text-muted">{label}</span></span>)}
      </div>

      <section className={tableShell} aria-label={t('Delivery tracker')}>
        <div className="border-b border-line bg-inset/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 id="delivery-tracker-heading" className="font-semibold text-ink">{t('Client work')}</h2>
              <p className="mt-1 text-sm text-muted">{t('Open overdue work carries forward until it is completed.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedTabs items={PERIOD_TABS} value={period} onChange={value => { setPeriod(value); setAnchor(new Date()); updateQuery({ period: value === 'week' ? null : value }); }} label="Tracker period" idPrefix="delivery-period" />
              {period !== 'all' && <div className="flex items-center rounded-control bg-surface ring-1 ring-line">
                <button type="button" onClick={() => setAnchor(current => moveDeliveryPeriod(period, current, -1))} className="flex h-11 w-11 items-center justify-center rounded-l-control text-muted hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35" aria-label={`Previous ${period}`}><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setAnchor(new Date())} className="min-h-11 border-x border-line px-3 text-sm font-semibold text-ink hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">Today</button>
                <button type="button" onClick={() => setAnchor(current => moveDeliveryPeriod(period, current, 1))} className="flex h-11 w-11 items-center justify-center rounded-r-control text-muted hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35" aria-label={`Next ${period}`}><ChevronRight className="h-4 w-4" /></button>
              </div>}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <div className="flex flex-wrap gap-2" aria-label="Filter tracker status">
              {STATUS_FILTERS.map(filter => <button key={filter.id} type="button" aria-pressed={statusFilter === filter.id} onClick={() => setStatusFilter(filter.id)} className={cn('min-h-11 rounded-control px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35', statusFilter === filter.id ? 'bg-accent text-white dark:text-[rgb(var(--calm-accent-ink))]' : 'bg-surface text-muted ring-1 ring-line hover:bg-inset hover:text-ink')}>{filter.label}</button>)}
            </div>
          </div>
        </div>

        <div className="divide-y divide-line/70">
          {filteredSummaries.map(summary => {
            const expanded = expandedClients.has(summary.clientName);
            const team = assigneeNames(summary.assigneeIds);
            return (
              <article key={summary.clientName} className="bg-surface">
                <div className="grid gap-4 px-4 py-5 sm:px-5 xl:grid-cols-[minmax(13rem,1.2fr)_minmax(11rem,.9fr)_minmax(11rem,.9fr)_minmax(10rem,.8fr)_auto] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-xs font-semibold text-accent">{summary.clientName.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><h3 data-i18n-skip className="truncate font-semibold text-ink">{summary.clientName}</h3><p className="mt-0.5 text-xs text-muted">{summary.cycle ? `${summary.cycle.periodStart} – ${summary.cycle.periodEnd}` : 'No service cycle in this period'}</p></div></div>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-1.5"><StatusChip tone={summary.overdue ? 'red' : 'blue'}>{summary.open} {t('open')}</StatusChip>{summary.overdue > 0 && <StatusChip tone="red">{summary.overdue} {t('overdue')}</StatusChip>}<StatusChip tone="emerald">{summary.completed} {t('completed')}</StatusChip></div>
                    <p className="mt-2 text-xs text-muted">{summary.inProgress} {t('in progress')} · {summary.review} {t('in review')}</p>
                  </div>
                  <div>
                    <ProgressBar value={summary.progress} label={`${summary.clientName} completion`} />
                    <p className="mt-2 text-xs text-muted">{summary.delivered}/{summary.included} {t('deliverables completed')}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink"><CalendarDays className="h-4 w-4 text-accent" />{readableDate(summary.nextDeadline)}</p>
                    <p className="mt-2 truncate text-xs text-muted"><UsersRound className="mr-1 inline h-3.5 w-3.5" />{team.length ? team.join(', ') : 'No team in this period'}</p>
                  </div>
                  <Button variant="secondary" aria-expanded={expanded} onClick={() => toggleExpanded(summary.clientName)} className="w-full xl:w-auto">{expanded ? 'Hide work' : 'View work'}{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
                </div>

                {expanded && (
                  <div className="border-t border-line bg-inset/45 px-4 py-5 sm:px-5">
                    <div className="grid gap-5 xl:grid-cols-2">
                      <section aria-labelledby={`${summary.clientName}-tasks`}>
                        <h4 id={`${summary.clientName}-tasks`} className="text-sm font-semibold text-ink">Tasks</h4>
                        <div className="mt-3 space-y-2">
                          {summary.tasks.map(task => <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)} className="grid w-full gap-2 rounded-control bg-surface px-3 py-3 text-left ring-1 ring-line/70 transition-colors hover:bg-accent-soft/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p data-i18n-skip className="truncate text-sm font-semibold text-ink">{task.title}</p><p className="mt-1 text-xs text-muted">{task.serviceType} · due {readableDate(task.dueDate)}</p></div><Badge tone={task.isCompleted || task.status === 'Completed' ? 'emerald' : task.status === 'Waiting Approval' ? 'amber' : 'slate'}>{task.status}</Badge></button>)}
                          {summary.tasks.length === 0 && <p className="rounded-control bg-surface px-3 py-4 text-sm text-muted ring-1 ring-line/70">No tasks in this period.</p>}
                        </div>
                      </section>
                      <section aria-labelledby={`${summary.clientName}-deliverables`}>
                        <h4 id={`${summary.clientName}-deliverables`} className="text-sm font-semibold text-ink">Deliverables</h4>
                        <div className="mt-3 space-y-2">
                          {summary.deliverables.map(item => <div key={item.id} className="grid gap-2 rounded-control bg-surface px-3 py-3 ring-1 ring-line/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p data-i18n-skip className="truncate text-sm font-semibold text-ink">{item.title}</p><p className="mt-1 text-xs text-muted">Deliverable {item.sequence}{item.deliveredAt ? ` · completed ${readableDate(item.deliveredAt)}` : ''}</p></div><StatusChip tone={item.status === 'Delivered' ? 'emerald' : item.status === 'Ready' ? 'amber' : 'slate'}>{item.status}</StatusChip></div>)}
                          {summary.deliverables.length === 0 && <p className="rounded-control bg-surface px-3 py-4 text-sm text-muted ring-1 ring-line/70">No deliverables in this period.</p>}
                        </div>
                      </section>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {filteredSummaries.length === 0 && <EmptyState title="No tracked client work" description="Try another period or clear the current search and status filters." className="m-5" />}
        </div>
      </section>
      <TaskDetailsModal isOpen={Boolean(selectedTask)} task={selectedTask} onClose={() => { setSelectedTaskId(null); if (routeTaskId) updateQuery({ taskId: null }); }} />
    </div>
  );
};

export default DeliveryTracker;
