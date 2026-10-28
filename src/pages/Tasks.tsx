import '../lib/actionFeedbackCopy';
import '../lib/taskStageCopy';
import SystemMessage from '../components/SystemMessage';
import { getTaskProgress } from '../lib/taskProgress';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isPendingMutationResolution, useStore } from '../store';
import { useI18n } from '../components/I18nProvider';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Building2, ExternalLink, Search, Paperclip, MoreHorizontal, X, SlidersHorizontal, ChevronDown, Mail, MapPin, Phone, Plus } from 'lucide-react';
import { format } from 'date-fns/format';
import { Priority, Task } from '../types';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, PageHeader } from '../components/ui';
import { cardBase, inputBase, pageShell, tableShell } from '../components/uiTokens';
import { cn, getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { canAssignTasksToOthers, canCreateTasks, canEditTask as canEditTaskByRole, getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import { SkeletonTableRow, SkeletonMobileCard } from '../components/SkeletonCard';
import { safeHttpsUrl } from '../lib/security';
import { DEPARTMENTS } from '../lib/departments';
import { assignableTaskAssignees } from '../lib/taskWorkflowAccess';
import { getOperationsPeriod, isTaskOpen, isTaskOverdue, type TeamWorkloadPeriod } from '../lib/taskReporting';
import { getClientTaskStage } from '../lib/clientPortal';
import { getLocalizedDepartment, getLocalizedPriority, getLocalizedTaskStatus } from '../lib/localeLabels';
import { TaskCard, TaskStatusBadges } from '../components/TaskCard';
import { useTaskNextStep } from '../hooks/useTaskNextStep';
import { countTasksByStageFilter, isTaskInStageFilter, parseTaskStageFilter, TASK_STAGE_FILTER_LABELS, TASK_STAGE_FILTERS, type TaskStageFilter } from '../lib/taskStage';
import { formatLocalizedDate } from '../lib/i18n';
import StaffAllWork from '../components/StaffAllWork';
import ClientDeliveries from '../components/ClientDeliveries';
import { useImeSafeInput } from '../hooks/useImeSafeInput';
import { useLocalToday } from '../hooks/useLocalToday';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import PersonalTaskViews from '../components/PersonalTaskViews';
import { taskPreferencesKey } from '../lib/personalTaskViews';
import { shouldApplyTaskListScope, TASK_LIST_SCOPE_PARAM } from '../lib/taskListScope';

const CLIENT_BOARD_COLUMNS = [
  { value: 'active', label: 'In progress' },
  { value: 'awaiting_review', label: 'Awaiting your review' },
  { value: 'approved', label: 'Approved' },
] as const;

const PRIORITY_OPTIONS: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const PAGE_SIZE = 8;
const normalizeClientName = (value: string) => value.trim().toLowerCase();

const statusColors: Record<string, string> = {
  'Pending': 'bg-slate-100 text-slate-700 border border-slate-200',
  'In Progress': 'bg-blue-50 text-blue-700 border border-blue-100',
  'Waiting Approval': 'bg-amber-50 text-amber-800 border border-amber-100',
  'Completed': 'bg-emerald-50 text-emerald-800 border border-emerald-100',
  'Cancelled': 'bg-red-50 text-red-700 border border-red-100',
};

const getStatusColor = (status: string): string => {
  return statusColors[status] || 'bg-slate-100 text-slate-700 border border-slate-200';
};

const priorityText: Record<Priority, string> = {
  'Low': 'text-muted',
  'Medium': 'text-muted',
  'High': 'font-semibold text-ink',
  'Urgent': 'font-semibold text-red-700 dark:text-red-300',
};

const NextStepText: React.FC<{ task: Task }> = ({ task }) => {
  const { t } = useI18n();
  const nextStep = useTaskNextStep(task);
  return nextStep ? <div className="mt-1 text-xs font-semibold text-accent">{t('Next')}: {t(nextStep)}</div> : null;
};

const TasksWorkspace: React.FC = () => {
  const { locale, t } = useI18n();
  const today = useLocalToday();
  const { tasks: allTasks, clients: clientProfiles, users, projects, updateTaskPriority, updateTaskAssignee, currentUser, rolePermissions, backend, taskStatuses, setCreateTaskModalOpen, commitPendingMutation } = useStore(useShallow(state => ({
    tasks: state.tasks,
    clients: state.clients,
    users: state.users,
    projects: state.projects,
    updateTaskPriority: state.updateTaskPriority,
    updateTaskAssignee: state.updateTaskAssignee,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    backend: state.backend,
    taskStatuses: state.taskStatuses,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
    commitPendingMutation: state.commitPendingMutation,
  })));
  const [activeQuickEdit, setActiveQuickEdit] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [quickSyncError, setQuickSyncError] = useState('');
  const pendingResolution = isPendingMutationResolution(backend);

  const persistQuickChange = async (previousTask: Task) => {
    const session = captureWorkspaceSession();
    const actorId = useStore.getState().currentUser?.id;
    const submittedTask = useStore.getState().tasks.find(task => task.id === previousTask.id);
    let result: { ok: boolean; error?: string };
    try { result = await commitPendingMutation(); }
    catch (error) { result = { ok: false, error: error instanceof Error ? error.message : 'Unable to save this change.' }; }
    if (!isWorkspaceSessionCurrent(session) || useStore.getState().currentUser?.id !== actorId) return false;
    if (result.ok) {
      setQuickSyncError('');
      return true;
    }
    useStore.setState(state => ({
      tasks: state.tasks.map(task => {
        // A pull or another edit may have replaced this row while saving. Only
        // undo the exact optimistic row submitted by this action.
        if (task !== submittedTask) return task;
        return { ...previousTask };
      }),
    }));
    setQuickSyncError(result.error || 'The quick change was rolled back. Use Retry my changes to confirm it safely.');
    return false;
  };

  const handleQuickEditClick = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    if (backend.upgradeRequired || pendingResolution || !canEditTaskByRole(currentUser, task, rolePermissions, { clients: clientProfiles, projects })) {
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
    if (backend.upgradeRequired || pendingResolution || !canEditTaskByRole(currentUser, task, rolePermissions, { clients: clientProfiles, projects })) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveQuickEdit({
      taskId: task.id,
      x: e.clientX,
      y: e.clientY + 4,
    });
  };

  const getDeptBadge = (dept: string) => {
    switch (dept) {
      case 'Designer':          return 'bg-accent-soft text-accent border border-accent/20';
      case 'Editor':
      case 'Video Editor':      return 'bg-sky-50 text-sky-700 border border-sky-100';
      case 'Videoshooting':
      case 'Video Shooting':    return 'bg-cyan-50 text-cyan-700 border border-cyan-100';
      case 'Ads Management':    return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Account & Finance': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Management':        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'Operation':         return 'bg-slate-100 text-slate-700 border border-slate-200';
      default:                  return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const viewType = searchParams.get('view') === 'board' ? 'board' : 'table';
  const setViewType = useCallback((value: 'table' | 'board') => {
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('view', value); return next; }, { replace: true });
  }, [setSearchParams]);
  const projectIdFilter = searchParams.get('projectId');
  const clientRouteFilter = searchParams.get('client') || '';
  const taskIdFilter = searchParams.get('taskId');
  const assigneeRouteFilter = searchParams.get('assignee') || '';
  const routeFocus = searchParams.get('focus') || '';
  const requestedPeriod = searchParams.get('period');
  const periodRouteFilter: TeamWorkloadPeriod | '' = requestedPeriod === 'today' || requestedPeriod === 'week' || requestedPeriod === 'overall'
    ? requestedPeriod
    : '';
  const routeSearch = searchParams.get('search') || '';
  const listScope: TaskStageFilter = parseTaskStageFilter(searchParams.get(TASK_LIST_SCOPE_PARAM));

  const updateSearch = useCallback((value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const searchInput = useImeSafeInput(routeSearch, updateSearch, { commitDelayMs: 180 });
  const searchTerm = searchInput.value;
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'All') next.set(key, value); else next.delete(key);
    if (key === 'client' || key === 'assignee') next.delete('period');
    setSearchParams(next, { replace: true });
  };
  const filterDepartment = searchParams.get('department') || 'All';
  const setFilterDepartment = (value: string) => setFilter('department', value);
  const filterAssignee = assigneeRouteFilter || 'All';
  const setFilterAssignee = (value: string) => setFilter('assignee', value);
  const filterClient = clientRouteFilter || 'All';
  const setFilterClient = (value: string) => setFilter('client', value);
  const filterStatus = searchParams.get('status') || 'All';
  const setFilterStatus = (value: string) => setFilter('status', value);
  const filterPriority = searchParams.get('priority') || 'All';
  const setFilterPriority = (value: string) => setFilter('priority', value);
  const dateFrom = searchParams.get('dueFrom') || '';
  const setDateFrom = (value: string) => setFilter('dueFrom', value);
  const dateTo = searchParams.get('dueTo') || '';
  const setDateTo = (value: string) => setFilter('dueTo', value);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[data-aitask-modal-portal]')) return;
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
        if (document.querySelector('[data-aitask-modal-portal]')) return;
        setViewType('board');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setViewType]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority, dateFrom, dateTo, projectIdFilter, clientRouteFilter, taskIdFilter, assigneeRouteFilter, periodRouteFilter, listScope]);

  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients: clientProfiles, projects }),
    [allTasks, clientProfiles, currentUser, projects, rolePermissions]
  );
  const isClientUser = currentUser?.role === 'Client';

  const visibleProjects = useMemo(
    () => getVisibleProjects(currentUser, projects, allTasks, rolePermissions, { clients: clientProfiles, projects }),
    [allTasks, clientProfiles, currentUser, projects, rolePermissions]
  );

  const visibleClientKeys = useMemo(() => new Set(
    [...tasks.map(task => normalizeClientName(task.clientName)), ...visibleProjects.map(project => normalizeClientName(project.clientName))]
      .filter(Boolean)
  ), [tasks, visibleProjects]);

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

  const routePeriodBounds = useMemo(() => {
    const todayKey = format(today, 'yyyy-MM-dd');
    if (periodRouteFilter === 'today') return { from: todayKey, to: todayKey };
    if (periodRouteFilter === 'week') {
      const period = getOperationsPeriod(today, locale);
      return { from: format(period.start, 'yyyy-MM-dd'), to: format(period.end, 'yyyy-MM-dd') };
    }
    return null;
  }, [locale, periodRouteFilter, today]);

  const applyListScope = shouldApplyTaskListScope({ statusFilter: filterStatus, taskId: taskIdFilter });
  // Every filter except the stage tab, so each tab can show its own count.
  const unscopedTasks = useMemo(() => {
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
      const matchesAssignee = assigneeRouteFilter
        ? task.assignedTo === assigneeRouteFilter
        : filterAssignee === 'All' || task.assignedTo === filterAssignee;
      const matchesClient = clientRouteFilter
        ? normalizeClientName(task.clientName) === normalizeClientName(clientRouteFilter)
        : filterClient === 'All' || normalizeClientName(task.clientName) === normalizeClientName(filterClient);
      const matchesStatus = filterStatus === 'All' || task.status === filterStatus;
      const matchesPriority = filterPriority === 'All' || task.priority === filterPriority;
      const matchesDateFrom = !dateFrom || (task.dueDate && task.dueDate >= dateFrom);
      const matchesDateTo = !dateTo || (task.dueDate && task.dueDate <= dateTo);
      const matchesProject = projectIdFilter ? task.projectId === projectIdFilter : true;
      const matchesTask = taskIdFilter ? task.id === taskIdFilter : true;
      const matchesRoutePeriod = !routePeriodBounds || Boolean(
        task.dueDate
        && task.dueDate >= routePeriodBounds.from
        && task.dueDate <= routePeriodBounds.to
      );
      const matchesFocus = routeFocus === 'overdue'
        ? isTaskOverdue(task, today)
        : routeFocus === 'waiting'
          ? task.status === 'Waiting Approval' && isTaskOpen(task)
          : true;

      return matchesSearch && matchesDept && matchesAssignee && matchesClient && matchesStatus && matchesPriority && matchesDateFrom && matchesDateTo && matchesProject && matchesTask && matchesRoutePeriod && matchesFocus;
    });
  }, [assigneeRouteFilter, clientRouteFilter, dateFrom, dateTo, filterAssignee, filterClient, filterDepartment, filterPriority, filterStatus, projectIdFilter, routeFocus, routePeriodBounds, searchTerm, taskIdFilter, tasks, users, today]);
  const stageCounts = useMemo(() => countTasksByStageFilter(unscopedTasks), [unscopedTasks]);
  const filteredTasks = useMemo(() => (
    isClientUser || !applyListScope ? unscopedTasks : unscopedTasks.filter(task => isTaskInStageFilter(task, listScope))
  ), [applyListScope, isClientUser, listScope, unscopedTasks]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTasks = filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeProject = projectIdFilter ? visibleProjects.find(p => p.id === projectIdFilter) : null;
  const activeAssignee = assigneeRouteFilter ? users.find(user => user.id === assigneeRouteFilter && user.role !== 'Client') : undefined;
  const activeClient = clientRouteFilter || '';
  const activeClientKey = normalizeClientName(activeClient);
  const canViewActiveClient = visibleClientKeys.has(activeClientKey);
  const activeClientProfile = activeClient && canViewActiveClient
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
  const selectedLiveTask = tasks.find(t => t.id === selectedTask?.id) || null;
  const activeQuickTask = activeQuickEdit ? tasks.find(t => t.id === activeQuickEdit.taskId) : undefined;

  useEffect(() => {
    if (!activeQuickEdit) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveQuickEdit(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeQuickEdit]);

  useEffect(() => {
    if (!taskIdFilter) return;
    const routedTask = tasks.find(task => task.id === taskIdFilter);
    if (!routedTask) {
      setSelectedTask(null);
      return;
    }
    setSelectedTask(current => current?.id === routedTask.id ? current : routedTask);
  }, [taskIdFilter, tasks]);

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const canEditTask = (task: Task) => (
    !backend.upgradeRequired
    && !pendingResolution
    && canEditTaskByRole(currentUser, task, rolePermissions, { clients: clientProfiles, projects })
  );
  const isClientReviewReady = (task: Task) => (
    task.clientApprovalStatus !== 'Approved'
    && (task.status === 'Approved' || task.status === 'Completed' || task.isCompleted)
  );
  const clientTaskAction = (task: Task) => isClientReviewReady(task)
    ? 'Review task'
    : task.comments?.length
      ? 'Leave feedback'
      : 'View details';
  const canAssignOthers = canAssignTasksToOthers(currentUser, rolePermissions, activeQuickTask);
  const TABLE_COLUMN_COUNT = isClientUser ? 4 : 6;
  const hasAnyFilter = [searchTerm, dateFrom, dateTo, activeClient, assigneeRouteFilter, periodRouteFilter, routeFocus].some(Boolean) || [filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority].some(value => value !== 'All') || projectIdFilter || taskIdFilter;
  const activeFilterLabels = [
    searchTerm && `Search: ${searchTerm}`,
    filterDepartment !== 'All' && filterDepartment,
    assigneeRouteFilter
      ? `Assignee: ${activeAssignee?.name || 'Unknown'}`
      : filterAssignee !== 'All' && `Assignee: ${getUserName(filterAssignee)}`,
    activeClient ? `Client: ${activeClient}` : filterClient !== 'All' && filterClient,
    filterStatus !== 'All' && filterStatus,
    filterPriority !== 'All' && filterPriority,
    dateFrom && `From ${dateFrom}`,
    dateTo && `To ${dateTo}`,
    activeProject && activeProject.projectName,
    taskIdFilter && taskIdFilter,
    routeFocus === 'overdue' && 'Overdue',
    routeFocus === 'waiting' && 'Waiting approval',
    periodRouteFilter && (periodRouteFilter === 'today' ? 'Today' : periodRouteFilter === 'week' ? 'This week' : 'Overall'),
  ].filter((label): label is string => Boolean(label));

  const emptyListMessage = tasks.length === 0
    ? 'No tasks assigned yet.'
    : hasAnyFilter
      ? 'No tasks match your filters.'
      : listScope === 'active'
        ? 'No active tasks. Completed work stays under Completed.'
        : 'No tasks in this stage.';

  const clearRouteFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  };

  // Stage tabs and deadline chips are independent: a task can be In progress and Overdue.
  const applyStageFilter = (value: TaskStageFilter) => {
    const next = new URLSearchParams(searchParams);
    next.delete('status');
    if (routeFocus === 'waiting') next.delete('focus');
    if (value === 'active') next.delete(TASK_LIST_SCOPE_PARAM);
    else next.set(TASK_LIST_SCOPE_PARAM, value);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const toggleDeadlineFilter = (value: 'today' | 'overdue') => {
    const isOn = value === 'today' ? periodRouteFilter === 'today' : routeFocus === 'overdue';
    const next = new URLSearchParams(searchParams);
    ['focus', 'period', 'dueFrom', 'dueTo'].forEach(key => next.delete(key));
    if (!isOn && value === 'today') next.set('period', 'today');
    if (!isOn && value === 'overdue') next.set('focus', 'overdue');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const clearAllFilters = () => {
    searchInput.commit('');
    setSearchParams(new URLSearchParams({ view: viewType }), { replace: true });
  };

  const clientStatusLabel = (task: Task) => {
    if (task.status === 'Cancelled') return 'Cancelled';
    if (task.clientApprovalStatus === 'Approved') return 'Approved';
    if (task.status === 'Approved' || task.status === 'Completed' || task.isCompleted) return 'Awaiting your review';
    return 'In progress';
  };

  const renderStatusControl = (task: Task) => (
    isClientUser
      ? <span className={`inline-flex text-xs px-2.5 py-1 rounded-md font-semibold ${getStatusColor(task.status)}`}>{t(clientStatusLabel(task))}</span>
      : <TaskStatusBadges task={task} />
  );

  return (
    <div className={pageShell}>
      <PageHeader
        title={isClientUser ? t('Company Tasks') : t('Tasks')}
        description={isClientUser
          ? t('Track your company work, review deliverables, and share feedback.')
          : t('Active assignments, reviews, and deadlines across the agency.')}
        onboardingTarget="tasks-overview"
        action={canCreateTasks(currentUser, rolePermissions) ? (
          <Button data-onboarding-target="create-task" onClick={() => setCreateTaskModalOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('New task')}
          </Button>
        ) : null}
      />

      {quickSyncError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
          <SystemMessage message={quickSyncError} />
        </div>
      )}

      {activeProject && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
          <span className="text-sm font-medium flex-1">
            {t('Viewing tasks for')} <strong className="font-bold" data-i18n-skip>{activeProject.projectName}</strong> <span data-i18n-skip>({activeProject.clientName})</span>
          </span>
          <button onClick={() => clearRouteFilter('projectId')} className="p-1.5 hover:bg-blue-200/50 rounded-md transition-colors" title={t('Clear project filter')} aria-label={t('Clear project filter')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {taskIdFilter && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-amber-800">
          <span className="text-sm font-medium flex-1">{t('Viewing specific task:')} <strong className="font-bold" data-i18n-skip>{taskIdFilter}</strong></span>
          <button onClick={() => { setSelectedTask(null); clearRouteFilter('taskId'); }} className="p-1.5 hover:bg-amber-200/50 rounded-md transition-colors" title={t('Clear task filter')} aria-label={t('Clear task filter')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeAssignee && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t('Assigned to')} <strong data-i18n-skip className="font-bold">{activeAssignee.name}</strong>
            {periodRouteFilter && periodRouteFilter !== 'overall' ? ` · ${periodRouteFilter === 'today' ? t('Today') : t('This week')}` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('assignee');
              next.delete('period');
              setSearchParams(next);
            }}
            className="rounded-md p-1.5 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
            title={t('Clear assignee filter')}
            aria-label={t('Clear assignee filter')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {routeFocus && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent-soft px-4 py-3 text-accent">
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t('Showing')} <strong className="font-bold">{routeFocus === 'overdue' ? t('overdue tasks') : routeFocus === 'waiting' ? t('tasks waiting for approval') : t('focused tasks')}</strong>
          </span>
          <button
            type="button"
            onClick={() => clearRouteFilter('focus')}
            className="rounded-md p-1.5 transition hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent/30"
            title={t('Clear focus filter')}
            aria-label={t('Clear focus filter')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {activeClient && !(isClientUser && !canViewActiveClient) && (
        <div className={`${cardBase} overflow-hidden`}>
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <Link to="/clients" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">
                  <ArrowLeft className="h-4 w-4" /> {t('Back to Delivery tracker')}
                </Link>
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted">{t('Client task view')}</p>
                    <h2 data-i18n-skip className="mt-1 truncate text-xl font-bold text-slate-950">{activeClient}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                      {activeClientProfile?.contactPerson || activeClientFallbackDetails ? <span data-i18n-skip>{activeClientProfile?.contactPerson || activeClientFallbackDetails}</span> : t('No saved contact person yet.')}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => clearRouteFilter('client')}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
              >
                <X className="h-4 w-4" /> {t('Clear client filter')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-3">
                <p className="text-xs font-medium text-slate-500">{t('Tasks')}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeClientTasks.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-3">
                <p className="text-xs font-medium text-slate-500">{t('Open')}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeClientOpenTasks}</p>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-3">
                <p className="text-xs font-medium text-slate-500">{t('Done')}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{activeClientCompletedTasks}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {!canViewActiveClient ? (
                <span className="inline-flex items-center gap-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> {t('This client is outside your assigned work. Contact details are hidden.')}
                </span>
              ) : (
                <>
              {activeClientProfile?.email && (
                <span className="inline-flex items-center gap-2 truncate">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" /> <span data-i18n-skip>{activeClientProfile.email}</span>
                </span>
              )}
              {activeClientProfile?.phone && (
                <span className="inline-flex items-center gap-2 truncate">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" /> <span data-i18n-skip>{activeClientProfile.phone}</span>
                </span>
              )}
              {activeClientProfile?.address && (
                <span className="inline-flex items-center gap-2 sm:col-span-2">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> <span className="line-clamp-2">{activeClientProfile.address}</span>
                </span>
              )}
                </>
              )}
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" /> {activeClientProjects.length} {activeClientProjects.length === 1 ? t('company record') : t('company records')}
              </span>
              {(activeClientWebsite || activeClientFacebook) && (
                <span className="inline-flex items-center gap-3">
                  {activeClientWebsite && (
                    <a href={activeClientWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                      {t('Website')} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {activeClientFacebook && (
                    <a href={activeClientFacebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                      <span data-i18n-skip>Facebook</span> <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`${tableShell} flex flex-col`}>
        <div className="space-y-4 border-b border-slate-200 bg-slate-50/70 p-4">
          {!isClientUser && (
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="no-scrollbar -mx-4 min-w-0 overflow-x-auto px-4 xl:mx-0 xl:px-0">
                <div className="flex w-max gap-1 border-b border-line" role="group" aria-label={t('Task stages')}>
                  {TASK_STAGE_FILTERS.map(value => {
                    const isActive = applyListScope && listScope === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => applyStageFilter(value)}
                        className={cn(
                          'relative min-h-11 shrink-0 px-3 text-sm font-semibold transition-colors duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40',
                          isActive ? 'text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:text-ink',
                        )}
                      >
                        {t(TASK_STAGE_FILTER_LABELS[value])}{' '}
                        <span className="calm-number ml-1 text-xs font-medium opacity-70">{stageCounts[value]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label={t('Deadline filters')}>
                {([
                  ['today', t('Due today'), periodRouteFilter === 'today' || (!routeFocus && dateFrom === format(today, 'yyyy-MM-dd') && dateTo === format(today, 'yyyy-MM-dd'))],
                  ['overdue', t('Overdue'), routeFocus === 'overdue'],
                ] as const).map(([value, label, isActive]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => toggleDeadlineFilter(value)}
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                      isActive ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative w-full lg:max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                data-onboarding-target="task-search"
                aria-label={t('Filter tasks')}
                className={cn(inputBase, 'block py-2 pl-10 pr-3')}
                placeholder={isClientUser ? t('Search company tasks...') : t('Search tasks, clients, assignees...')}
                {...searchInput.inputProps}
              />
            </div>

            <div className="text-sm text-muted" aria-live="polite">
              {filteredTasks.length} {filteredTasks.length === 1 ? t('matching task') : t('matching tasks')}
            </div>

            {/* View Toggle */}
            <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white p-1 sm:ml-auto" role="group" aria-label={t('Task view')}>
              <button
                type="button"
                onClick={() => setViewType('table')}
                aria-pressed={viewType === 'table'}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  viewType === 'table'
                    ? "bg-inset text-ink ring-1 ring-line"
                    : "text-muted hover:text-ink"
                )}
              >
                {t('Table')}
              </button>
              <button
                type="button"
                onClick={() => setViewType('board')}
                aria-pressed={viewType === 'board'}
                aria-keyshortcuts="B"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  viewType === 'board'
                    ? "bg-inset text-ink ring-1 ring-line"
                    : "text-muted hover:text-ink"
                )}
              >
                {t('Board')}
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
                {t('Filters')} {activeFilterLabels.length > 0 && `(${activeFilterLabels.length})`}
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', filtersOpen && 'rotate-180')} />
            </Button>

            {hasAnyFilter && (
              <button onClick={clearAllFilters} className="lg:ml-auto text-sm font-semibold text-slate-600 hover:text-blue-600">
                {t('Clear filters')}
              </button>
            )}
          </div>

          {activeFilterLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterLabels.map(label => <Badge key={label} tone="indigo">{t(label)}</Badge>)}
            </div>
          )}

          <div className={cn('grid-cols-1 gap-3 sm:grid-cols-2', isClientUser ? 'lg:grid-cols-3' : 'lg:grid-cols-4', filtersOpen ? 'grid' : 'hidden lg:grid')}>
            {!isClientUser && <div className="relative">
              <select aria-label={t('Filter by department')} value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">{t('All departments')}</option>
                {departmentOptions.map(dept => <option key={dept} value={dept}>{getLocalizedDepartment(dept, locale)}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>}
            {!isClientUser && <div className="relative">
              <select
                aria-label={t('Filter by assignee')}
                value={filterAssignee}
                onChange={(e) => {
                  setFilterAssignee(e.target.value);
                }}
                className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}
              >
                <option value="All">{t('All assignees')}</option>
                {assigneeOptions.map(user => <option key={user.id} data-i18n-skip value={user.id}>{user.name}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>}
            {!isClientUser && <div className="relative">
              <select aria-label={t('Filter by client')} value={filterClient} onChange={(e) => {
                setFilterClient(e.target.value);
              }} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">{t('All clients')}</option>
                {clientOptions.map(client => <option key={client} value={client}>{client}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>}
            {!isClientUser && <div className="relative">
              <select aria-label={t('Filter by status')} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">{t('All statuses')}</option>
                {[...new Set([...taskStatuses, 'Approved'])].map(status => <option key={status} value={status}>{getLocalizedTaskStatus(status, locale)}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>}
            {!isClientUser && <div className="relative">
              <select aria-label={t('Filter by priority')} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={cn(inputBase, 'p-2 pr-8 text-slate-700 appearance-none cursor-pointer')}>
                <option value="All">{t('All priorities')}</option>
                {PRIORITY_OPTIONS.map(priority => <option key={priority} value={priority}>{getLocalizedPriority(priority, locale)}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
            </div>}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label={t('Due from')} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={cn(inputBase, 'p-2 text-slate-700')} aria-label={t('Due to')} />
          </div>
        </div>

        {viewType === 'table' ? (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[960px] text-left text-sm text-muted">
                <thead className="border-b border-line bg-inset/60 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">{t('Task')}</th>
                    {!isClientUser && <th scope="col" className="px-3 py-3 font-semibold">{t('Assigned to')}</th>}
                    <th scope="col" className="px-3 py-3 font-semibold">{t('Due')}</th>
                    {!isClientUser && <th scope="col" className="px-3 py-3 font-semibold">{t('Priority')}</th>}
                    <th scope="col" className="px-3 py-3 font-semibold">{t('Status')}</th>
                    <th scope="col" className="w-12 px-3 py-3 font-semibold"><span className="sr-only">{isClientUser ? t('Contact / Action') : t('Actions')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {backend?.isLoading ? (
                    Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonTableRow key={i} />)
                  ) : (
                    pagedTasks.map((task) => {
                      const dueDateParsed = parseOptionalDate(task.dueDate);
                      const isOverdue = isTaskOverdue(task, today);
                      const attachment = task.attachmentLink ? safeHttpsUrl(task.attachmentLink) : undefined;

                      return (
                        <tr
                          key={task.id}
                          className="cursor-pointer bg-surface text-ink transition-colors duration-160 hover:bg-inset/60"
                          onClick={() => setSelectedTask(task)}
                          onContextMenu={(e) => handleRowContextMenu(e, task)}
                        >
                          <td className="max-w-[26rem] px-4 py-3">
                            <div data-i18n-skip className="truncate text-xs font-medium text-muted">{task.clientName}{task.projectName ? ` · ${task.projectName}` : ''}{!isClientUser && task.department ? ` · ${getLocalizedDepartment(task.department, locale)}` : ''}</div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                              className="mt-0.5 block max-w-full truncate text-left font-semibold text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                            ><span data-i18n-skip>{task.title}</span></button>
                            {!isClientUser && <NextStepText task={task} />}
                          </td>
                          {!isClientUser && <td className="whitespace-nowrap px-3 py-3">
                            <span data-i18n-skip className="text-sm">{task.assignedTo ? getUserName(task.assignedTo) : t('Unassigned')}</span>
                          </td>}
                          <td className="whitespace-nowrap px-3 py-3">
                            <span
                              className={cn('text-sm', isOverdue ? 'font-semibold text-red-700 dark:text-red-300' : 'text-ink')}
                              title={dueDateParsed ? `${t('Due')}: ${formatLocalizedDate(dueDateParsed, locale)}` : t('common.noDueDate')}
                            >
                              {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status, locale)}
                            </span>
                          </td>
                          {!isClientUser && <td className="whitespace-nowrap px-3 py-3">
                            <span className={cn('text-sm', priorityText[task.priority])}>{getLocalizedPriority(task.priority, locale)}</span>
                          </td>}
                          <td className="whitespace-nowrap px-3 py-3">
                            {renderStatusControl(task)}
                            {isClientUser && <div className="mt-1 text-xs font-semibold text-accent">{t(clientTaskAction(task))}</div>}
                          </td>
                          <td className="px-3 py-3 text-muted" onClick={(e) => e.stopPropagation()}>
                            {!isClientUser && <div className="flex items-center justify-end gap-1">
                              {task.attachmentLink && (attachment
                                ? <a href={attachment} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-control hover:bg-inset hover:text-ink" title={task.attachmentName || t('Output link')} aria-label={t('Output link')}><Paperclip className="h-4 w-4" aria-hidden="true" /></a>
                                : <span title={t('Invalid attachment link')} className="inline-flex h-9 w-9 items-center justify-center"><Paperclip className="h-4 w-4" aria-hidden="true" /></span>)}
                              {canEditTask(task) && <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-control transition-colors hover:bg-inset hover:text-ink"
                                title={t('Quick Edit')}
                                aria-label={t('Quick Edit')}
                                onClick={(e) => handleQuickEditClick(e, task)}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>}
                            </div>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {!backend?.isLoading && pagedTasks.length === 0 && (
                    <tr>
                      <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-12 text-center">
                        <p className="font-semibold text-ink">{t(emptyListMessage)}</p>
                        {tasks.length > 0 && <p className="mt-1 text-sm text-muted">{t('Try another stage or clear your filters.')}</p>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-px bg-line/70 md:grid-cols-2 xl:hidden">
              {backend?.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonMobileCard key={i} />)
              ) : (
                pagedTasks.map(task => (
                  <TaskCard key={task.id} task={task} allTasks={tasks} users={users} onOpen={setSelectedTask} className="bg-surface" />
                ))
              )}
              {!backend?.isLoading && pagedTasks.length === 0 && <div className="bg-surface px-4 py-12 text-center md:col-span-2">
                <p className="font-semibold text-ink">{t(emptyListMessage)}</p>
                {tasks.length > 0 && <p className="mt-1 text-sm text-muted">{t('Try another stage or clear your filters.')}</p>}
              </div>}
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-line bg-inset/60 p-4 text-sm sm:flex-row">
              <span className="text-muted">
                {t('Showing')} {filteredTasks.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} {t('to')} {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} {t('of')} {filteredTasks.length} {t('entries')}
              </span>
              <div className="flex gap-1">
                <button disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="min-h-9 rounded-control border border-line bg-surface px-3 text-ink disabled:cursor-not-allowed disabled:text-muted/60">{t('Previous')}</button>
                <span className="calm-number inline-flex min-h-9 items-center px-3 font-medium text-ink" aria-current="page">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="min-h-9 rounded-control border border-line bg-surface px-3 text-ink disabled:cursor-not-allowed disabled:text-muted/60">{t('Next')}</button>
              </div>
            </div>
          </>
        ) : (
          /* Kanban Board View */
          <div className={cn('p-4 bg-slate-100', !isClientUser && 'overflow-x-auto')}>
            <div className={cn(isClientUser ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3' : 'flex min-w-[1000px] items-start gap-4')}>
              {(isClientUser ? CLIENT_BOARD_COLUMNS : taskStatuses).map(column => {
                const status = isClientUser ? column.value : column;
                const columnTasks = isClientUser
                  ? filteredTasks.filter(t => getClientTaskStage(t) === status)
                  : filteredTasks.filter(t => t.status === status);
                const hiddenByScope = !isClientUser && applyListScope && !isTaskInStageFilter({ status, isCompleted: status === 'Completed' }, listScope);
                return (
                  <div
                    key={status}
                    className={cn('flex max-h-[700px] flex-col rounded-lg border border-slate-200 bg-slate-50 p-3', !isClientUser && 'min-w-[260px] flex-1')}
                  >
                    {/* Column Header */}
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-line shrink-0">
                      <span className="text-xs font-semibold text-slate-600">{isClientUser ? t(column.label) : getLocalizedTaskStatus(status, locale)}</span>
                      {hiddenByScope && <button type="button" onClick={() => applyStageFilter('all')} className="text-[11px] font-semibold text-accent hover:underline">{t('Show')}</button>}
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
                          const isOverdue = isTaskOverdue(task, today);

                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTask(task)}
                              className={cn(
                                "relative cursor-pointer select-none rounded-lg border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50",
                                isOverdue && "border-red-200 bg-red-50/10 hover:bg-red-50/20",
                                "cursor-pointer"
                              )}
                            >
                              {isOverdue && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 rounded-t-lg"></div>
                              )}

                              <div className="flex justify-between items-start gap-1">
                                <h4 data-i18n-skip className={cn("text-xs font-bold leading-5 truncate flex-1", isOverdue ? "text-red-900" : "text-slate-800")}>
                                  {task.title}
                                </h4>
                                {!isClientUser && <Badge tone={task.priority === 'Urgent' ? 'red' : task.priority === 'High' ? 'amber' : task.priority === 'Medium' ? 'blue' : 'slate'} className="text-[9px] px-1.5 py-0 shrink-0">
                                  {getLocalizedPriority(task.priority, locale)}
                                </Badge>}
                              </div>

                              <div data-i18n-skip className="text-[10px] text-slate-500 mt-1.5 truncate">
                                {isClientUser ? task.serviceType : `${task.clientName}${task.projectName ? ` · ${task.projectName}` : ''}`}
                              </div>

                              {!isClientUser && <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", getDeptBadge(task.department))}>
                                  {getLocalizedDepartment(task.department, locale)}
                                </span>
                                <span className="text-[9px] text-slate-500 font-medium">
                                  {task.serviceType}
                                </span>
                              </div>}

                              <div className="mt-3 flex items-center justify-between text-[10px]">
                                <span
                                  className={cn("font-medium", isOverdue ? "text-red-600 font-extrabold" : "text-slate-500")}
                                  title={dueDateParsed ? `${t('Due')}: ${formatLocalizedDate(dueDateParsed, locale)}` : t('common.noDueDate')}
                                >
                                  {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status, locale)}
                                </span>
                                <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  <div className="w-4 h-4 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[9px] font-bold">
                                    {getUserName(task.assignedTo).charAt(0)}
                                  </div>
                                  <span className="text-slate-600 font-semibold text-[9px] max-w-[50px] truncate">{getUserName(task.assignedTo)}</span>
                                </div>
                              </div>

                              {/* Progress bar */}
	                              <div className="mt-2.5 flex items-center gap-1.5">
                                <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/40">
                                  <div className="bg-accent h-full rounded-full" style={{ width: `${getTaskProgress(task, users, isClientUser)}%` }}></div>
	                              </div>
                                <span className="text-[9px] font-bold text-slate-600 shrink-0">{getTaskProgress(task, users, isClientUser)}%</span>
                              </div>

                              {isClientUser && (
                                <div className="mt-2.5 border-t border-slate-100 pt-2">
                                  <span className="text-xs font-semibold text-accent">{clientTaskAction(task)}</span>
                                </div>
                              )}

                              {/* Action Badges in Card */}
                              {(task.attachmentLink || task.revisionCount > 0) && (
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2 text-[9px] text-slate-500">
                                  {task.attachmentLink && <Paperclip className="w-3 h-3 text-slate-400" />}
                                  {task.revisionCount > 0 && <span className="text-amber-700 font-bold">{task.revisionCount} {t('rev')}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {!backend?.isLoading && columnTasks.length === 0 && (
                        <div className="text-center py-6 text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50/30">
                          {t('No tasks in this status')}
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
        onClose={() => {
          setSelectedTask(null);
          if (taskIdFilter) clearRouteFilter('taskId');
        }}
        task={selectedLiveTask}
      />

      {/* Quick Edit Popover */}
      {activeQuickEdit && (() => {
        const currentTask = tasks.find(t => t.id === activeQuickEdit.taskId);
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
              role="dialog"
              aria-modal="true"
              aria-label={t('Quick Edit')}
              className="animate-fade-in fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-4 w-64 space-y-4 text-slate-700"
              style={{
                top: Math.min(activeQuickEdit.y, window.innerHeight - 280),
                left: Math.max(10, Math.min(activeQuickEdit.x, window.innerWidth - 270)),
              }}
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 truncate pr-2" title={currentTask.title}>
                  {t('Quick Edit')}: <span data-i18n-skip>{currentTask.title}</span>
                </span>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setActiveQuickEdit(null)}
                  className="text-slate-400 hover:text-slate-600 rounded p-0.5 hover:bg-slate-50"
                  aria-label={t('Close quick edit')}
                  title={t('Close quick edit')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">{t('Status')}</label>
                <span className={`inline-flex rounded-md px-2.5 py-1.5 text-xs font-semibold ${getStatusColor(currentTask.status)}`}>
                  {getLocalizedTaskStatus(currentTask.status, locale)}
                </span>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">{t('Priority')}</label>
                <div className="relative">
                  <select
                    className={cn(inputBase, "w-full text-xs py-1.5 pl-2.5 pr-8 bg-white appearance-none cursor-pointer")}
                    value={currentTask.priority}
                    onChange={(e) => {
                      const localResult = updateTaskPriority(currentTask.id, e.target.value as Priority);
                      if (!localResult.ok) {
                        setQuickSyncError(String(t(localResult.error || 'Unable to update the task priority.')));
                        return;
                      }
                      void persistQuickChange(currentTask);
                      setActiveQuickEdit(null);
                    }}
                  >
                    {PRIORITY_OPTIONS.map(prio => (
                      <option key={prio} value={prio}>{getLocalizedPriority(prio, locale)}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">{t('Assignee')}</label>
                <div className="relative">
                  <select
                    className={cn(inputBase, "w-full text-xs py-1.5 pl-2.5 pr-8 bg-white disabled:bg-slate-50 disabled:text-slate-400 appearance-none cursor-pointer")}
                    value={currentTask.assignedTo}
                    disabled={!canAssignOthers}
                    onChange={(e) => {
                      const localResult = updateTaskAssignee(currentTask.id, e.target.value);
                      if (!localResult.ok) {
                        setQuickSyncError(String(t(localResult.error || 'Unable to update the task assignee.')));
                        return;
                      }
                      void persistQuickChange(currentTask);
                      setActiveQuickEdit(null);
                    }}
                  >
                    {(canAssignOthers
                      ? (() => {
                          const options = assignableTaskAssignees(currentUser, currentTask.department, users, rolePermissions);
                          const current = users.find(u => u.id === currentTask.assignedTo);
                          return current && !options.some(u => u.id === current.id) ? [current, ...options] : options;
                        })()
                      : users.filter(u => u.id === currentTask.assignedTo)).map(u => (
                      <option key={u.id} data-i18n-skip value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                </div>
                {!canAssignOthers && (
                  <p className="mt-1 text-[10px] text-slate-400">{t('Only Boss Koo can reassign tasks.')}</p>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

const Tasks: React.FC = () => {
  const currentUser = useStore(state => state.currentUser);
  const backendMode = useStore(state => state.backend.mode);
  if (currentUser?.role === 'Client') return <ClientDeliveries />;
  const key = currentUser ? taskPreferencesKey(currentUser, backendMode) : '';
  return <>
    {currentUser && <PersonalTaskViews key={key} storageKey={key} supportsBoard={isBossKoo(currentUser)} />}
    {currentUser && !isBossKoo(currentUser) ? <StaffAllWork /> : <TasksWorkspace />}
  </>;
};

export default Tasks;
