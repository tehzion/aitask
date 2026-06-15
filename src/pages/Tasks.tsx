import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Search, Filter, Paperclip, MoreHorizontal, CheckCircle2, X, RotateCcw, CalendarClock, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { format, parseISO, isBefore, isToday, differenceInDays } from 'date-fns';
import { Department, Priority, Task, TaskStatus } from '../types';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, PageHeader, cardBase, inputBase, pageShell } from '../components/ui';
import { cn, getRelativeDueDateString } from '../lib/utils';
import { canCreateTasks, canEditTask as canEditTaskByRole, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { SkeletonTableRow, SkeletonMobileCard } from '../components/SkeletonCard';

const PRIORITY_OPTIONS: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor', 'Client'];
const PAGE_SIZE = 8;

const statusColors: Record<string, string> = {
  'Pending': 'bg-slate-100 text-slate-705 border border-slate-202',
  'In Progress': 'bg-blue-100 text-blue-705 border border-blue-202',
  'Waiting Approval': 'bg-amber-100 text-amber-705 border border-amber-202',
  'Completed': 'bg-emerald-100 text-emerald-705 border border-emerald-202',
  'Cancelled': 'bg-red-100 text-red-705 border border-red-202',
};

const getStatusColor = (status: string): string => {
  return statusColors[status] || 'bg-stone-100 text-stone-705 border border-[#e8e3db]';
};

const priorityColors: Record<Priority, string> = {
  'Low': 'bg-slate-100 text-slate-700',
  'Medium': 'bg-blue-100 text-blue-700',
  'High': 'bg-orange-100 text-orange-700',
  'Urgent': 'bg-red-100 text-red-700',
};

const approvalColors = {
  Pending: 'bg-slate-100 text-slate-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

const Tasks: React.FC = () => {
  const { tasks: allTasks, users, projects, updateTaskStatus, updateTaskPriority, updateTaskAssignee, currentUser, rolePermissions, backend, taskStatuses, setCreateTaskModalOpen } = useStore();
  const [viewType, setViewType] = useState<'table' | 'board'>('table');
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [activeQuickEdit, setActiveQuickEdit] = useState<{ taskId: string; x: number; y: number } | null>(null);

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

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    setDraggingTaskId(null);
    if (!taskId) return;

    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    if (!canEditTask(task)) return;

    updateTaskStatus(taskId, targetStatus);
  };

  const getDeptBadge = (dept: string) => {
    switch (dept) {
      case 'Designer':          return 'bg-pink-50 text-pink-700 border border-pink-100';
      case 'Editor':            return 'bg-sky-50 text-sky-700 border border-sky-100';
      case 'Videoshooting':     return 'bg-purple-50 text-purple-700 border border-purple-100';
      case 'Ads Management':    return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Account & Finance': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Management':        return 'bg-violet-50 text-violet-700 border border-violet-100';
      case 'Operation':         return 'bg-stone-100 text-stone-705 border border-[#e8e3db]';
      default:                  return 'bg-stone-50 text-stone-705 border border-[#e8e3db]';
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdFilter = searchParams.get('projectId');
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
  }, [searchTerm, filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority, dateFrom, dateTo, projectIdFilter, taskIdFilter]);

  const tasks = useMemo(() => getVisibleTasks(currentUser, allTasks), [allTasks, currentUser]);

  const visibleProjects = useMemo(() => getVisibleProjects(currentUser, projects), [currentUser, projects]);

  const clientOptions = useMemo(() => (
    [...new Set([...tasks.map(t => t.clientName), ...visibleProjects.map(p => p.clientName)])].sort()
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
      const matchesClient = filterClient === 'All' || task.clientName === filterClient;
      const matchesStatus = filterStatus === 'All' || task.status === filterStatus;
      const matchesPriority = filterPriority === 'All' || task.priority === filterPriority;
      const matchesDateFrom = !dateFrom || task.dueDate >= dateFrom;
      const matchesDateTo = !dateTo || task.dueDate <= dateTo;
      const matchesProject = projectIdFilter ? task.projectId === projectIdFilter : true;
      const matchesTask = taskIdFilter ? task.id === taskIdFilter : true;

      return matchesSearch && matchesDept && matchesAssignee && matchesClient && matchesStatus && matchesPriority && matchesDateFrom && matchesDateTo && matchesProject && matchesTask;
    });
  }, [dateFrom, dateTo, filterAssignee, filterClient, filterDepartment, filterPriority, filterStatus, projectIdFilter, searchTerm, taskIdFilter, tasks, users]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTasks = filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeProject = projectIdFilter ? visibleProjects.find(p => p.id === projectIdFilter) : null;
  const selectedLiveTask = allTasks.find(t => t.id === selectedTask?.id) || null;

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const canEditTask = (task: Task) => canEditTaskByRole(currentUser, task, rolePermissions);
  const hasAnyFilter = [searchTerm, dateFrom, dateTo].some(Boolean) || [filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority].some(value => value !== 'All') || projectIdFilter || taskIdFilter;
  const activeFilterLabels = [
    searchTerm && `Search: ${searchTerm}`,
    filterDepartment !== 'All' && filterDepartment,
    filterAssignee !== 'All' && `Assignee: ${getUserName(filterAssignee)}`,
    filterClient !== 'All' && filterClient,
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
      <select
        className={`text-xs px-2.5 py-1 rounded-full font-semibold outline-none cursor-pointer appearance-none border-none ${getStatusColor(task.status)}`}
        value={task.status}
        onChange={(e) => updateTaskStatus(task.id, e.target.value as TaskStatus)}
      >
        {taskStatuses.map(status => (
          <option key={status} value={status} className="bg-white text-slate-900">{status}</option>
        ))}
      </select>
    ) : (
      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusColor(task.status)}`}>
        {task.status}
      </span>
    )
  );

  const renderTaskBadges = (task: Task) => (
    <div className="flex flex-wrap gap-2">
      {task.isRecurring && (
        <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full font-semibold">
          <RotateCcw className="w-3 h-3" /> {task.recurrenceFrequency || 'Recurring'}
        </span>
      )}
      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${approvalColors[task.clientApprovalStatus]}`}>
        Client: {task.clientApprovalStatus}
      </span>
      {task.revisionCount > 0 && (
        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-full font-semibold">
          {task.revisionCount} revision{task.revisionCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );

  return (
    <div className={pageShell}>
      <PageHeader
        title="Tasks Management"
        description="Manage assignments, approvals, revisions, files, and recurring work."
        action={canCreateTasks(currentUser, rolePermissions) ? <Button onClick={() => setCreateTaskModalOpen(true)}>+ New Task</Button> : null}
      />

      {activeProject && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg shadow-sm">
          <span className="text-sm font-medium flex-1">
            Viewing tasks for <strong className="font-bold">{activeProject.projectName}</strong> ({activeProject.clientName})
          </span>
          <button onClick={() => clearRouteFilter('projectId')} className="p-1.5 hover:bg-indigo-200/50 rounded-md transition-colors" title="Clear project filter">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {taskIdFilter && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg shadow-sm">
          <span className="text-sm font-medium flex-1">Viewing specific task: <strong className="font-bold">{taskIdFilter}</strong></span>
          <button onClick={() => clearRouteFilter('taskId')} className="p-1.5 hover:bg-amber-200/50 rounded-md transition-colors" title="Clear task filter">
            <X className="w-4 h-4" />
          </button>
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
            <div className="flex items-center bg-stone-100/80 rounded-xl p-1 shadow-inner shrink-0 border border-[#e8e3db] sm:ml-auto">
              <button
                type="button"
                onClick={() => setViewType('table')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                  viewType === 'table'
                    ? "bg-orange-700 text-white shadow-sm"
                    : "text-stone-600 hover:bg-stone-50"
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
                    ? "bg-orange-700 text-white shadow-sm"
                    : "text-stone-600 hover:bg-stone-50"
                )}
              >
                Kanban Board
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
              <button onClick={clearAllFilters} className="lg:ml-auto text-sm font-semibold text-slate-600 hover:text-indigo-600">
                Clear filters
              </button>
            )}
          </div>

          {activeFilterLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterLabels.map(label => <Badge key={label} tone="indigo">{label}</Badge>)}
            </div>
          )}

          <div className={cn('grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3', filtersOpen ? 'grid' : 'hidden lg:grid')}>
            <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')}>
              <option value="All">All departments</option>
              {departmentOptions.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')}>
              <option value="All">All assignees</option>
              {assigneeOptions.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')}>
              <option value="All">All clients</option>
              {clientOptions.map(client => <option key={client} value={client}>{client}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')}>
              <option value="All">All statuses</option>
              {taskStatuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')}>
              <option value="All">All priorities</option>
              {PRIORITY_OPTIONS.map(priority => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label="Due from" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label="Due to" />
          </div>
        </div>

        {viewType === 'table' ? (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-500 min-w-[1280px]">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Task Details</th>
                    <th className="px-4 py-3 font-semibold">Client / Project</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Assignee</th>
                    <th className="px-4 py-3 font-semibold">Timeline</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Workflow</th>
                    <th className="px-4 py-3 font-semibold text-center">Progress</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backend?.isLoading ? (
                    Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonTableRow key={i} />)
                  ) : (
                    pagedTasks.map((task) => {
                      const dueDateParsed = parseISO(task.dueDate);
                      const isOverdue = !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed);

                      return (
                        <tr
                          key={task.id}
                          className={cn(
                            "border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer text-stone-700",
                            isOverdue ? "bg-red-50/50 hover:bg-red-100/50 border-red-100/70" : "bg-white"
                          )}
                          onClick={() => setSelectedTask(task)}
                          onContextMenu={(e) => handleRowContextMenu(e, task)}
                        >
                          <td className="px-4 py-3 max-w-[220px]">
                            <div className={cn("font-semibold truncate", isOverdue ? "text-red-900" : "text-slate-900")}>{task.title}</div>
                            <div className="text-xs text-stone-500 mt-0.5">{task.id} - {task.serviceType}</div>
                          </td>
                          <td className="px-4 py-3 max-w-[170px]">
                            <div className="font-medium text-stone-800 truncate">{task.clientName}</div>
                            <div className="text-xs text-stone-500 truncate mt-0.5">{task.projectName || 'Independent task'}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="bg-stone-100 text-stone-700 text-xs px-2.5 py-1 rounded-md font-medium border border-stone-200">{task.department}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">
                                {getUserName(task.assignedTo).charAt(0)}
                              </div>
                              <span className="font-medium text-stone-700">{getUserName(task.assignedTo)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs">
                            <div className="text-stone-500 mb-0.5">Start: {format(parseISO(task.startDate), 'MMM dd')}</div>
                            <div
                              className={cn("font-medium", isOverdue ? "text-red-700 font-bold" : "text-stone-800")}
                              title={`Due: ${format(dueDateParsed, 'yyyy-MM-dd')}`}
                            >
                              {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${priorityColors[task.priority]}`}>{task.priority}</span>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {renderStatusControl(task)}
                          </td>
                          <td className="px-4 py-3 max-w-[220px]">
                            {renderTaskBadges(task)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 bg-stone-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-orange-600 h-2 rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                              </div>
                              <span className="text-xs font-semibold text-stone-700 w-8">{task.completionPercentage}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-stone-400">
                            <div className="flex items-center gap-2">
                              {task.attachmentLink && (
                                <a href={task.attachmentLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-orange-600" title={task.attachmentName || 'Attachment'}>
                                  <Paperclip className="w-4 h-4" />
                                </a>
                              )}
                              {task.isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                              <button
                                className="hover:text-stone-700 p-1 rounded-md hover:bg-stone-200 transition-colors"
                                title="Quick Edit"
                                onClick={(e) => handleQuickEditClick(e, task)}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {!backend?.isLoading && pagedTasks.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-500">No tasks found matching your criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-slate-100">
              {backend?.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonMobileCard key={i} />)
              ) : (
                pagedTasks.map(task => {
                  const dueDateParsed = parseISO(task.dueDate);
                  const isOverdue = !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed);
                  const daysOverdue = Math.max(1, differenceInDays(new Date(), dueDateParsed));

                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={cn(
                        "w-full text-left p-4 hover:bg-stone-50 transition-colors relative border-l-4",
                        isOverdue
                          ? "bg-red-50/30 hover:bg-red-100/30 border-l-red-500 border-b border-stone-100"
                          : "bg-white border-l-transparent border-b border-stone-100"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={cn("font-semibold leading-5", isOverdue ? "text-red-900" : "text-stone-900")}>{task.title}</div>
                          <div className="text-xs text-stone-500 mt-1 leading-5">{task.id} - {task.clientName} - {task.projectName || 'Independent task'}</div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${priorityColors[task.priority]}`}>{task.priority}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
                        <span
                          className={cn("inline-flex items-center gap-1", isOverdue ? "text-red-700 font-bold" : "text-stone-600")}
                          title={`Due: ${format(dueDateParsed, 'yyyy-MM-dd')}`}
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
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          {daysOverdue} day{daysOverdue === 1 ? '' : 's'} overdue
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div onClick={(e) => e.stopPropagation()}>{renderStatusControl(task)}</div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-stone-200 rounded-full h-2 overflow-hidden">
                            <div className="bg-orange-600 h-2 rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                          </div>
                          <span className="text-xs font-semibold text-stone-700">{task.completionPercentage}%</span>
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
                <span className="px-3 py-1 border border-indigo-600 rounded-md bg-indigo-600 text-white font-medium">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          </>
        ) : (
          /* Kanban Board View */
          <div className="p-4 overflow-x-auto bg-[#faf8f5]">
            <div className="flex gap-4 min-w-[1000px] items-start">
              {taskStatuses.map(status => {
                const columnTasks = filteredTasks.filter(t => t.status === status);
                return (
                  <div
                    key={status}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, status)}
                    className="flex-1 min-w-[260px] bg-stone-50 border border-[#e8e3db] rounded-xl p-3 flex flex-col max-h-[700px] shadow-sm"
                  >
                    {/* Column Header */}
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#e0d9cf] shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-600">{status}</span>
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-stone-200/80 text-stone-700">{columnTasks.length}</span>
                    </div>

                    {/* Column Content */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar min-h-[300px]">
                      {backend?.isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="bg-white rounded-lg border border-stone-200/60 p-3.5 space-y-2 animate-pulse">
                            <div className="h-4 bg-stone-205 rounded w-4/5"></div>
                            <div className="h-3 bg-stone-105 rounded w-1/2"></div>
                            <div className="h-3 bg-stone-105 rounded w-2/3"></div>
                          </div>
                        ))
                      ) : (
                        columnTasks.map(task => {
                          const dueDateParsed = parseISO(task.dueDate);
                          const isOverdue = !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed);
                          const canDrag = canEditTask(task);

                          return (
                            <div
                              key={task.id}
                              draggable={canDrag}
                              onDragStart={canDrag ? (e) => handleDragStart(e, task.id) : undefined}
                              onDragEnd={handleDragEnd}
                              onClick={() => setSelectedTask(task)}
                              className={cn(
                                "bg-white p-3.5 rounded-lg border border-[#e8e3db] hover:shadow-md transition-all cursor-pointer select-none relative text-left",
                                isOverdue && "border-red-200 bg-red-50/10 hover:bg-red-50/20",
                                draggingTaskId === task.id && "opacity-40 scale-[0.97]",
                                canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                              )}
                            >
                              {isOverdue && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 rounded-t-lg animate-pulse"></div>
                              )}

                              <div className="flex justify-between items-start gap-1">
                                <h4 className={cn("text-xs font-bold leading-5 truncate flex-1", isOverdue ? "text-red-900" : "text-stone-850")}>
                                  {task.title}
                                </h4>
                                <Badge tone={task.priority === 'Urgent' ? 'red' : task.priority === 'High' ? 'amber' : task.priority === 'Medium' ? 'blue' : 'slate'} className="text-[9px] px-1.5 py-0 shrink-0">
                                  {task.priority}
                                </Badge>
                              </div>

                              <div className="text-[10px] text-stone-500 mt-1.5 truncate">
                                {task.id} · {task.clientName}
                              </div>

                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", getDeptBadge(task.department))}>
                                  {task.department}
                                </span>
                                <span className="text-[9px] text-stone-500 font-medium">
                                  {task.serviceType}
                                </span>
                              </div>

                              <div className="mt-3 flex items-center justify-between text-[10px]">
                                <span
                                  className={cn("font-medium", isOverdue ? "text-red-600 font-extrabold" : "text-stone-500")}
                                  title={`Due: ${format(dueDateParsed, 'yyyy-MM-dd')}`}
                                >
                                  {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                                </span>
                                <div className="flex items-center gap-1 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">
                                  <div className="w-4 h-4 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[9px] font-bold">
                                    {getUserName(task.assignedTo).charAt(0)}
                                  </div>
                                  <span className="text-stone-600 font-semibold text-[9px] max-w-[50px] truncate">{getUserName(task.assignedTo)}</span>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-2.5 flex items-center gap-1.5">
                                <div className="flex-1 bg-stone-100 h-1.5 rounded-full overflow-hidden border border-stone-200/40">
                                  <div className="bg-orange-600 h-full rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                                </div>
                                <span className="text-[9px] font-bold text-stone-600 shrink-0">{task.completionPercentage}%</span>
                              </div>

                              {/* Action Badges in Card */}
                              {(task.attachmentLink || task.revisionCount > 0 || task.clientApprovalStatus !== 'Pending') && (
                                <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center gap-2 text-[9px] text-stone-500">
                                  {task.attachmentLink && <Paperclip className="w-3 h-3 text-stone-400" />}
                                  {task.revisionCount > 0 && <span className="text-orange-700 font-bold">{task.revisionCount} rev</span>}
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
                        <div className="text-center py-6 text-[11px] text-stone-400 border border-dashed border-stone-200 rounded-lg bg-stone-50/30">
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
              className="fixed z-50 bg-white border border-stone-200 rounded-xl shadow-xl p-4 w-64 space-y-4 text-stone-700 animate-in fade-in zoom-in-95 duration-100"
              style={{
                top: Math.min(activeQuickEdit.y, window.innerHeight - 280),
                left: Math.max(10, Math.min(activeQuickEdit.x, window.innerWidth - 270)),
              }}
            >
              <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                <span className="text-xs font-bold text-stone-800 truncate pr-2" title={currentTask.title}>
                  Quick Edit: {currentTask.title}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveQuickEdit(null)}
                  className="text-stone-400 hover:text-stone-600 rounded p-0.5 hover:bg-stone-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">Status</label>
                <select
                  className={cn(inputBase, "w-full text-xs py-1.5 px-2 bg-white")}
                  value={currentTask.status}
                  onChange={(e) => {
                    updateTaskStatus(currentTask.id, e.target.value as TaskStatus);
                    setActiveQuickEdit(null);
                  }}
                >
                  {taskStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">Priority</label>
                <select
                  className={cn(inputBase, "w-full text-xs py-1.5 px-2 bg-white")}
                  value={currentTask.priority}
                  onChange={(e) => {
                    updateTaskPriority(currentTask.id, e.target.value as Priority);
                    setActiveQuickEdit(null);
                  }}
                >
                  {PRIORITY_OPTIONS.map(prio => (
                    <option key={prio} value={prio}>{prio}</option>
                  ))}
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">Assignee</label>
                <select
                  className={cn(inputBase, "w-full text-xs py-1.5 px-2 bg-white")}
                  value={currentTask.assignedTo}
                  onChange={(e) => {
                    updateTaskAssignee(currentTask.id, e.target.value);
                    setActiveQuickEdit(null);
                  }}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default Tasks;
