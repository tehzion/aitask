import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { ArrowLeft, Building2, ExternalLink, Search, Filter, Paperclip, MoreHorizontal, CheckCircle2, X, CalendarClock, SlidersHorizontal, ChevronDown, Mail, MapPin, Phone, Plus } from 'lucide-react';
import { format, isBefore, isToday } from 'date-fns';
import { Department, Priority, Task, TaskStatus } from '../types';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, PageHeader } from '../components/ui';
import { cardBase, inputBase, pageShell } from '../components/uiTokens';
import { cn, getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { canAssignTasksToOthers, canCreateTasks, canEditTask as canEditTaskByRole, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { SkeletonTableRow, SkeletonMobileCard } from '../components/SkeletonCard';
import { safeHttpsUrl } from '../lib/security';

const PRIORITY_OPTIONS: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor', 'Client'];
const PAGE_SIZE = 8;
const normalizeClientName = (value: string) => value.trim().toLowerCase();

const statusColors: Record<string, string> = {
  'Pending': 'bg-slate-100 text-slate-700 border border-slate-200',
  'In Progress': 'bg-blue-100 text-blue-700 border border-blue-200',
  'Waiting Approval': 'bg-amber-100 text-amber-700 border border-amber-200',
  'Completed': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Cancelled': 'bg-red-100 text-red-700 border border-red-200',
};

const getStatusColor = (status: string): string => {
  return statusColors[status] || 'bg-slate-100 text-slate-700 border border-slate-200';
};

const priorityColors: Record<Priority, string> = {
  'Low': 'bg-slate-100 text-slate-700',
  'Medium': 'bg-blue-100 text-blue-700',
  'High': 'bg-amber-100 text-amber-700',
  'Urgent': 'bg-red-100 text-red-700',
};

const approvalColors = {
  Pending: 'bg-slate-100 text-slate-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

const Tasks: React.FC = () => {
  const { tasks: allTasks, clients: clientProfiles, users, projects, updateTaskStatus, updateTaskPriority, updateTaskAssignee, currentUser, rolePermissions, backend, taskStatuses, setCreateTaskModalOpen, commitPendingMutation } = useStore();
  const [viewType, setViewType] = useState<'table' | 'board'>('table');
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [activeQuickEdit, setActiveQuickEdit] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [quickSyncError, setQuickSyncError] = useState('');

  const persistQuickChange = async (previousTask: Task) => {
    const result = await commitPendingMutation();
    if (result.ok) {
      setQuickSyncError('');
      return true;
    }
    useStore.setState(state => ({
      tasks: state.tasks.map(task => task.id === previousTask.id ? previousTask : task),
    }));
    setQuickSyncError(result.error || 'The quick change was rolled back. Use Retry required to confirm it safely.');
    return false;
  };

  const handleQuickEditClick = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEditTaskByRole(currentUser, task, rolePermissions)) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveQuickEdit({
      taskId: task.id,
      x: rect.left - 180,
      y: rect.bottom + 4,
    });
  };

  const handleRowContextMenu = (e: React.MouseEvent, task: Task) => {
    if (!canEditTaskByRole(currentUser, task, rolePermissions)) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveQuickEdit({
      taskId: task.id,
      x: e.clientX,
      y: e.clientY + 4,
    });
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    setDraggingTaskId(null);
    if (!taskId) return;

    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    if (!canEditTask(task)) return;

    updateTaskStatus(taskId, targetStatus);
    await persistQuickChange(task);
  };

  const getDeptBadge = (dept: string) => {
    switch (dept) {
      case 'Designer':          return 'bg-pink-50 text-pink-700 border border-pink-100';
      case 'Editor':            return 'bg-sky-50 text-sky-700 border border-sky-100';
      case 'Videoshooting':     return 'bg-purple-50 text-purple-700 border border-purple-100';
      case 'Ads Management':    return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Account & Finance': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Management':        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'Operation':         return 'bg-slate-100 text-slate-700 border border-slate-200';
      default:                  return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdFilter = searchParams.get('projectId');
  const clientRouteFilter = searchParams.get('client') || '';
  const taskIdFilter = searchParams.get('taskId');
  const routeSearch = searchParams.get('search') || '';

  const [searchTerm, setSearchTerm] = useState(routeSearch);
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [filterClient, setFilterClient] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setViewType('board');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setSearchTerm(routeSearch);
  }, [routeSearch]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority, dateFrom, dateTo, projectIdFilter, clientRouteFilter, taskIdFilter]);

  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions),
    [allTasks, currentUser, rolePermissions]
  );

  const visibleProjects = useMemo(
    () => getVisibleProjects(currentUser, projects, allTasks, rolePermissions),
    [allTasks, currentUser, projects, rolePermissions]
  );

  const clientOptions = useMemo(() => (
    Array.from(new Map(
      [...tasks.map(t => t.clientName), ...visibleProjects.map(p => p.clientName)]
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => [normalizeClientName(value), value])
    ).values()).sort((a, b) => a.localeCompare(b))
  ), [tasks, visibleProjects]);

  const departmentOptions = useMemo(() => (
    DEPARTMENTS.filter(department => department !== 'Client' && tasks.some(task => task.department === department))
  ), [tasks]);

  const assigneeOptions = useMemo(() => {
    const assignedUserIds = new Set(tasks.map(task => task.assignedTo));
    return users
      .filter(user => user.role !== 'Client' && assignedUserIds.has(user.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, users]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return tasks.filter(task => {
      const searchable = [
        task.id,
        task.title,
        task.description,
        task.clientName,
        task.projectName,
        task.serviceType,
        task.department,
        users.find(u => u.id === task.assignedTo)?.name,
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesDept = filterDepartment === 'All' || task.department === filterDepartment;
      const matchesAssignee = filterAssignee === 'All' || task.assignedTo === filterAssignee;
      const matchesClient = clientRouteFilter
        ? normalizeClientName(task.clientName) === normalizeClientName(clientRouteFilter)
        : filterClient === 'All' || normalizeClientName(task.clientName) === normalizeClientName(filterClient);
      const matchesStatus = filterStatus === 'All' || task.status === filterStatus;
      const matchesPriority = filterPriority === 'All' || task.priority === filterPriority;
      const matchesDateFrom = !dateFrom || (task.dueDate && task.dueDate >= dateFrom);
      const matchesDateTo = !dateTo || (task.dueDate && task.dueDate <= dateTo);
      const matchesProject = projectIdFilter ? task.projectId === projectIdFilter : true;
      const matchesTask = taskIdFilter ? task.id === taskIdFilter : true;

      return matchesSearch && matchesDept && matchesAssignee && matchesClient && matchesStatus && matchesPriority && matchesDateFrom && matchesDateTo && matchesProject && matchesTask;
    });
  }, [clientRouteFilter, dateFrom, dateTo, filterAssignee, filterClient, filterDepartment, filterPriority, filterStatus, projectIdFilter, searchTerm, taskIdFilter, tasks, users]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTasks = filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeProject = projectIdFilter ? visibleProjects.find(p => p.id === projectIdFilter) : null;
  const activeClient = clientRouteFilter || '';
  const activeClientKey = normalizeClientName(activeClient);
  const activeClientProfile = activeClient
    ? clientProfiles.find(client => normalizeClientName(client.clientName) === activeClientKey)
    : undefined;
  const activeClientTasks = activeClient
    ? tasks.filter(task => normalizeClientName(task.clientName) === activeClientKey)
    : [];
  const activeClientProjects = activeClient
    ? visibleProjects.filter(project => normalizeClientName(project.clientName) === activeClientKey)
    : [];
  const activeClientOpenTasks = activeClientTasks.filter(task => !task.isCompleted && task.status !== 'Completed').length;
  const activeClientCompletedTasks = activeClientTasks.filter(task => task.isCompleted || task.status === 'Completed').length;
  const activeClientFallbackDetails = activeClientTasks.find(task => task.customerDetails)?.customerDetails;
  const activeClientWebsite = safeHttpsUrl(activeClientProfile?.website || activeClientTasks.find(task => task.website)?.website);
  const activeClientFacebook = safeHttpsUrl(activeClientProfile?.facebookPage || activeClientTasks.find(task => task.facebookPage)?.facebookPage);
  const selectedLiveTask = allTasks.find(t => t.id === selectedTask?.id) || null;

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const canEditTask = (task: Task) => canEditTaskByRole(currentUser, task, rolePermissions);
  const canAssignOthers = canAssignTasksToOthers(currentUser, rolePermissions);
  const hasAnyFilter = [searchTerm, dateFrom, dateTo, activeClient].some(Boolean) || [filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority].some(value => value !== 'All') || projectIdFilter || taskIdFilter;
  const activeFilterLabels = [
    searchTerm && `Search: ${searchTerm}`,
    filterDepartment !== 'All' && filterDepartment,
    filterAssignee !== 'All' && `Assignee: ${getUserName(filterAssignee)}`,
    activeClient ? `Client: ${activeClient}` : filterClient !== 'All' && filterClient,
    filterStatus !== 'All' && filterStatus,
    filterPriority !== 'All' && filterPriority,
    dateFrom && `From ${dateFrom}`,
    dateTo && `To ${dateTo}`,
    activeProject && activeProject.projectName,
    taskIdFilter && taskIdFilter,
  ].filter((label): label is string => Boolean(label));

  const clearRouteFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterDepartment('All');
    setFilterAssignee('All');
    setFilterClient('All');
    setFilterStatus('All');
    setFilterPriority('All');
    setDateFrom('');
    setDateTo('');
    setSearchParams(new URLSearchParams());
  };

  const renderStatusControl = (task: Task) => (
    canEditTask(task) ? (
      <div className="relative inline-block">
        <select
          className={`text-xs pl-2.5 pr-6 py-1 rounded-md font-semibold outline-none cursor-pointer appearance-none border-none ${getStatusColor(task.status)}`}
          value={task.status}
          disabled={backend.isSaving}
          onChange={async (e) => {
            updateTaskStatus(task.id, e.target.value as TaskStatus);
            await persistQuickChange(task);
          }}
        >
          {taskStatuses.map(status => (
            <option key={status} value={status} className="bg-white text-slate-900">{status}</option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-80 text-current" />
      </div>
    ) : (
      <span className={`text-xs px-2.5 py-1 rounded-md font-semibold ${getStatusColor(task.status)}`}>
        {task.status}
      </span>
    )
  );

  const renderTaskBadges = (task: Task) => (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${approvalColors[task.clientApprovalStatus]}`}>
        Client: {task.clientApprovalStatus}
      </span>
      {task.revisionCount > 0 && (
        <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
          {task.revisionCount} revision{task.revisionCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );

  return (
    <div className={pageShell}>
      <PageHeader
        title="Tasks Management"
        description="Manage assignments, approvals, revisions, files, and deadlines."
        action={canCreateTasks(currentUser, rolePermissions) ? (
          <Button onClick={() => setCreateTaskModalOpen(true)}>
            <Plus className="h-4 w-4" />
            New task
          </Button>
        ) : null}
      />

      {quickSyncError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
          {quickSyncError}
        </div>
      )}

      {activeProject && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg shadow-sm">
          <span className="text-sm font-medium flex-1">
            Viewing tasks for <strong className="font-bold">{activeProject.projectName}</strong> ({activeProject.clientName})
          </span>
          <button onClick={() => clearRouteFilter('projectId')} className="p-1.5 hover:bg-blue-200/50 rounded-md transition-colors" title="Clear project filter" aria-label="Clear project filter">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {taskIdFilter && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg shadow-sm">
          <span className="text-sm font-medium flex-1">Viewing specific task: <strong className="font-bold">{taskIdFilter}</strong></span>
          <button onClick={() => clearRouteFilter('taskId')} className="p-1.5 hover:bg-amber-200/50 rounded-md transition-colors" title="Clear task filter" aria-label="Clear task filter">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeClient && (
        <div className={`${cardBase} overflow-hidden border-blue-100 bg-white`}>
          <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <Link to="/clients" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">
                  <ArrowLeft className="h-4 w-4" /> Back to Clients
                </Link>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Client task view</p>
                    <h2 className="mt-1 truncate text-xl font-bold text-slate-950">{activeClient}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      {activeClientProfile?.contactPerson || activeClientFallbackDetails || 'No saved contact person yet.'}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => clearRouteFilter('client')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
              >
                <X className="h-4 w-4" /> Clear client filter
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeClientTasks.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeClientOpenTasks}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Done</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeClientCompletedTasks}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {activeClientProfile?.email && (
                <span className="inline-flex items-center gap-2 truncate">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" /> {activeClientProfile.email}
                </span>
              )}
              {activeClientProfile?.phone && (
                <span className="inline-flex items-center gap-2 truncate">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" /> {activeClientProfile.phone}
                </span>
              )}
              {activeClientProfile?.address && (
                <span className="inline-flex items-center gap-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> <span className="line-clamp-2">{activeClientProfile.address}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" /> {activeClientProjects.length} company record{activeClientProjects.length === 1 ? '' : 's'}
              </span>
              {(activeClientWebsite || activeClientFacebook) && (
                <span className="inline-flex items-center gap-3">
                  {activeClientWebsite && (
                    <a href={activeClientWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                      Website <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {activeClientFacebook && (
                    <a href={activeClientFacebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                      Facebook <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`${cardBase} overflow-hidden flex flex-col`}>
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative w-full lg:max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                className={cn(inputBase, 'block py-2 pl-10 pr-3')}
                placeholder="Search tasks, clients, assignees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Filter className="w-4 h-4" />
              <span>{filteredTasks.length} matching task{filteredTasks.length === 1 ? '' : 's'}</span>
            </div>

            {/* View Toggle */}
            <div className="flex items-center bg-slate-100/80 rounded-lg p-1 shadow-inner shrink-0 border border-slate-200 sm:ml-auto">
              <button
                type="button"
                onClick={() => setViewType('table')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                  viewType === 'table'
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewType('board')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                  viewType === 'board'
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                Board
              </button>
            </div>

            <Button
              variant="secondary"
              onClick={() => setFiltersOpen(value => !value)}
              className="justify-between lg:hidden"
              aria-expanded={filtersOpen}
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Filters {activeFilterLabels.length > 0 && `(${activeFilterLabels.length})`}
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', filtersOpen && 'rotate-180')} />
            </Button>

            {hasAnyFilter && (
              <button onClick={clearAllFilters} className="lg:ml-auto text-sm font-semibold text-slate-600 hover:text-blue-600">
                Clear filters
              </button>
            )}
          </div>

          {activeFilterLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterLabels.map(label => <Badge key={label} tone="indigo">{label}</Badge>)}
            </div>
          )}

          <div className={cn('grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4', filtersOpen ? 'grid' : 'hidden lg:grid')}>
            <div className="relative">
              <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">All departments</option>
                {departmentOptions.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>
            <div className="relative">
              <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">All assignees</option>
                {assigneeOptions.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>
            <div className="relative">
              <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">All clients</option>
                {clientOptions.map(client => <option key={client} value={client}>{client}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>
            <div className="relative">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">All statuses</option>
                {taskStatuses.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>
            <div className="relative">
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">All priorities</option>
                {PRIORITY_OPTIONS.map(priority => <option key={priority} value={priority}>{priority}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label="Due from" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label="Due to" />
          </div>
        </div>

        {viewType === 'table' ? (
          <>
            <div className="hidden overflow-x-auto 2xl:block">
              <table className="w-full min-w-[1160px] text-left text-sm text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Task Details</th>
                    <th className="px-3 py-3 font-semibold">Client / Company</th>
                    <th className="px-3 py-3 font-semibold">Department</th>
                    <th className="px-3 py-3 font-semibold">Timeline</th>
                    <th className="w-[100px] px-3 py-3 text-center font-semibold">Priority</th>
                    <th className="w-[130px] px-3 py-3 text-center font-semibold">Status</th>
                    <th className="w-[180px] px-3 py-3 text-center font-semibold">Workflow</th>
                    <th className="px-3 py-3 text-center font-semibold">Progress</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backend?.isLoading ? (
                    Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonTableRow key={i} />)
                  ) : (
                    pagedTasks.map((task) => {
                      const startDateParsed = parseOptionalDate(task.startDate);
                      const dueDateParsed = parseOptionalDate(task.dueDate);
                      const isOverdue = Boolean(dueDateParsed && !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed));

                      return (
                        <tr
                          key={task.id}
                          className={cn(
                            "border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer text-slate-700",
                            isOverdue ? "bg-red-50/50 hover:bg-red-100/50 border-red-100/70" : "bg-white"
                          )}
                          onClick={() => setSelectedTask(task)}
                          onContextMenu={(e) => handleRowContextMenu(e, task)}
                        >
                          <td className="max-w-[200px] px-3 py-3">
                            <div className={cn("font-semibold truncate", isOverdue ? "text-red-900" : "text-slate-900")}>{task.title}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{task.id} - {task.serviceType}</div>
                          </td>
                          <td className="max-w-[150px] px-3 py-3">
                            <div className="font-medium text-slate-800 truncate">{task.clientName}</div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">{task.projectName || 'Independent task'}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md font-medium border border-slate-200">{task.department}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs">
                            <div className="text-slate-500 mb-0.5">Start: {startDateParsed ? format(startDateParsed, 'MMM dd') : 'No start date'}</div>
                            <div
                              className={cn("font-medium", isOverdue ? "text-red-700 font-bold" : "text-slate-800")}
                              title={dueDateParsed ? `Due: ${format(dueDateParsed, 'yyyy-MM-dd')}` : 'No due date'}
                            >
                              {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                            </div>
                          </td>
                          <td className="w-[100px] whitespace-nowrap px-3 py-3 text-center">
                            <span className={`inline-block text-xs px-2.5 py-1 rounded-md font-semibold ${priorityColors[task.priority]}`}>{task.priority}</span>
                          </td>
                          <td className="w-[130px] whitespace-nowrap px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {renderStatusControl(task)}
                          </td>
                          <td className="w-[180px] px-3 py-3 text-center">
                            {renderTaskBadges(task)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                              </div>
                              <span className="text-xs font-semibold text-slate-700 w-8">{task.completionPercentage}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-400">
                            <div className="flex flex-col items-start gap-1.5">
                              <div className="flex items-center gap-2">
                                {task.attachmentLink && (
                                  safeHttpsUrl(task.attachmentLink) ? (
                                    <a href={safeHttpsUrl(task.attachmentLink)!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-blue-600" title={task.attachmentName || 'Attachment'}>
                                      <Paperclip className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <span title="Invalid attachment link" className="text-slate-400">
                                      <Paperclip className="w-4 h-4" />
                                    </span>
                                  )
                                )}
                                {task.isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                <button
                                  className="rounded-md p-1 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                  title="Quick Edit"
                                  aria-label={`Quick edit ${task.title}`}
                                  onClick={(e) => handleQuickEditClick(e, task)}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5" title={`Assigned to: ${getUserName(task.assignedTo)}`}>
                                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                                  {getUserName(task.assignedTo).charAt(0)}
                                </div>
                                <span className="text-xs font-medium text-slate-600 truncate max-w-[85px]">
                                  {getUserName(task.assignedTo)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {!backend?.isLoading && pagedTasks.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No tasks found matching your criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2 2xl:hidden">
              {backend?.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonMobileCard key={i} />)
              ) : (
                pagedTasks.map(task => {
                  const dueDateParsed = parseOptionalDate(task.dueDate);
                  const isOverdue = Boolean(dueDateParsed && !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed));

                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={cn(
                        "relative w-full border-l-4 p-4 text-left transition-colors hover:bg-slate-50",
                        isOverdue
                          ? "border-l-red-500 bg-red-50/30 hover:bg-red-100/30"
                          : "border-l-transparent bg-white"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={cn("font-semibold leading-5", isOverdue ? "text-red-900" : "text-slate-900")}>{task.title}</div>
                          <div className="text-xs text-slate-500 mt-1 leading-5">{task.id} - {task.clientName} - {task.projectName || 'Independent task'}</div>
                        </div>
                        <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${priorityColors[task.priority]}`}>{task.priority}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <span
                          className={cn("inline-flex items-center gap-1", isOverdue ? "text-red-700 font-bold" : "text-slate-600")}
                          title={dueDateParsed ? `Due: ${format(dueDateParsed, 'yyyy-MM-dd')}` : 'No due date'}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                        </span>
                        <span className="truncate text-right">{getUserName(task.assignedTo)}</span>
                        <span>{task.department}</span>
                        <span className="truncate text-right">{task.serviceType}</span>
                      </div>
                      {isOverdue && (
                        <div className="mt-2 text-[10px] text-red-500 font-extrabold flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div onClick={(e) => e.stopPropagation()}>{renderStatusControl(task)}</div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{task.completionPercentage}%</span>
                        </div>
                      </div>
                      <div className="mt-3">{renderTaskBadges(task)}</div>
                    </button>
                  );
                })
              )}
              {!backend?.isLoading && pagedTasks.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No tasks found matching your criteria.</div>}
            </div>

            <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 text-sm">
              <span className="text-slate-500">
                Showing {filteredTasks.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} of {filteredTasks.length} entries
              </span>
              <div className="flex gap-1">
                <button disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed">Previous</button>
                <span className="px-3 py-1 border border-blue-600 rounded-md bg-blue-600 text-white font-medium">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          </>
        ) : (
          /* Kanban Board View */
          <div className="p-4 overflow-x-auto bg-slate-100">
            <div className="flex gap-4 min-w-[1000px] items-start">
              {taskStatuses.map(status => {
                const columnTasks = filteredTasks.filter(t => t.status === status);
                return (
                  <div
                    key={status}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, status)}
                    className="flex-1 min-w-[260px] bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col max-h-[700px] shadow-sm"
                  >
                    {/* Column Header */}
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#e0d9cf] shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{status}</span>
                      <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700">{columnTasks.length}</span>
                    </div>

                    {/* Column Content */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar min-h-[300px]">
                      {backend?.isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="bg-white rounded-lg border border-slate-200/60 p-3.5 space-y-2 animate-pulse">
                            <div className="h-4 bg-slate-200 rounded w-4/5"></div>
                            <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                            <div className="h-3 bg-slate-100 rounded w-2/3"></div>
                          </div>
                        ))
                      ) : (
                        columnTasks.map(task => {
                          const dueDateParsed = parseOptionalDate(task.dueDate);
                          const isOverdue = Boolean(dueDateParsed && !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed));
                          const canDrag = canEditTask(task);

                          return (
                            <div
                              key={task.id}
                              draggable={canDrag}
                              onDragStart={canDrag ? (e) => handleDragStart(e, task.id) : undefined}
                              onDragEnd={handleDragEnd}
                              onClick={() => setSelectedTask(task)}
                              className={cn(
                                "bg-white p-3.5 rounded-lg border border-slate-200 hover:shadow-md transition-all cursor-pointer select-none relative text-left",
                                isOverdue && "border-red-200 bg-red-50/10 hover:bg-red-50/20",
                                draggingTaskId === task.id && "opacity-40 scale-[0.97]",
                                canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                              )}
                            >
                              {isOverdue && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 rounded-t-lg"></div>
                              )}

                              <div className="flex justify-between items-start gap-1">
                                <h4 className={cn("text-xs font-bold leading-5 truncate flex-1", isOverdue ? "text-red-900" : "text-slate-800")}>
                                  {task.title}
                                </h4>
                                <Badge tone={task.priority === 'Urgent' ? 'red' : task.priority === 'High' ? 'amber' : task.priority === 'Medium' ? 'blue' : 'slate'} className="text-[9px] px-1.5 py-0 shrink-0">
                                  {task.priority}
                                </Badge>
                              </div>

                              <div className="text-[10px] text-slate-500 mt-1.5 truncate">
                                {task.id} · {task.clientName}
                              </div>

                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", getDeptBadge(task.department))}>
                                  {task.department}
                                </span>
                                <span className="text-[9px] text-slate-500 font-medium">
                                  {task.serviceType}
                                </span>
                              </div>

                              <div className="mt-3 flex items-center justify-between text-[10px]">
                                <span
                                  className={cn("font-medium", isOverdue ? "text-red-600 font-extrabold" : "text-slate-500")}
                                  title={dueDateParsed ? `Due: ${format(dueDateParsed, 'yyyy-MM-dd')}` : 'No due date'}
                                >
                                  {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                                </span>
                                <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  <div className="w-4 h-4 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[9px] font-bold">
                                    {getUserName(task.assignedTo).charAt(0)}
                                  </div>
                                  <span className="text-slate-600 font-semibold text-[9px] max-w-[50px] truncate">{getUserName(task.assignedTo)}</span>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-2.5 flex items-center gap-1.5">
                                <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/40">
                                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 shrink-0">{task.completionPercentage}%</span>
                              </div>

                              {/* Action Badges in Card */}
                              {(task.attachmentLink || task.revisionCount > 0 || task.clientApprovalStatus !== 'Pending') && (
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2 text-[9px] text-slate-500">
                                  {task.attachmentLink && <Paperclip className="w-3 h-3 text-slate-400" />}
                                  {task.revisionCount > 0 && <span className="text-amber-700 font-bold">{task.revisionCount} rev</span>}
                                  {task.clientApprovalStatus !== 'Pending' && (
                                    <span className={cn("font-bold", task.clientApprovalStatus === 'Approved' ? "text-emerald-600" : "text-red-600")}>
                                      Client: {task.clientApprovalStatus}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {!backend?.isLoading && columnTasks.length === 0 && (
                        <div className="text-center py-6 text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50/30">
                          No tasks in this status
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <TaskDetailsModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedLiveTask}
      />

      {/* Quick Edit Popover */}
      {activeQuickEdit && (() => {
        const currentTask = allTasks.find(t => t.id === activeQuickEdit.taskId);
        if (!currentTask) return null;

        return (
          <>
            <div
              className="fixed inset-0 z-50 bg-transparent"
              onClick={() => setActiveQuickEdit(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setActiveQuickEdit(null);
              }}
            />
            <div
              className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 w-64 space-y-4 text-slate-700 animate-in fade-in zoom-in-95 duration-100"
              style={{
                top: Math.min(activeQuickEdit.y, window.innerHeight - 280),
                left: Math.max(10, Math.min(activeQuickEdit.x, window.innerWidth - 270)),
              }}
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 truncate pr-2" title={currentTask.title}>
                  Quick Edit: {currentTask.title}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveQuickEdit(null)}
                  className="text-slate-400 hover:text-slate-600 rounded p-0.5 hover:bg-slate-50"
                  aria-label="Close quick edit"
                  title="Close quick edit"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Status</label>
                <div className="relative">
                  <select
                    className={cn(inputBase, "w-full text-xs py-1.5 pl-2.5 pr-8 bg-white appearance-none cursor-pointer")}
                    value={currentTask.status}
                    onChange={(e) => {
                      updateTaskStatus(currentTask.id, e.target.value as TaskStatus);
                      void persistQuickChange(currentTask);
                      setActiveQuickEdit(null);
                    }}
                  >
                    {taskStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Priority</label>
                <div className="relative">
                  <select
                    className={cn(inputBase, "w-full text-xs py-1.5 pl-2.5 pr-8 bg-white appearance-none cursor-pointer")}
                    value={currentTask.priority}
                    onChange={(e) => {
                      updateTaskPriority(currentTask.id, e.target.value as Priority);
                      void persistQuickChange(currentTask);
                      setActiveQuickEdit(null);
                    }}
                  >
                    {PRIORITY_OPTIONS.map(prio => (
                      <option key={prio} value={prio}>{prio}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Assignee</label>
                <div className="relative">
                  <select
                    className={cn(inputBase, "w-full text-xs py-1.5 pl-2.5 pr-8 bg-white disabled:bg-slate-50 disabled:text-slate-400 appearance-none cursor-pointer")}
                    value={currentTask.assignedTo}
                    disabled={!canAssignOthers}
                    onChange={(e) => {
                      updateTaskAssignee(currentTask.id, e.target.value);
                      void persistQuickChange(currentTask);
                      setActiveQuickEdit(null);
                    }}
                  >
                    {(canAssignOthers ? users.filter(u => u.role !== 'Client') : users.filter(u => u.id === currentTask.assignedTo)).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                </div>
                {!canAssignOthers && (
                  <p className="mt-1 text-[10px] text-slate-400">Only admins can reassign tasks.</p>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default Tasks;
