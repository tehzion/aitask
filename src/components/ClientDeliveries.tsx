import React from 'react';
import { format } from 'date-fns';
import { ArrowRight, CalendarDays, CheckCircle2, Filter, Search, TimerReset, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import type { ClientDeliveryStage } from '../lib/clientPortal';
import {
  CLIENT_DELIVERY_STAGE_LABELS,
  CLIENT_DELIVERY_STAGE_ORDER,
  getClientDeliveryStage,
  groupClientDeliveries,
} from '../lib/clientPortal';
import { getVisibleTasks } from '../lib/access';
import { cn, parseOptionalDate } from '../lib/utils';
import { useStore } from '../store';
import { Button, EmptyState, PageHeader, StatusChip } from './ui';
import { inputBase, pageShell } from './uiTokens';
import SideSheet from './SideSheet';
import ClientDeliveryFocus from './ClientDeliveryFocus';

type DateFilter = 'any' | 'next_7' | 'this_month' | 'no_date';

const stageTone: Record<ClientDeliveryStage, 'amber' | 'blue' | 'slate' | 'emerald' | 'red'> = {
  needs_review: 'amber',
  timing_changed: 'amber',
  in_delivery: 'blue',
  scheduled: 'slate',
  delivered: 'emerald',
  cancelled: 'red',
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ClientDeliveries = () => {
  const { allTasks, users, currentUser, rolePermissions } = useStore(useShallow(state => ({
    allTasks: state.tasks,
    users: state.users,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
  })));
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [serviceFilter, setServiceFilter] = React.useState('All');
  const [dateFilter, setDateFilter] = React.useState<DateFilter>('any');
  const tasks = React.useMemo(() => getVisibleTasks(currentUser, allTasks, rolePermissions), [allTasks, currentUser, rolePermissions]);
  const searchTerm = searchParams.get('search') || '';
  const requestedStage = searchParams.get('stage');
  const stageFilter: ClientDeliveryStage | 'all' = CLIENT_DELIVERY_STAGE_ORDER.includes(requestedStage as ClientDeliveryStage)
    ? requestedStage as ClientDeliveryStage
    : 'all';
  const taskId = searchParams.get('taskId');
  const selectedTask = taskId ? tasks.find(task => task.id === taskId) || null : null;
  const services = React.useMemo(() => [...new Set(tasks.map(task => task.serviceType).filter(Boolean))].sort(), [tasks]);

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const filteredTasks = React.useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const now = new Date();
    const today = dateKey(now);
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const monthKey = today.slice(0, 7);
    return tasks.filter(task => {
      const stage = getClientDeliveryStage(task, now);
      const searchable = [task.title, task.description, task.serviceType, task.projectName].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesService = serviceFilter === 'All' || task.serviceType === serviceFilter;
      const matchesStage = stageFilter === 'all' || stage === stageFilter;
      const matchesDate = dateFilter === 'any'
        || (dateFilter === 'no_date' && !task.dueDate)
        || (dateFilter === 'next_7' && Boolean(task.dueDate && task.dueDate >= today && task.dueDate <= dateKey(nextWeek)))
        || (dateFilter === 'this_month' && task.dueDate?.startsWith(monthKey));
      return matchesSearch && matchesService && matchesStage && matchesDate;
    });
  }, [dateFilter, searchTerm, serviceFilter, stageFilter, tasks]);

  const groups = React.useMemo(() => groupClientDeliveries(filteredTasks), [filteredTasks]);
  const visibleStages = CLIENT_DELIVERY_STAGE_ORDER.filter(stage => groups[stage].length > 0);
  const activeFilterCount = Number(stageFilter !== 'all') + Number(serviceFilter !== 'All') + Number(dateFilter !== 'any');
  const contactName = (id: string) => users.find(user => user.id === id)?.name || 'Agency team';
  const taskUrl = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('taskId', id);
    return `/tasks?${next.toString()}`;
  };
  const clearFilters = () => {
    setServiceFilter('All');
    setDateFilter('any');
    const next = new URLSearchParams(searchParams);
    next.delete('stage');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={pageShell}>
      <PageHeader title="Deliveries" description={`Review, track, and discuss work shared with ${currentUser?.companyName || 'your company'}.`} />

      {taskId && !selectedTask && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-control border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <span>This delivery is not available for your company.</span>
          <button type="button" onClick={() => setParam('taskId')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control hover:bg-amber-100" aria-label="Dismiss unavailable delivery"><X className="h-4 w-4" /></button>
        </div>
      )}

      <section className="rounded-panel bg-surface p-4 ring-1 ring-line/80" aria-label="Find deliveries">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search deliveries</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={searchTerm} onChange={event => setParam('search', event.target.value)} className={cn(inputBase, 'min-h-11 pl-10 pr-3')} placeholder="Search deliveries…" />
          </label>
          <Button variant="secondary" onClick={() => setFiltersOpen(true)} aria-label={`Open delivery filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}>
            <Filter className="h-4 w-4" />Filters{activeFilterCount > 0 && <span className="calm-number rounded-tag bg-accent-soft px-1.5 py-0.5 text-xs text-accent">{activeFilterCount}</span>}
          </Button>
        </div>
        {activeFilterCount > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted">Showing:</span>{stageFilter !== 'all' && <StatusChip tone={stageTone[stageFilter]}>{CLIENT_DELIVERY_STAGE_LABELS[stageFilter]}</StatusChip>}{serviceFilter !== 'All' && <StatusChip>{serviceFilter}</StatusChip>}{dateFilter !== 'any' && <StatusChip>{dateFilter === 'next_7' ? 'Next 7 days' : dateFilter === 'this_month' ? 'This month' : 'No date'}</StatusChip>}<button type="button" onClick={clearFilters} className="min-h-11 px-2 font-semibold text-accent">Clear filters</button></div>}
      </section>

      {visibleStages.length > 0 ? (
        <div className="space-y-6">
          {visibleStages.map(stage => (
            <section key={stage} className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80" aria-labelledby={`client-deliveries-${stage}`}>
              <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2">{stage === 'timing_changed' ? <TimerReset className="h-4 w-4 text-amber-600" /> : stage === 'delivered' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CalendarDays className="h-4 w-4 text-accent" />}<h2 id={`client-deliveries-${stage}`} className="font-semibold text-ink">{CLIENT_DELIVERY_STAGE_LABELS[stage]}</h2></div>
                <span className="calm-number text-sm text-muted">{groups[stage].length}</span>
              </header>
              <div className="divide-y divide-line/70">
                {groups[stage].map(task => {
                  const dueDate = parseOptionalDate(task.dueDate);
                  const latestTeamComment = task.comments?.filter(comment => comment.userId !== currentUser?.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
                  return (
                    <article key={task.id} className="group grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><Link data-i18n-skip to={taskUrl(task.id)} className="truncate text-sm font-semibold text-ink transition-colors duration-160 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{task.title}</Link><StatusChip tone={stageTone[stage]}>{CLIENT_DELIVERY_STAGE_LABELS[stage]}</StatusChip></div>
                        <p className="mt-1 text-xs leading-5 text-muted"><span data-i18n-skip>{task.serviceType} · {contactName(task.assignedTo)}</span><span> · {dueDate ? format(dueDate, 'd MMM yyyy') : 'Date to be confirmed'}</span></p>
                        {stage === 'timing_changed' && <p data-i18n-skip className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-amber-800 dark:text-amber-200">{latestTeamComment?.text || `The expected date has changed. ${contactName(task.assignedTo)} is your contact for timing.`}</p>}
                      </div>
                      <Link to={taskUrl(task.id)} className={cn('inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold transition-colors duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:translate-y-px', stage === 'needs_review' ? 'bg-accent text-white hover:brightness-95 dark:text-[rgb(var(--calm-accent-ink))]' : 'text-accent hover:bg-accent-soft')}>{stage === 'needs_review' ? 'Review deliverable' : 'View delivery'}<ArrowRight className="h-4 w-4" /></Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title={tasks.length ? 'No matching deliveries' : 'No deliveries shared yet'} description={tasks.length ? 'Try clearing a filter or searching for another service.' : 'Your agency team will share scheduled work and review requests here.'} />
      )}

      <SideSheet isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter deliveries" description="Narrow this list without changing what your company can access." footer={<div className="flex justify-between gap-2"><Button variant="secondary" onClick={clearFilters}>Clear</Button><Button onClick={() => setFiltersOpen(false)}>Show {filteredTasks.length} deliveries</Button></div>}>
        <div className="space-y-6">
          <fieldset><legend className="text-sm font-semibold text-ink">Delivery stage</legend><div className="mt-3 grid gap-2">{(['all', ...CLIENT_DELIVERY_STAGE_ORDER] as const).map(stage => <label key={stage} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3 text-sm text-ink hover:bg-inset"><input type="radio" name="client-delivery-stage" checked={stageFilter === stage} onChange={() => setParam('stage', stage === 'all' ? undefined : stage)} className="h-4 w-4 accent-[rgb(var(--calm-accent))]" />{stage === 'all' ? 'All delivery stages' : CLIENT_DELIVERY_STAGE_LABELS[stage]}</label>)}</div></fieldset>
          <label className="block text-sm font-semibold text-ink">Service<select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className={cn(inputBase, 'mt-2 min-h-11 px-3')}><option value="All">All services</option>{services.map(service => <option key={service} data-i18n-skip>{service}</option>)}</select></label>
          <label className="block text-sm font-semibold text-ink">Expected date<select value={dateFilter} onChange={event => setDateFilter(event.target.value as DateFilter)} className={cn(inputBase, 'mt-2 min-h-11 px-3')}><option value="any">Any date</option><option value="next_7">Next 7 days</option><option value="this_month">This month</option><option value="no_date">No date</option></select></label>
        </div>
      </SideSheet>

      <ClientDeliveryFocus task={selectedTask} onClose={() => setParam('taskId')} />
    </div>
  );
};

export default ClientDeliveries;
