import React from 'react';
import { Filter, ListFilter, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import type { Priority, TaskStatus } from '../types';
import { useStore } from '../store';
import { getVisibleTasks } from '../lib/access';
import { buildStaffWorkQueue, getStaffBucketLabel, type StaffWorkBucketKey } from '../lib/staffWorkspace';
import { getTodayInputDate } from '../lib/utils';
import { Button, PageHeader, Surface } from './ui';
import { inputBase, pageShell } from './uiTokens';
import SideSheet from './SideSheet';
import StaffTaskFocus from './StaffTaskFocus';
import StaffWorkItem from './StaffWorkItem';

type StaffAllWorkBucket = 'all' | StaffWorkBucketKey;
const buckets: StaffAllWorkBucket[] = ['all', 'needs_action', 'up_next', 'waiting', 'done'];
const priorities: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

const StaffAllWork: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, tasks: allTasks, rolePermissions, taskStatuses } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    tasks: state.tasks,
    rolePermissions: state.rolePermissions,
    taskStatuses: state.taskStatuses,
  })));
  const [bucket, setBucket] = React.useState<StaffAllWorkBucket>('all');
  const [search, setSearch] = React.useState(searchParams.get('search') || '');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [client, setClient] = React.useState('All');
  const [status, setStatus] = React.useState<TaskStatus>('All');
  const [priority, setPriority] = React.useState<Priority | 'All'>('All');
  const [dueFrom, setDueFrom] = React.useState('');
  const [dueTo, setDueTo] = React.useState('');

  const tasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions).filter(task => task.assignedTo === currentUser?.id),
    [allTasks, currentUser, rolePermissions],
  );
  const queue = React.useMemo(() => buildStaffWorkQueue(tasks, getTodayInputDate()), [tasks]);
  const orderedTasks = React.useMemo(() => (
    bucket === 'all'
      ? [...queue.needs_action, ...queue.up_next, ...queue.waiting, ...queue.done]
      : queue[bucket]
  ), [bucket, queue]);
  const clients = React.useMemo(() => Array.from(new Set(tasks.map(task => task.clientName).filter(Boolean))).sort(), [tasks]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredTasks = orderedTasks.filter(task => {
    const searchable = [task.title, task.description, task.clientName, task.projectName, task.serviceType].filter(Boolean).join(' ').toLowerCase();
    return (!normalizedSearch || searchable.includes(normalizedSearch))
      && (client === 'All' || task.clientName === client)
      && (status === 'All' || task.status === status)
      && (priority === 'All' || task.priority === priority)
      && (!dueFrom || Boolean(task.dueDate && task.dueDate >= dueFrom))
      && (!dueTo || Boolean(task.dueDate && task.dueDate <= dueTo));
  });
  const taskId = searchParams.get('taskId');
  const selectedTask = taskId ? tasks.find(task => task.id === taskId) || null : null;
  const activeFilterCount = [client !== 'All', status !== 'All', priority !== 'All', Boolean(dueFrom), Boolean(dueTo)].filter(Boolean).length;

  React.useEffect(() => {
    const handleFocusSearch = () => document.querySelector<HTMLInputElement>('[data-staff-work-search]')?.focus();
    window.addEventListener('aitask-focus-search', handleFocusSearch);
    return () => window.removeEventListener('aitask-focus-search', handleFocusSearch);
  }, []);

  const setTaskId = (taskIdValue?: string) => {
    const next = new URLSearchParams(searchParams);
    if (taskIdValue) next.set('taskId', taskIdValue);
    else next.delete('taskId');
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    setClient('All');
    setStatus('All');
    setPriority('All');
    setDueFrom('');
    setDueTo('');
  };

  return (
    <div className={`${pageShell} max-w-6xl`}>
      <PageHeader
        compact
        title="All work"
        description="Every task assigned to you, ordered by what needs attention first."
        meta={<span className="calm-number">{filteredTasks.length} task{filteredTasks.length === 1 ? '' : 's'}</span>}
        action={<Button variant="secondary" onClick={() => setFiltersOpen(true)}><Filter className="h-4 w-4" />Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}</Button>}
      />

      <section aria-labelledby="staff-all-work-list" className="space-y-4">
        <h2 id="staff-all-work-list" className="sr-only">Assigned task list</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            data-global-search
            data-staff-work-search
            type="search"
            aria-label="Search assigned work"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search tasks, clients, or services…"
            className={`${inputBase} min-h-12 pl-10 pr-10`}
          />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"><X className="h-4 w-4" /></button>}
        </div>

        <div role="tablist" aria-label="All work queues" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
          {buckets.map(item => {
            const count = item === 'all' ? tasks.length : queue[item].length;
            const label = item === 'all' ? 'All' : getStaffBucketLabel(item);
            return <button key={item} type="button" role="tab" aria-selected={bucket === item} onClick={() => setBucket(item)} className={`relative min-h-11 shrink-0 px-3 text-sm font-semibold transition-colors duration-160 ${bucket === item ? 'text-accent after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:text-ink'}`}>{label} <span className="calm-number ml-1 text-xs">{count}</span></button>;
          })}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <ListFilter className="h-4 w-4" />{activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
            <button type="button" onClick={clearFilters} className="min-h-9 px-2 text-accent hover:underline">Clear filters</button>
          </div>
        )}

        <Surface className="overflow-hidden divide-y divide-line/70">
          {filteredTasks.map(task => <StaffWorkItem key={task.id} task={task} allTasks={tasks} onOpen={item => setTaskId(item.id)} />)}
          {filteredTasks.length === 0 && <div className="px-5 py-16 text-center"><ListFilter className="mx-auto h-8 w-8 text-muted/60" /><p className="mt-4 font-semibold text-ink">No assigned work matches this view</p><p className="mt-1 text-sm text-muted">Clear a filter or choose another queue.</p></div>}
        </Surface>
      </section>

      <SideSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter assigned work"
        description="Narrow your queue without manager-only controls."
        footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={clearFilters}>Clear</Button><Button className="flex-1" onClick={() => setFiltersOpen(false)}>Show {filteredTasks.length}</Button></div>}
      >
        <div className="space-y-5">
          <label className="block text-sm font-medium text-ink">Client<select aria-label="Filter by client" value={client} onChange={event => setClient(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option>All</option>{clients.map(name => <option data-i18n-skip key={name}>{name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Status<select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option>All</option>{taskStatuses.map(name => <option key={name}>{name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Priority<select aria-label="Filter by priority" value={priority} onChange={event => setPriority(event.target.value as Priority | 'All')} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option>All</option>{priorities.map(name => <option key={name}>{name}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-ink">Due from<input type="date" aria-label="Due from" value={dueFrom} onChange={event => setDueFrom(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`} /></label><label className="block text-sm font-medium text-ink">Due to<input type="date" aria-label="Due to" value={dueTo} onChange={event => setDueTo(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`} /></label></div>
        </div>
      </SideSheet>

      <StaffTaskFocus isOpen={Boolean(selectedTask)} task={selectedTask} onClose={() => setTaskId()} />
    </div>
  );
};

export default StaffAllWork;
