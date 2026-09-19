import React from 'react';
import { Filter, ListFilter, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import type { Priority, TaskStatus } from '../types';
import { useStore } from '../store';
import { getVisibleTasks, isDepartmentScopedUser, isHodUser } from '../lib/access';
import { buildStaffWorkQueue, getStaffBucketLabel, type StaffWorkBucketKey } from '../lib/staffWorkspace';
import { getTodayInputDate } from '../lib/utils';
import { Button, PageHeader, SegmentedTabs, Surface } from './ui';
import { inputBase, pageShell } from './uiTokens';
import SideSheet from './SideSheet';
import StaffTaskFocus from './StaffTaskFocus';
import StaffWorkItem from './StaffWorkItem';
import TaskDetailsModal from './TaskDetailsModal';
import { canEditTask } from '../lib/access';
import { useI18n } from './I18nProvider';

type StaffAllWorkBucket = 'all' | StaffWorkBucketKey;
const buckets: StaffAllWorkBucket[] = ['all', 'needs_action', 'up_next', 'waiting', 'done'];
const priorities: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

const StaffAllWork: React.FC = () => {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, tasks: allTasks, rolePermissions, taskStatuses, clients: clientProfiles, projects, users } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    tasks: state.tasks,
    rolePermissions: state.rolePermissions,
    taskStatuses: state.taskStatuses,
    clients: state.clients,
    projects: state.projects,
    users: state.users,
  })));
  const [bucket, setBucket] = React.useState<StaffAllWorkBucket>('all');
  const [search, setSearch] = React.useState(searchParams.get('search') || '');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [client, setClient] = React.useState('All');
  const [project, setProject] = React.useState('All');
  const [assignee, setAssignee] = React.useState('All');
  const [department, setDepartment] = React.useState('All');
  const [creator, setCreator] = React.useState('All');
  const [status, setStatus] = React.useState<TaskStatus>('All');
  const [priority, setPriority] = React.useState<Priority | 'All'>('All');
  const [dueFrom, setDueFrom] = React.useState('');
  const [dueTo, setDueTo] = React.useState('');
  const [fullEditorOpen, setFullEditorOpen] = React.useState(false);

  const visibleTasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients: clientProfiles, projects }),
    [allTasks, clientProfiles, currentUser, projects, rolePermissions],
  );
  const isHod = isHodUser(currentUser, rolePermissions);
  const isProjectManager = currentUser?.role === 'Project Manager';
  const [scopeView, setScopeView] = React.useState<'mine' | 'department'>('department');
  const tasks = React.useMemo(() => {
    if (isHod && scopeView === 'mine') {
      return visibleTasks.filter(task => task.assignedTo === currentUser?.id || task.createdBy === currentUser?.id);
    }
    if (currentUser?.role === 'Staff' && !isDepartmentScopedUser(currentUser, rolePermissions)) {
      return visibleTasks.filter(task => task.assignedTo === currentUser.id || task.createdBy === currentUser.id);
    }
    return visibleTasks;
  }, [currentUser, isHod, rolePermissions, scopeView, visibleTasks]);
  const queue = React.useMemo(() => buildStaffWorkQueue(tasks, getTodayInputDate()), [tasks]);
  const orderedTasks = React.useMemo(() => (
    bucket === 'all'
      ? [...queue.needs_action, ...queue.up_next, ...queue.waiting, ...queue.done]
      : queue[bucket]
  ), [bucket, queue]);
  const clients = React.useMemo(() => Array.from(new Set(tasks.map(task => task.clientName).filter(Boolean))).sort(), [tasks]);
  const projectsForFilter = React.useMemo(() => Array.from(new Set(tasks.map(task => task.projectName).filter(Boolean))).sort(), [tasks]);
  const departments = React.useMemo(() => Array.from(new Set(tasks.map(task => task.department).filter(Boolean))).sort(), [tasks]);
  const assignees = React.useMemo(() => users.filter(user => tasks.some(task => task.assignedTo === user.id)), [tasks, users]);
  const creators = React.useMemo(() => users.filter(user => tasks.some(task => task.createdBy === user.id)), [tasks, users]);
  const deferredSearch = React.useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredTasks = React.useMemo(() => orderedTasks.filter(task => {
    const searchable = [task.title, task.description, task.clientName, task.projectName, task.serviceType, task.department].filter(Boolean).join(' ').toLowerCase();
    return (!normalizedSearch || searchable.includes(normalizedSearch))
      && (client === 'All' || task.clientName === client)
      && (project === 'All' || task.projectName === project)
      && (assignee === 'All' || task.assignedTo === assignee)
      && (department === 'All' || task.department === department)
      && (creator === 'All' || task.createdBy === creator)
      && (status === 'All' || task.status === status)
      && (priority === 'All' || task.priority === priority)
      && (!dueFrom || Boolean(task.dueDate && task.dueDate >= dueFrom))
      && (!dueTo || Boolean(task.dueDate && task.dueDate <= dueTo));
  }), [assignee, client, creator, department, dueFrom, dueTo, normalizedSearch, orderedTasks, priority, project, status]);
  const taskId = searchParams.get('taskId');
  const selectedTask = taskId ? tasks.find(task => task.id === taskId) || null : null;
  const activeFilterCount = [Boolean(search.trim()), client !== 'All', project !== 'All', assignee !== 'All', department !== 'All', creator !== 'All', status !== 'All', priority !== 'All', Boolean(dueFrom), Boolean(dueTo)].filter(Boolean).length;

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
    setSearch('');
    setClient('All');
    setProject('All');
    setAssignee('All');
    setDepartment('All');
    setCreator('All');
    setStatus('All');
    setPriority('All');
    setDueFrom('');
    setDueTo('');
  };

  return (
    <div className={`${pageShell} max-w-6xl`}>
      <PageHeader
        compact
        title={t(isProjectManager ? 'Portfolio work' : isHod ? 'Department work' : 'All work')}
        description={t(isProjectManager ? 'Your portfolio work, ordered by delivery risk and next action.' : isHod ? 'Department work, including delegated tasks and items that need review.' : 'All visible work, ordered by what needs attention first.')}
        meta={<span className="calm-number">{filteredTasks.length} task{filteredTasks.length === 1 ? '' : 's'}</span>}
        action={<Button variant="secondary" onClick={() => setFiltersOpen(true)}><Filter className="h-4 w-4" />Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}</Button>}
      />

      <section aria-labelledby="staff-all-work-list" className="space-y-4">
        <h2 id="staff-all-work-list" className="sr-only">Visible task list</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            data-global-search
            data-staff-work-search
            type="search"
            aria-label={t('Search visible work')}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('Search visible work')}
            className={`${inputBase} min-h-12 pl-10 pr-10`}
          />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"><X className="h-4 w-4" /></button>}
        </div>

        {isHod && (
          <SegmentedTabs<'mine' | 'department'>
            items={[{ id: 'mine', label: t('My work'), count: visibleTasks.filter(task => task.assignedTo === currentUser?.id || task.createdBy === currentUser?.id).length }, { id: 'department', label: t('Department work'), count: visibleTasks.length }]}
            value={scopeView}
            onChange={setScopeView}
            label="HOD work scope"
            idPrefix="hod-scope"
            panelId="all-work-panel"
            variant="underline"
          />
        )}

        <SegmentedTabs<StaffAllWorkBucket>
          items={buckets.map(item => ({ id: item, label: item === 'all' ? 'All' : getStaffBucketLabel(item), count: item === 'all' ? tasks.length : queue[item].length }))}
          value={bucket}
          onChange={setBucket}
          label="All work queues"
          idPrefix="all-work"
          panelId="all-work-panel"
          variant="underline"
        />

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <ListFilter className="h-4 w-4" />{activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
            <button type="button" onClick={clearFilters} className="min-h-11 px-2 text-accent hover:underline">Clear filters</button>
          </div>
        )}

        <Surface id="all-work-panel" role="tabpanel" aria-labelledby={`all-work-tab-${bucket}`} tabIndex={0} className="overflow-hidden divide-y divide-line/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {filteredTasks.map(task => <StaffWorkItem key={task.id} task={task} allTasks={tasks} users={users} onOpen={item => setTaskId(item.id)} />)}
          {filteredTasks.length === 0 && <div className="px-5 py-16 text-center"><ListFilter className="mx-auto h-8 w-8 text-muted/60" /><p className="mt-4 font-semibold text-ink">{t('No visible work matches this view')}</p><p className="mt-1 text-sm text-muted">{t('Clear a filter or choose another queue.')}</p></div>}
        </Surface>
      </section>

      <SideSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter visible work"
        description="Narrow your queue without manager-only controls."
        footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={clearFilters}>Clear</Button><Button className="flex-1" onClick={() => setFiltersOpen(false)}>Show {filteredTasks.length}</Button></div>}
      >
        <div className="space-y-5">
          <label className="block text-sm font-medium text-ink">Client<select aria-label="Filter by client" value={client} onChange={event => setClient(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{clients.map(name => <option data-i18n-skip key={name} value={name}>{name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Project<select aria-label="Filter by project" value={project} onChange={event => setProject(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{projectsForFilter.map(name => <option data-i18n-skip key={name} value={name}>{name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Assignee<select aria-label="Filter by assignee" value={assignee} onChange={event => setAssignee(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{assignees.map(user => <option data-i18n-skip key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Department<select aria-label="Filter by department" value={department} onChange={event => setDepartment(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{departments.map(name => <option data-i18n-skip key={name} value={name}>{name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Created by<select aria-label="Filter by creator" value={creator} onChange={event => setCreator(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{creators.map(user => <option data-i18n-skip key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Status<select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value as TaskStatus)} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{taskStatuses.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Priority<select aria-label="Filter by priority" value={priority} onChange={event => setPriority(event.target.value as Priority | 'All')} className={`${inputBase} mt-1.5 min-h-11 px-3`}><option value="All">All</option>{priorities.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-ink">Due from<input type="date" aria-label="Due from" value={dueFrom} onChange={event => setDueFrom(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`} /></label><label className="block text-sm font-medium text-ink">Due to<input type="date" aria-label="Due to" value={dueTo} onChange={event => setDueTo(event.target.value)} className={`${inputBase} mt-1.5 min-h-11 px-3`} /></label></div>
        </div>
      </SideSheet>

      <StaffTaskFocus
        isOpen={Boolean(selectedTask) && !fullEditorOpen}
        task={selectedTask}
        onClose={() => setTaskId()}
        onOpenFullEditor={() => setFullEditorOpen(true)}
      />
      <TaskDetailsModal
        isOpen={Boolean(selectedTask) && fullEditorOpen && canEditTask(currentUser, selectedTask, rolePermissions)}
        task={selectedTask}
        onClose={() => { setFullEditorOpen(false); setTaskId(); }}
      />
    </div>
  );
};

export default StaffAllWork;
