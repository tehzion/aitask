import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, FileCheck2, Filter, FolderKanban, ListTodo, Search, UsersRound } from 'lucide-react';
import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../../app/store/workspaceStore';
import { canAccessPath, canEditProject, canOpenServiceClient, getVisibleProjects, getVisibleTasks, isBossKoo } from '../../../shared/authorization/access';
import AccessDenied from '../../../app/shell/AccessDenied';
import { useI18n } from '../../../shared/components/I18nProvider';
import type { MessageId } from '../../../shared/i18n/messages';
import { Badge, Button, EmptyState, PageHeader, ProgressBar, StatusChip } from '../../../shared/components/ui';
import { cardBase, inputBase, pageShell } from '../../../shared/components/uiTokens';
import { formatLocalizedDate } from '../../../shared/i18n/i18n';
import { getLocalizedTaskStatus } from '../../../shared/i18n/localeLabels';
import { canManageProjectLifecycle, effectiveMilestoneStatus, projectStatus } from '../../../shared/rules/projectManagement';
import type { ClientServicePlan, Project, Task } from '../../../shared/types/index';
import { parseOptionalDate } from '../../../shared/utils/utils';
import { cn } from '../../../shared/utils/utils';
import { getPlanDeliverySummary } from '../../dashboard/domain/dashboardData';
import { assessProjectHealth } from '../../dashboard/domain/pmDashboard';
import { getDueWorkPerformance } from '../../reports/domain/taskReporting';
import CreateProjectModal from '../components/CreateProjectModal';
import ProjectManagementPanel from '../components/ProjectManagementPanel';
import { filterProjectTasks, getNextProjectMilestone, getProjectAttentionTasks, getProjectWorkspaceSummary, type ProjectTaskDueFilter } from '../domain/projectWorkspace';

const attentionLabelIds: Record<'overdue' | 'review' | 'revision' | 'upcoming' | 'assignment', MessageId> = {
  overdue: 'projectWorkspace.attention.overdue',
  review: 'projectWorkspace.attention.review',
  revision: 'projectWorkspace.attention.revision',
  upcoming: 'projectWorkspace.attention.upcoming',
  assignment: 'projectWorkspace.attention.assignment',
};

const taskStatusTone = (status: string) => {
  if (status === 'Completed' || status === 'Approved') return 'emerald';
  if (status === 'Waiting Approval') return 'amber';
  if (status === 'Revision Required' || status === 'Rejected') return 'red';
  return 'slate';
};

const ProjectWorkspace: React.FC = () => {
  const { projectId = '' } = useParams();
  const { t, locale } = useI18n();
  const state = useStore(useShallow(store => ({
    projects: store.projects,
    tasks: store.tasks,
    users: store.users,
    clients: store.clients,
    clientPlans: store.clientPlans,
    serviceCycles: store.serviceCycles,
    deliverables: store.deliverables,
    rolePermissions: store.rolePermissions,
    currentUser: store.currentUser,
  })));
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [priorityFilter, setPriorityFilter] = React.useState('All');
  const [assigneeFilter, setAssigneeFilter] = React.useState('');
  const [dueFilter, setDueFilter] = React.useState<ProjectTaskDueFilter>('any');
  const [managementOpen, setManagementOpen] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);

  const visibleTasks = React.useMemo(() => getVisibleTasks(state.currentUser, state.tasks, state.rolePermissions, {
    clients: state.clients,
    projects: state.projects,
    users: state.users,
  }), [state.clients, state.currentUser, state.projects, state.rolePermissions, state.tasks, state.users]);
  const visibleProjects = React.useMemo(() => getVisibleProjects(state.currentUser, state.projects, state.tasks, state.rolePermissions, {
    clients: state.clients,
    projects: state.projects,
    users: state.users,
  }), [state.clients, state.currentUser, state.projects, state.rolePermissions, state.tasks, state.users]);
  const project = visibleProjects.find(item => item.id === projectId);
  const projectTasks = React.useMemo(() => project
    ? visibleTasks.filter(task => task.projectId === project.id)
    : [], [project, visibleTasks]);
  const projectMembers = React.useMemo(() => {
    if (!project || !state.currentUser) return [];
    const memberIds = new Set([
      ...(project.projectManagerIds || []),
      ...(project.hodMemberIds || []),
      ...(project.staffMemberIds || []),
    ]);
    const isPortfolioManager = isBossKoo(state.currentUser) || state.currentUser.role === 'Project Manager';
    const managerIds = new Set(project.projectManagerIds?.length ? project.projectManagerIds : project.createdBy ? [project.createdBy] : []);
    const visibleTaskMemberIds = new Set(projectTasks.flatMap(task => [task.assignedTo, task.responsibleHodId]).filter(Boolean));
    return state.users.filter(member => member.role !== 'Client' && !member.directoryOnly
      && memberIds.has(member.id)
      && (isPortfolioManager || managerIds.has(member.id) || member.id === state.currentUser?.id || visibleTaskMemberIds.has(member.id)));
  }, [project, projectTasks, state.currentUser, state.users]);

  if (state.currentUser?.role === 'Client') {
    const profile = state.clients.find(client => client.clientName.trim().toLowerCase() === state.currentUser?.companyName?.trim().toLowerCase());
    return <Navigate replace to={profile ? `/clients/${encodeURIComponent(profile.id)}` : '/clients'} />;
  }
  if (!state.currentUser || !canAccessPath(state.currentUser, '/projects', state.rolePermissions)) return <AccessDenied />;
  if (!project) {
    return <div className={pageShell}>
      <PageHeader title={t('projectWorkspace.unavailableTitle')} description={t('projectWorkspace.unavailableDescription')} />
      <Link to="/projects" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('projectWorkspace.backToProjects')}</Link>
    </div>;
  }

  const today = new Date();
  const summary = getProjectWorkspaceSummary(project, projectTasks, today);
  const health = assessProjectHealth(project, projectTasks, today);
  const healthLabel = health.health === 'atRisk' ? t('At risk') : health.health === 'attentionRequired' ? t('Attention required') : t('On track');
  const healthTone = health.health === 'atRisk' ? 'red' : health.health === 'attentionRequired' ? 'amber' : 'emerald';
  const managerIds = project.projectManagerIds?.length ? project.projectManagerIds : project.createdBy ? [project.createdBy] : [];
  const managers = managerIds.map(id => state.users.find(user => user.id === id)).filter((member): member is NonNullable<typeof member> => Boolean(member && member.role !== 'Client'));
  const milestone = getNextProjectMilestone(project, projectTasks);
  const projectStatuses = Array.from(new Set(projectTasks.map(task => task.status))).sort((left, right) => left.localeCompare(right));
  const assignees = Array.from(new Set(projectTasks.map(task => task.assignedTo).filter(Boolean)))
    .map(id => state.users.find(user => user.id === id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member && member.role !== 'Client'));
  const filteredTasks = filterProjectTasks(projectTasks, {
    search,
    status: statusFilter,
    priority: priorityFilter,
    assignee: assigneeFilter,
    due: dueFilter,
  }, today);
  const attention = getProjectAttentionTasks(projectTasks, today).slice(0, 12);
  const visibleClientTasks = projectTasks.filter(task => task.clientId === project.clientId || task.clientName.trim().toLowerCase() === project.clientName.trim().toLowerCase());
  const canOpenClientServices = canOpenServiceClient(state.currentUser, project.clientName, visibleTasks, state.rolePermissions, state.clients, visibleProjects);
  const clientPlans = canOpenClientServices
    ? state.clientPlans.filter(plan => project.clientId ? plan.clientId === project.clientId : plan.clientName.trim().toLowerCase() === project.clientName.trim().toLowerCase())
    : [];
  const reportWeeks = getDueWorkPerformance(projectTasks, today, 4, locale);
  const reportCounts = reportWeeks.reduce((totals, week) => ({
    onTime: totals.onTime + week.onTime,
    late: totals.late + week.late,
    upcoming: totals.upcoming + week.upcoming,
    overdue: totals.overdue + week.overdue,
  }), { onTime: 0, late: 0, upcoming: 0, overdue: 0 });
  const reportRange = reportWeeks.length
    ? `${formatLocalizedDate(reportWeeks[0].start, locale)} – ${formatLocalizedDate(reportWeeks[reportWeeks.length - 1].end, locale)}`
    : t('No report period');
  const recentActivity = projectTasks.flatMap(task => {
    const actorName = (userId?: string) => state.users.find(member => member.id === userId && member.role !== 'Client')?.name;
    const history = [
      ...(task.workHistory || []).map(event => ({ id: `${task.id}:work:${event.id}`, task, at: event.createdAt, label: t('projectWorkspace.workUpdated'), actor: actorName(event.userId) })),
      ...(task.approvalHistory || []).map(event => ({
        id: `${task.id}:review:${event.id}`,
        task,
        at: event.createdAt,
        label: t(event.status === 'Approved' ? 'projectWorkspace.clientApproved' : 'projectWorkspace.revisionRequested'),
        actor: actorName(event.userId) || t('Client'),
      })),
      ...(task.comments || []).map(comment => ({ id: `${task.id}:comment:${comment.id}`, task, at: comment.createdAt, label: t('projectWorkspace.commentAdded'), actor: actorName(comment.userId) })),
    ];
    if (history.length === 0 && task.updatedAt) history.push({ id: `${task.id}:updated`, task, at: task.updatedAt, label: t('projectWorkspace.taskUpdated'), actor: undefined });
    return history;
  }).filter(item => Boolean(parseOptionalDate(item.at))).sort((left, right) => right.at.localeCompare(left.at)).slice(0, 8);
  const canManageLifecycle = canManageProjectLifecycle(state.currentUser, project);
  const canEdit = canEditProject(state.currentUser, project, state.rolePermissions);
  const canViewReports = canAccessPath(state.currentUser, '/reports', state.rolePermissions);
  const setAttentionFilter = (kind: 'overdue' | 'review' | 'upcoming' | 'all') => {
    setStatusFilter('All');
    setPriorityFilter('All');
    setAssigneeFilter('');
    setSearch('');
    setDueFilter(kind === 'overdue' ? 'overdue' : kind === 'upcoming' ? 'nextSevenDays' : 'any');
    if (kind === 'review') setStatusFilter('Waiting Approval');
    document.getElementById('project-tasks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div className={cn(pageShell, 'space-y-6')}>
    <PageHeader
      actionBreakpoint="xl"
      compact
      breadcrumb={<Link to="/projects" className="inline-flex min-h-8 items-center gap-1 text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{t('projectWorkspace.backToProjects')}</Link>}
      title={<span data-i18n-skip>{project.projectName}</span>}
      description={<span>{t('projectWorkspace.workspaceFor')} <span data-i18n-skip className="font-medium text-ink">{project.clientName}</span>.</span>}
      meta={<>
        <StatusChip tone={projectStatus(project) === 'Active' ? 'emerald' : projectStatus(project) === 'Completed' ? 'indigo' : 'slate'}>{t(projectStatus(project))}</StatusChip>
        <span aria-hidden="true">·</span>
        <span>{t('Project Manager')}: {managers.length ? managers.map(member => <span key={member.id} data-i18n-skip>{member.name}</span>).reduce<React.ReactNode[]>((nodes, name, index) => index ? [...nodes, ', ', name] : [name], []) : t('Not assigned')}</span>
        <span aria-hidden="true">·</span>
        <span>{project.startDate ? formatLocalizedDate(parseOptionalDate(project.startDate) || new Date(project.startDate), locale) : t('No start date')} – {project.deadline ? formatLocalizedDate(parseOptionalDate(project.deadline) || new Date(project.deadline), locale) : t('No deadline')}</span>
      </>}
      action={<div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setAttentionFilter('all')}><ListTodo className="h-4 w-4" aria-hidden="true" />{t('projectWorkspace.viewTasks')}</Button>
        {canViewReports && <Link to={`/reports?projectId=${encodeURIComponent(project.id)}`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><ArrowUpRight className="h-4 w-4" aria-hidden="true" />{t('projectWorkspace.viewReport')}</Link>}
        {canEdit && <Button variant="secondary" onClick={() => { setEditingProject(project); setEditorOpen(true); }}>{t('projectWorkspace.editProject')}</Button>}
        {canManageLifecycle && <Button onClick={() => setManagementOpen(true)}>{t('projectWorkspace.manageProject')}</Button>}
      </div>}
    />

    <section aria-labelledby="project-overview-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="project-overview-title" className="text-lg font-semibold text-ink">{t('projectWorkspace.overview')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.overviewHelp')}</p></div>
        <StatusChip tone={healthTone}>{healthLabel}</StatusChip>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile icon={FolderKanban} label={t('projectWorkspace.totalTasks')} value={summary.total} onClick={() => setAttentionFilter('all')} />
        <SummaryTile icon={CheckCircle2} label={t('projectWorkspace.completedTasks')} value={summary.completed} onClick={() => { setStatusFilter('Completed'); setDueFilter('any'); document.getElementById('project-tasks')?.scrollIntoView({ behavior: 'smooth' }); }} />
        <SummaryTile icon={AlertTriangle} label={t('Overdue')} value={summary.overdue.length} tone={summary.overdue.length ? 'danger' : 'default'} onClick={() => setAttentionFilter('overdue')} />
        <SummaryTile icon={FileCheck2} label={t('projectWorkspace.pendingReviews')} value={summary.pendingReviews.length} tone={summary.pendingReviews.length ? 'warning' : 'default'} onClick={() => setAttentionFilter('review')} />
        <SummaryTile icon={CalendarDays} label={t('projectWorkspace.upcomingDeadlines')} value={summary.upcoming.length} onClick={() => setAttentionFilter('upcoming')} />
      </div>
      {summary.progressPercent !== undefined && <div className={`${cardBase} flex flex-wrap items-center gap-4 px-4 py-3`}>
        <div className="flex min-w-32 items-center gap-2 text-sm font-medium text-ink"><span className="calm-number text-lg">{summary.progressPercent}%</span>{t('projectWorkspace.taskProgress')}</div>
        <div className="min-w-[180px] flex-1"><ProgressBar label={`${t('projectWorkspace.taskProgress')} ${summary.progressPercent}%`} value={summary.progressPercent} max={100} /></div>
        <p className="text-xs text-muted">{t('projectWorkspace.progressDefinition')}</p>
      </div>}
      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-control border border-line/70 bg-surface px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" /><strong className="text-ink">{t('projectWorkspace.nextMilestone')}:</strong> {milestone ? <span data-i18n-skip>{milestone.name}</span> : t('projectWorkspace.noUpcomingMilestone')}</span>
        {milestone && <span className="text-muted">{formatLocalizedDate(parseOptionalDate(milestone.targetDate) || new Date(milestone.targetDate), locale)}</span>}
      </div>
    </section>

    <section aria-labelledby="project-attention-title" className={cn(cardBase, 'overflow-hidden')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
        <div><h2 id="project-attention-title" className="font-semibold text-ink">{t('projectWorkspace.attention')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.attentionHelp')}</p></div>
        {attention.length > 0 && <Badge tone="amber">{attention.length}</Badge>}
      </div>
      {attention.length ? <ul className="divide-y divide-line/60">
        {attention.map(({ task, kind }) => <li key={task.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="font-medium text-ink hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><span data-i18n-skip>{task.title}</span></Link>
            <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted"><span>{getLocalizedTaskStatus(task.status, locale)}</span><span aria-hidden="true">·</span><span>{state.users.find(member => member.id === task.assignedTo)?.name ? <span data-i18n-skip>{state.users.find(member => member.id === task.assignedTo)?.name}</span> : <><span data-i18n-skip>{task.department}</span></>}</span>{task.dueDate && <><span aria-hidden="true">·</span><span>{t('Due')} {formatLocalizedDate(parseOptionalDate(task.dueDate) || new Date(task.dueDate), locale)}</span></>}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2"><StatusChip tone={kind === 'overdue' ? 'red' : kind === 'review' || kind === 'revision' ? 'amber' : 'slate'}>{t(attentionLabelIds[kind])}</StatusChip><Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="inline-flex min-h-10 items-center rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{t('projectWorkspace.openTask')}</Link></div>
        </li>)}
      </ul> : <EmptyState title={t('projectWorkspace.noAttention')} description={t('projectWorkspace.noAttentionHelp')} className="border-0" />}
    </section>

    <section id="project-tasks" aria-labelledby="project-tasks-title" className={cn(cardBase, 'scroll-mt-24 overflow-hidden')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5">
        <div><h2 id="project-tasks-title" className="font-semibold text-ink">{t('projectWorkspace.tasks')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.tasksHelp')}</p></div>
        <Link to={`/tasks?projectId=${encodeURIComponent(project.id)}`} className="inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{t('projectWorkspace.openTaskList')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      <div className="grid gap-3 border-b border-line/70 bg-inset/40 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">{t('projectWorkspace.searchTasks')}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" /><input className={cn(inputBase, 'pl-9')} value={search} onChange={event => setSearch(event.target.value)} placeholder={t('projectWorkspace.searchTasks')} /></label>
        <label className="flex items-center gap-2"><Filter className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" /><span className="sr-only">{t('Status')}</span><select className={inputBase} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="All">{t('All statuses')}</option>{projectStatuses.map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label>
        <label><span className="sr-only">{t('Priority')}</span><select className={inputBase} value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="All">{t('All priorities')}</option>{['Urgent', 'High', 'Medium', 'Low'].map(priority => <option key={priority} value={priority}>{t(priority)}</option>)}</select></label>
        <label><span className="sr-only">{t('Assignee')}</span><select className={inputBase} value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)}><option value="">{t('All assignees')}</option>{assignees.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label><span className="sr-only">{t('Due date')}</span><select className={inputBase} value={dueFilter} onChange={event => setDueFilter(event.target.value as ProjectTaskDueFilter)}><option value="any">{t('Any due date')}</option><option value="overdue">{t('Overdue')}</option><option value="nextSevenDays">{t('Due in the next 7 days')}</option><option value="noDate">{t('No due date')}</option></select></label>
      </div>
      <div className="divide-y divide-line/60">
        {filteredTasks.map(task => <ProjectTaskRow key={task.id} task={task} users={state.users} locale={locale} t={t} />)}
        {filteredTasks.length === 0 && <EmptyState title={projectTasks.length ? t('projectWorkspace.noTaskMatches') : t('projectWorkspace.noTasks')} description={projectTasks.length ? t('projectWorkspace.clearTaskFilters') : t('projectWorkspace.noTasksHelp')} className="border-0" />}
      </div>
      {projectTasks.length > 0 && <p className="border-t border-line/70 px-4 py-3 text-xs text-muted sm:px-5">{t('projectWorkspace.taskResultCount', { shown: filteredTasks.length, total: projectTasks.length })}</p>}
    </section>

    <div className="grid gap-6 xl:grid-cols-2">
      <section aria-labelledby="project-milestones-title" className={cn(cardBase, 'overflow-hidden')}>
        <div className="border-b border-line/70 px-4 py-4 sm:px-5"><h2 id="project-milestones-title" className="font-semibold text-ink">{t('Milestones')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.milestonesHelp')}</p></div>
        {project.milestones?.length ? <ul className="divide-y divide-line/60">{project.milestones.slice().sort((a, b) => a.targetDate.localeCompare(b.targetDate)).map(item => {
          const status = effectiveMilestoneStatus(item, projectTasks);
          const relatedTasks = projectTasks.filter(task => task.milestoneId === item.id);
          return <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="font-medium text-ink"><span data-i18n-skip>{item.name}</span></p><p className="mt-1 text-xs text-muted">{formatLocalizedDate(parseOptionalDate(item.targetDate) || new Date(item.targetDate), locale)} · {relatedTasks.length} {t('projectWorkspace.relatedTasks')}</p></div><StatusChip tone={status === 'Completed' ? 'emerald' : status === 'Delayed' ? 'red' : status === 'In Progress' ? 'indigo' : 'slate'}>{t(status)}</StatusChip></li>;
        })}</ul> : <EmptyState title={t('projectWorkspace.noMilestones')} description={t('projectWorkspace.noMilestonesHelp')} className="border-0" />}
      </section>

      <section aria-labelledby="project-team-title" className={cn(cardBase, 'overflow-hidden')}>
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5"><div><h2 id="project-team-title" className="font-semibold text-ink">{t('projectWorkspace.team')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.teamHelp')}</p></div><UsersRound className="h-5 w-5 text-muted" aria-hidden="true" /></div>
        {projectMembers.length ? <ul className="divide-y divide-line/60">{projectMembers.map(member => <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><span className="min-w-0 truncate font-medium text-ink" data-i18n-skip>{member.name}</span><span className="shrink-0 text-xs text-muted">{t(member.role)}{project.memberResponsibilities?.[member.id] ? ` · ${project.memberResponsibilities[member.id]}` : ''}</span></li>)}</ul> : <EmptyState title={t('projectWorkspace.noTeam')} description={t('projectWorkspace.noTeamHelp')} className="border-0" />}
        {new Set(projectTasks.map(task => task.department)).size > 0 && <div className="flex flex-wrap gap-2 border-t border-line/70 px-4 py-3 sm:px-5"><span className="text-xs font-medium text-muted">{t('projectWorkspace.departments')}:</span>{Array.from(new Set(projectTasks.map(task => task.department))).sort().map(department => <Badge key={department} tone="slate">{t(department)}</Badge>)}</div>}
      </section>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <section aria-labelledby="project-services-title" className={cn(cardBase, 'overflow-hidden')}>
        <div className="border-b border-line/70 px-4 py-4 sm:px-5"><h2 id="project-services-title" className="font-semibold text-ink">{t('projectWorkspace.services')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.servicesHelp')}</p></div>
        {clientPlans.length ? <ul className="divide-y divide-line/60">{clientPlans.map(plan => <ClientPlanRow key={plan.id} plan={plan} tasks={visibleClientTasks} cycles={state.serviceCycles} deliverables={state.deliverables} locale={locale} t={t} />)}</ul> : <EmptyState title={t('projectWorkspace.noServicePlans')} description={t(canOpenClientServices ? 'projectWorkspace.noServicePlansHelp' : 'projectWorkspace.servicesRestricted')} className="border-0" />}
        {canOpenClientServices && project.clientId && <Link to={`/clients/${encodeURIComponent(project.clientId)}`} className="m-4 inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{t('projectWorkspace.openClientWorkspace')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>}
      </section>

      <section aria-labelledby="project-report-title" className={cn(cardBase, 'overflow-hidden')}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5"><div><h2 id="project-report-title" className="font-semibold text-ink">{t('projectWorkspace.report')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.reportingPeriod')}: {reportRange}</p></div>{canViewReports && <Link to={`/reports?projectId=${encodeURIComponent(project.id)}`} className="inline-flex min-h-9 items-center gap-1 rounded-control px-2 text-sm font-semibold text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{t('projectWorkspace.openReport')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>}</div>
        <div className="grid grid-cols-2 divide-x divide-line/70 sm:grid-cols-4"><ReportValue label={t('On time')} value={reportCounts.onTime} /><ReportValue label={t('Late')} value={reportCounts.late} /><ReportValue label={t('Upcoming')} value={reportCounts.upcoming} /><ReportValue label={t('Overdue')} value={reportCounts.overdue} /></div>
        <p className="px-4 pb-4 text-xs leading-5 text-muted sm:px-5">{t('projectWorkspace.reportDefinition')}</p>
      </section>
    </div>

    <section aria-labelledby="project-activity-title" className={cn(cardBase, 'overflow-hidden')}>
      <div className="border-b border-line/70 px-4 py-4 sm:px-5"><h2 id="project-activity-title" className="font-semibold text-ink">{t('projectWorkspace.recentActivity')}</h2><p className="mt-1 text-sm text-muted">{t('projectWorkspace.activityHelp')}</p></div>
      {recentActivity.length ? <ol className="divide-y divide-line/60">{recentActivity.map(item => <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 sm:px-5"><span className="font-medium text-ink">{item.label}</span>{item.actor && <span className="text-sm text-muted">· <span data-i18n-skip>{item.actor}</span></span>}<Link to={`/tasks?taskId=${encodeURIComponent(item.task.id)}`} className="text-sm text-accent hover:underline"><span data-i18n-skip>{item.task.title}</span></Link><time className="ml-auto text-xs text-muted" dateTime={item.at}>{formatLocalizedDate(parseOptionalDate(item.at) || new Date(item.at), locale)}</time></li>)}</ol> : <EmptyState title={t('projectWorkspace.noActivity')} description={t('projectWorkspace.noActivityHelp')} className="border-0" />}
    </section>

    {managementOpen && <ProjectManagementPanel projectId={project.id} onClose={() => setManagementOpen(false)} onEdit={nextProject => { setManagementOpen(false); setEditingProject(nextProject); setEditorOpen(true); }} />}
    <CreateProjectModal isOpen={editorOpen} project={editingProject} onClose={() => { setEditorOpen(false); setEditingProject(null); }} onProjectUpdated={() => setEditorOpen(false)} />
  </div>;
};

const SummaryTile = ({ icon: Icon, label, value, tone = 'default', onClick }: {
  icon: typeof FolderKanban;
  label: string;
  value: number;
  tone?: 'default' | 'danger' | 'warning';
  onClick: () => void;
}) => <button type="button" onClick={onClick} className="group min-h-24 rounded-panel border border-line/80 bg-surface p-4 text-left transition hover:border-accent/30 hover:bg-inset/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
  <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted"><span>{label}</span><Icon className={cn('h-4 w-4', tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-accent')} aria-hidden="true" /></span>
  <span className={cn('calm-number mt-3 block text-2xl font-semibold tabular-nums', tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-ink')}>{value}</span>
</button>;

const ProjectTaskRow = ({ task, users, locale, t }: { task: Task; users: ReturnType<typeof useStore.getState>['users']; locale: 'en' | 'zh'; t: (value: string, values?: Record<string, string | number>) => string }) => {
  const assignee = users.find(member => member.id === task.assignedTo && member.role !== 'Client');
  return <article className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
    <div className="min-w-0"><Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="font-medium text-ink hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><span data-i18n-skip>{task.title}</span></Link><p className="mt-1 line-clamp-2 text-xs text-muted" data-i18n-skip>{task.description}</p></div>
    <div className="flex flex-wrap gap-2 text-xs text-muted"><StatusChip tone={taskStatusTone(task.status)}>{getLocalizedTaskStatus(task.status, locale)}</StatusChip><Badge tone={task.priority === 'Urgent' || task.priority === 'High' ? 'amber' : 'slate'}>{t(task.priority)}</Badge><span className="self-center">{assignee ? <span data-i18n-skip>{assignee.name}</span> : t('Unassigned')}</span></div>
    <div className="flex items-center justify-between gap-3 text-xs text-muted sm:justify-end"><span>{task.dueDate ? <>{t('Due')} {formatLocalizedDate(parseOptionalDate(task.dueDate) || new Date(task.dueDate), locale)}</> : t('No due date')}</span><Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} aria-label={t('projectWorkspace.openTaskNamed', { title: task.title })} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-control text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>
  </article>;
};

const ClientPlanRow = ({ plan, tasks, cycles, deliverables, locale, t }: {
  plan: ClientServicePlan;
  tasks: Task[];
  cycles: ReturnType<typeof useStore.getState>['serviceCycles'];
  deliverables: ReturnType<typeof useStore.getState>['deliverables'];
  locale: 'en' | 'zh';
  t: (value: string, values?: Record<string, string | number>) => string;
}) => {
  const today = new Date();
  const summary = getPlanDeliverySummary(plan, cycles, deliverables, tasks, today);
  const cycle = summary.currentCycle;
  const relatedDeliverables = cycle ? deliverables.filter(item => item.cycleId === cycle.id && item.clientId === plan.clientId) : [];
  const completedDeliverables = relatedDeliverables.filter(item => item.status === 'Delivered').length;
  const renewal = plan.contractEndDate ? parseOptionalDate(plan.contractEndDate) : null;
  return <li className="space-y-3 px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-ink" data-i18n-skip>{plan.name}</p><p className="mt-1 text-xs text-muted">{t(plan.status)}{renewal ? ` · ${t('projectWorkspace.renewalDate')} ${formatLocalizedDate(renewal, locale)}` : ''}</p></div><StatusChip tone={plan.status === 'Active' ? 'emerald' : 'slate'}>{t(plan.status)}</StatusChip></div>
    {cycle ? <div className="rounded-control bg-inset/60 px-3 py-2"><p className="text-xs font-medium text-ink">{t('projectWorkspace.currentMonthlyCycle')}: {formatLocalizedDate(parseOptionalDate(cycle.periodStart) || new Date(cycle.periodStart), locale)} – {formatLocalizedDate(parseOptionalDate(cycle.periodEnd) || new Date(cycle.periodEnd), locale)}</p><p className="mt-1 text-xs text-muted">{t(cycle.status)} · {completedDeliverables} / {relatedDeliverables.length} {t('projectWorkspace.deliverablesDelivered')}</p></div> : <p className="text-xs text-muted">{t('projectWorkspace.noCurrentCycle')}</p>}
    {relatedDeliverables.length > 0 && <div className="space-y-1"><ProgressBar label={`${t('projectWorkspace.deliveries')} ${relatedDeliverables.length ? Math.round(completedDeliverables / relatedDeliverables.length * 100) : 0}%`} value={completedDeliverables} max={relatedDeliverables.length} /><p className="text-right text-[11px] text-muted">{completedDeliverables} / {relatedDeliverables.length} {t('projectWorkspace.deliverablesDelivered')}</p></div>}
    <p className="text-[11px] leading-5 text-muted">{t('projectWorkspace.clientLevelPlanNote')}</p>
  </li>;
};

const ReportValue = ({ label, value }: { label: string; value: number }) => <div className="px-3 py-4 text-center"><p className="text-xs text-muted">{label}</p><p className="calm-number mt-2 text-xl font-semibold tabular-nums text-ink">{value}</p></div>;

export default ProjectWorkspace;
