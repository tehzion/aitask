import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Search, Filter, Paperclip, MoreHorizontal, CheckCircle2, X, RotateCcw, CalendarClock, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Department, Priority, Task, TaskStatus } from '../types';
import CreateTaskModal from '../components/CreateTaskModal';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, PageHeader, cardBase, inputBase, pageShell } from '../components/ui';
import { cn } from '../lib/utils';
import { canCreateTasks, canEditTask as canEditTaskByRole, getVisibleProjects, getVisibleTasks } from '../lib/access';

const STATUS_OPTIONS: TaskStatus[] = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
const PRIORITY_OPTIONS: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor', 'Client'];
const PAGE_SIZE = 8;

const statusColors: Record<TaskStatus, string> = {
  'Pending': 'bg-slate-100 text-slate-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Waiting Approval': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Cancelled': 'bg-red-100 text-red-700',
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
  const { tasks: allTasks, users, projects, updateTaskStatus, currentUser, rolePermissions } = useStore();
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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
        className={`text-xs px-2.5 py-1 rounded-full font-semibold outline-none cursor-pointer appearance-none border-none ${statusColors[task.status]}`}
        value={task.status}
        onChange={(e) => updateTaskStatus(task.id, e.target.value as TaskStatus)}
      >
        {STATUS_OPTIONS.map(status => (
          <option key={status} value={status} className="bg-white text-slate-900">{status}</option>
        ))}
      </select>
    ) : (
      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[task.status]}`}>
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
        action={canCreateTasks(currentUser, rolePermissions) ? <Button onClick={() => setIsModalOpen(true)}>+ New Task</Button> : null}
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
              {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')}>
              <option value="All">All priorities</option>
              {PRIORITY_OPTIONS.map(priority => <option key={priority} value={priority}>{priority}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label="Due from" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label="Due to" />
          </div>
        </div>

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
              {pagedTasks.map((task) => (
                <tr key={task.id} className="bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedTask(task)}>
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="font-semibold text-slate-900 truncate">{task.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{task.id} - {task.serviceType}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[170px]">
                    <div className="font-medium text-slate-800 truncate">{task.clientName}</div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">{task.projectName || 'Independent task'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md font-medium border border-slate-200">{task.department}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                        {getUserName(task.assignedTo).charAt(0)}
                      </div>
                      <span className="font-medium text-slate-700">{getUserName(task.assignedTo)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    <div className="text-slate-500 mb-0.5">Start: {format(parseISO(task.startDate), 'MMM dd')}</div>
                    <div className="font-medium text-slate-800">Due: {format(parseISO(task.dueDate), 'MMM dd')}</div>
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
                      <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-8">{task.completionPercentage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <div className="flex items-center gap-2">
                      {task.attachmentLink && (
                        <a href={task.attachmentLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-indigo-600" title={task.attachmentName || 'Attachment'}>
                          <Paperclip className="w-4 h-4" />
                        </a>
                      )}
                      {task.isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      <button className="hover:text-slate-700 p-1 rounded-md hover:bg-slate-200 transition-colors" title="Open task">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedTasks.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">No tasks found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-slate-100">
          {pagedTasks.map(task => (
            <button key={task.id} onClick={() => setSelectedTask(task)} className="w-full text-left p-4 bg-white hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 leading-5">{task.title}</div>
                  <div className="text-xs text-slate-500 mt-1 leading-5">{task.id} - {task.clientName} - {task.projectName || 'Independent task'}</div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${priorityColors[task.priority]}`}>{task.priority}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Due {format(parseISO(task.dueDate), 'MMM dd')}</span>
                <span className="truncate text-right">{getUserName(task.assignedTo)}</span>
                <span>{task.department}</span>
                <span className="truncate text-right">{task.serviceType}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div onClick={(e) => e.stopPropagation()}>{renderStatusControl(task)}</div>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${task.completionPercentage}%` }}></div>
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{task.completionPercentage}%</span>
                </div>
              </div>
              <div className="mt-3">{renderTaskBadges(task)}</div>
            </button>
          ))}
          {pagedTasks.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No tasks found matching your criteria.</div>}
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
      </div>

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <TaskDetailsModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedLiveTask}
      />
    </div>
  );
};

export default Tasks;
