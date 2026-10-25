import { format } from 'date-fns/format';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../../app/store/workspaceStore';
import { isPendingMutationResolution } from '../../../infrastructure/commands/mutationGuard';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../../../infrastructure/persistence/workspaceSession';
import { safeHttpsUrl } from '../../../infrastructure/serialization/security';
import { canAssignTasksToOthers, canEditTask as canEditTaskByRole, getVisibleProjects, getVisibleTasks } from '../../../shared/authorization/access';
import { DEPARTMENTS } from '../../../shared/authorization/departments';
import { useI18n } from '../../../shared/components/I18nProvider';
import { useImeSafeInput } from '../../../shared/hooks/useImeSafeInput';
import { useLocalToday } from '../../../shared/hooks/useLocalToday';
import '../../../shared/i18n/actionFeedbackCopy';
import { type Task } from '../../../shared/types/index';
import { getOperationsPeriod, isTaskOpen, isTaskOverdue, type TeamWorkloadPeriod } from '../../reports/domain/taskReporting';
import { normalizeClientName, PAGE_SIZE } from './taskViewOptions';

/** State, derived data and user actions for the existing workspace view. */
export const useTasksWorkspace = () => {
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
      case 'Designer': return 'bg-accent-soft text-accent border border-accent/20';
      case 'Editor':
      case 'Video Editor': return 'bg-sky-50 text-sky-700 border border-sky-100';
      case 'Videoshooting':
      case 'Video Shooting': return 'bg-cyan-50 text-cyan-700 border border-cyan-100';
      case 'Ads Management': return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'Account & Finance': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Management': return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'Operation': return 'bg-slate-100 text-slate-700 border border-slate-200';
      default: return 'bg-slate-50 text-slate-700 border border-slate-200';
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
  }, [searchTerm, filterDepartment, filterAssignee, filterClient, filterStatus, filterPriority, dateFrom, dateTo, projectIdFilter, clientRouteFilter, taskIdFilter, assigneeRouteFilter, periodRouteFilter]);

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

  const TABLE_COLUMN_COUNT = isClientUser ? 5 : 8;

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

  const clearRouteFilter = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const applyQuickFilter = (value: 'all' | 'today' | 'overdue' | 'waiting') => {
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    next.delete('period');
    ['dueFrom', 'dueTo', 'status'].forEach(key => next.delete(key));
    if (value === 'today') next.set('period', 'today');
    else if (value === 'overdue' || value === 'waiting') next.set('focus', value);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const clearAllFilters = () => {
    searchInput.commit('');
    setSearchParams(new URLSearchParams({ view: viewType }), { replace: true });
  };
  return { isClientUser, t, locale, currentUser, rolePermissions, setCreateTaskModalOpen, quickSyncError, activeProject, clearRouteFilter, taskIdFilter, setSelectedTask, activeAssignee, periodRouteFilter, searchParams, setSearchParams, routeFocus, activeClient, canViewActiveClient, activeClientProfile, activeClientFallbackDetails, activeClientTasks, activeClientOpenTasks, activeClientCompletedTasks, activeClientProjects, activeClientWebsite, activeClientFacebook, dateFrom, dateTo, filterStatus, today, applyQuickFilter, searchInput, filteredTasks, setViewType, viewType, setFiltersOpen, filtersOpen, activeFilterLabels, hasAnyFilter, clearAllFilters, filterDepartment, setFilterDepartment, departmentOptions, filterAssignee, setFilterAssignee, assigneeOptions, filterClient, setFilterClient, clientOptions, setFilterStatus, taskStatuses, filterPriority, setFilterPriority, setDateFrom, setDateTo, backend, pagedTasks, handleRowContextMenu, users, canEditTask, handleQuickEditClick, getUserName, clientTaskAction, TABLE_COLUMN_COUNT, currentPage, setPage, totalPages, getDeptBadge, selectedTask, selectedLiveTask, activeQuickEdit, tasks, setActiveQuickEdit, updateTaskPriority, setQuickSyncError, persistQuickChange, canAssignOthers, updateTaskAssignee };
};
