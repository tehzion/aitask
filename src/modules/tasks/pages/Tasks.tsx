import { format } from 'date-fns/format';
import { ArrowLeft, Building2, CalendarClock, CheckCircle2, ChevronDown, ExternalLink, Filter, Mail, MapPin, MoreHorizontal, Paperclip, Phone, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../../app/store/workspaceStore';
import { safeHttpsUrl } from '../../../infrastructure/serialization/security';
import { canCreateTasks, isBossKoo } from '../../../shared/authorization/access';
import { getClientTaskStage, getClientTaskStatusLabel } from '../../../shared/authorization/clientPortal';
import { assignableTaskAssignees } from '../../../shared/authorization/taskWorkflowAccess';
import { SkeletonMobileCard, SkeletonTableRow } from '../../../shared/components/SkeletonCard';
import SystemMessage from '../../../shared/components/SystemMessage';
import { Badge, Button, PageHeader } from '../../../shared/components/ui';
import { cardBase, inputBase, pageShell, tableShell } from '../../../shared/components/uiTokens';
import '../../../shared/i18n/actionFeedbackCopy';
import { formatLocalizedDate } from '../../../shared/i18n/i18n';
import { getLocalizedDepartment, getLocalizedPriority, getLocalizedTaskStatus } from '../../../shared/i18n/localeLabels';
import { getTaskProgress } from '../../../shared/rules/taskProgress';
import { type Priority, type Task } from '../../../shared/types/index';
import { cn, getRelativeDueDateString, parseOptionalDate } from '../../../shared/utils/utils';
import { isTaskOverdue } from '../../reports/domain/taskReporting';
import ClientDeliveries from '../../services/components/ClientDeliveries';
import PersonalTaskViews from '../components/PersonalTaskViews';
import StaffAllWork from '../components/StaffAllWork';
import TaskDetailsModal from '../components/TaskDetailsModal';
import { taskPreferencesKey } from '../domain/personalTaskViews';
import { CLIENT_BOARD_COLUMNS, getStatusColor, PAGE_SIZE, PRIORITY_OPTIONS, priorityColors } from '../hooks/taskViewOptions';
import { useTasksWorkspace } from '../hooks/useTasksWorkspace';

const TasksWorkspace: React.FC = () => {
  const { isClientUser, t, locale, currentUser, rolePermissions, setCreateTaskModalOpen, quickSyncError, activeProject, clearRouteFilter, taskIdFilter, setSelectedTask, activeAssignee, periodRouteFilter, searchParams, setSearchParams, routeFocus, activeClient, canViewActiveClient, activeClientProfile, activeClientFallbackDetails, activeClientTasks, activeClientOpenTasks, activeClientCompletedTasks, activeClientProjects, activeClientWebsite, activeClientFacebook, dateFrom, dateTo, filterStatus, today, applyQuickFilter, searchInput, filteredTasks, setViewType, viewType, setFiltersOpen, filtersOpen, activeFilterLabels, hasAnyFilter, clearAllFilters, filterDepartment, setFilterDepartment, departmentOptions, filterAssignee, setFilterAssignee, assigneeOptions, filterClient, setFilterClient, clientOptions, setFilterStatus, taskStatuses, filterPriority, setFilterPriority, setDateFrom, setDateTo, backend, pagedTasks, handleRowContextMenu, users, canEditTask, handleQuickEditClick, getUserName, clientTaskAction, TABLE_COLUMN_COUNT, currentPage, setPage, totalPages, getDeptBadge, selectedTask, selectedLiveTask, activeQuickEdit, tasks, setActiveQuickEdit, updateTaskPriority, setQuickSyncError, persistQuickChange, canAssignOthers, updateTaskAssignee } = useTasksWorkspace();
  const projects = useStore(state => state.projects);

  const renderStatusControl = (task: Task) => (
    <span className={`inline-flex text-xs px-2.5 py-1 rounded-md font-semibold ${getStatusColor(task.status)}`}>
      {isClientUser ? t(getClientTaskStatusLabel(task)) : getLocalizedTaskStatus(task.status, locale)}
    </span>
  );

  return (
    <div className={pageShell}>
      <PageHeader
        title={isClientUser ? t('Company Tasks') : t('Tasks Management')}
        description={isClientUser
          ? t('Track your company work, review deliverables, and share feedback.')
          : t('Manage assignments, approvals, revisions, files, and deadlines.')}
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
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-700">{t('Client task view')}</p>
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
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Quick task filters')}>
              {([
                ['all', t('All')],
                ['today', t('Due today')],
                ['overdue', t('Overdue')],
                ['waiting', t('Waiting approval')],
              ] as const).map(([value, label]) => {
                const isActive = value === 'all'
                  ? !routeFocus && !periodRouteFilter && !dateFrom && !dateTo && filterStatus === 'All'
                  : value === 'today'
                    ? periodRouteFilter === 'today' || (!routeFocus && dateFrom === format(today, 'yyyy-MM-dd') && dateTo === format(today, 'yyyy-MM-dd'))
                    : value === 'overdue'
                      ? routeFocus === 'overdue'
                      : routeFocus === 'waiting' || (!routeFocus && filterStatus === 'Waiting Approval');
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => applyQuickFilter(value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                      isActive
                        ? 'border-accent bg-accent text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
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

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Filter className="w-4 h-4" />
              <span>{filteredTasks.length} {filteredTasks.length === 1 ? t('matching task') : t('matching tasks')}</span>
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
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
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
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
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
            <div className="hidden overflow-x-auto 2xl:block">
	              <table className={cn('w-full text-left text-sm text-slate-500', isClientUser ? 'min-w-[820px]' : 'min-w-[1020px]')}>
                <thead className="text-xs text-slate-700 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-semibold">{t('Task Details')}</th>
	                    {!isClientUser && <th className="px-3 py-3 font-semibold">{t('Client / Company')}</th>}
	                    {!isClientUser && <th className="px-3 py-3 font-semibold">{t('Department')}</th>}
	                    <th className="px-3 py-3 font-semibold">{t('Timeline')}</th>
	                    {!isClientUser && <th className="w-[100px] px-3 py-3 text-center font-semibold">{t('Priority')}</th>}
	                    <th className="w-[130px] px-3 py-3 text-center font-semibold">{t('Status')}</th>
	                    <th className="px-3 py-3 text-center font-semibold">{t('Progress')}</th>
	                    <th className="px-3 py-3 font-semibold">{isClientUser ? t('Contact / Action') : t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {backend?.isLoading ? (
                    Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonTableRow key={i} />)
                  ) : (
                    pagedTasks.map((task) => {
                      const startDateParsed = parseOptionalDate(task.startDate);
                      const dueDateParsed = parseOptionalDate(task.dueDate);
                      const isOverdue = isTaskOverdue(task, today);

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
                            <div data-i18n-skip className={cn("font-semibold truncate", isOverdue ? "text-red-900" : "text-slate-900")}>{task.title}</div>
                            <div data-i18n-skip className="text-xs text-slate-500 mt-0.5">{task.id} - {task.serviceType}</div>
                          </td>
	                          {!isClientUser && <td className="max-w-[150px] px-3 py-3">
                            <div data-i18n-skip className="font-medium text-slate-800 truncate">{task.clientName}</div>
                            <div data-i18n-skip className="text-xs text-slate-500 truncate mt-0.5">{task.projectName || t('Independent task')}</div>
	                          </td>}
	                          {!isClientUser && <td className="whitespace-nowrap px-3 py-3">
                            <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md font-medium border border-slate-200">{getLocalizedDepartment(task.department, locale)}</span>
	                          </td>}
                          <td className="whitespace-nowrap px-3 py-3 text-xs">
                            <div className="text-slate-500 mb-0.5">{t('Start')}: {startDateParsed ? formatLocalizedDate(startDateParsed, locale) : t('common.noStartDate')}</div>
                            <div
                              className={cn("font-medium", isOverdue ? "text-red-700 font-bold" : "text-slate-800")}
                              title={dueDateParsed ? `${t('Due')}: ${formatLocalizedDate(dueDateParsed, locale)}` : t('common.noDueDate')}
                            >
                              {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status, locale)}
                            </div>
                          </td>
	                          {!isClientUser && <td className="w-[100px] whitespace-nowrap px-3 py-3 text-center">
                            <span className={`inline-block text-xs px-2.5 py-1 rounded-md font-semibold ${priorityColors[task.priority]}`}>{getLocalizedPriority(task.priority, locale)}</span>
	                          </td>}
                          <td className="w-[130px] whitespace-nowrap px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {renderStatusControl(task)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-accent h-2 rounded-full" style={{ width: `${getTaskProgress(task, users, isClientUser)}%` }}></div>
                              </div>
                              <span className="text-xs font-semibold text-slate-700 w-8">{getTaskProgress(task, users, isClientUser)}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-400">
                            <div className="flex flex-col items-start gap-1.5">
	                              {!isClientUser && <div className="flex items-center gap-2">
                                {task.attachmentLink && (
                                  safeHttpsUrl(task.attachmentLink) ? (
                                    <a href={safeHttpsUrl(task.attachmentLink)!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-blue-600" title={task.attachmentName || 'Attachment'}>
                                      <Paperclip className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <span title={t('Invalid attachment link')} className="text-slate-400">
                                      <Paperclip className="w-4 h-4" />
                                    </span>
                                  )
                                )}
                                {task.isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
	                                {canEditTask(task) && <button
                                  className="rounded-md p-1 transition-colors hover:bg-slate-200 hover:text-slate-700"
                                  title={t('Quick Edit')}
                                  aria-label={t('Quick Edit')}
                                  onClick={(e) => handleQuickEditClick(e, task)}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
	                                </button>}
	                              </div>}
	                              <div className="flex items-center gap-1.5" title={t('Assigned contact')}>
                                <div className="w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[10px] font-bold">
                                  {getUserName(task.assignedTo).charAt(0)}
                                </div>
                                <span data-i18n-skip className="text-xs font-medium text-slate-600 truncate max-w-[85px]">
                                  {getUserName(task.assignedTo)}
	                                </span>
	                              </div>
	                              {isClientUser && (
                              <span className="inline-flex text-xs font-semibold text-accent">
	                                  {clientTaskAction(task)}
	                                </span>
	                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {!backend?.isLoading && pagedTasks.length === 0 && (
                    <tr>
	                      <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-8 text-center text-slate-500">{t('No tasks found matching your criteria.')}</td>
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
                  const isOverdue = isTaskOverdue(task, today);

                  return (
                    <article
                      key={task.id}
                      className={cn(
                        "relative w-full border-l-4 p-4 text-left transition-colors hover:bg-slate-50",
                        isOverdue
                          ? "border-l-red-500 bg-red-50/30 hover:bg-red-100/30"
                          : "border-l-transparent bg-white"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedTask(task)}
                        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                        aria-label={t('task.viewFor', { title: task.title })}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div data-i18n-skip className={cn("font-semibold leading-5", isOverdue ? "text-red-900" : "text-slate-900")}>{task.title}</div>
                            <div data-i18n-skip className="text-xs text-slate-500 mt-1 leading-5">{task.id} - {task.clientName} - {task.projectName || t('Independent task')}</div>
                          </div>
	                          {!isClientUser && <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${priorityColors[task.priority]}`}>{getLocalizedPriority(task.priority, locale)}</span>}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <span
                          className={cn("inline-flex items-center gap-1", isOverdue ? "text-red-700 font-bold" : "text-slate-600")}
                          title={dueDateParsed ? `${t('Due')}: ${formatLocalizedDate(dueDateParsed, locale)}` : t('common.noDueDate')}
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                            {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status, locale)}
                        </span>
                        <span className="truncate text-right">{getUserName(task.assignedTo)}</span>
	                        {!isClientUser && <span>{getLocalizedDepartment(task.department, locale)}</span>}
	                          <span className="truncate text-right">{task.serviceType}</span>
                        </div>
                        {isOverdue && (
                          <div className="mt-2 text-[10px] text-red-500 font-extrabold flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            {t('Overdue')}
                          </div>
                        )}
                        {isClientUser && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <span className="text-sm font-semibold text-accent">{clientTaskAction(task)}</span>
                          </div>
                        )}
                      </button>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div>{renderStatusControl(task)}</div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div className="bg-accent h-2 rounded-full" style={{ width: `${getTaskProgress(task, users, isClientUser)}%` }}></div>
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{getTaskProgress(task, users, isClientUser)}%</span>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
              {!backend?.isLoading && pagedTasks.length === 0 && <div className="p-8 text-center text-sm text-slate-700">{t('No tasks found matching your criteria.')}</div>}
            </div>

            <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 text-sm">
              <span className="text-slate-500">
                {t('Showing')} {filteredTasks.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} {t('to')} {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} {t('of')} {filteredTasks.length} {t('entries')}
              </span>
              <div className="flex gap-1">
                <button disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed">{t('Previous')}</button>
                <span className="px-3 py-1 border border-blue-600 rounded-md bg-blue-600 text-white font-medium">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 border border-slate-300 rounded-md bg-white text-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed">{t('Next')}</button>
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
                return (
                  <div
                    key={status}
                    className={cn('flex max-h-[700px] flex-col rounded-lg border border-slate-200 bg-slate-50 p-3', !isClientUser && 'min-w-[260px] flex-1')}
                  >
                    {/* Column Header */}
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-line shrink-0">
                      <span className="text-xs font-semibold text-slate-600">{isClientUser ? column.label : status}</span>
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
                                {task.id}{isClientUser ? ` · ${task.serviceType}` : ` · ${task.clientName}`}
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
                          const options = assignableTaskAssignees(currentUser, currentTask.department, users, rolePermissions, {
                            project: currentTask.projectId ? projects.find(project => project.id === currentTask.projectId) : undefined,
                          });
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
