import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { SkeletonMetricCard, SkeletonChartCard } from '../components/SkeletonCard';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { isSameDay } from 'date-fns/isSameDay';
import { isWithinInterval } from 'date-fns/isWithinInterval';
import { isBefore } from 'date-fns/isBefore';
import { AlertCircle, LayoutList, ArrowRight, Plus, FolderKanban, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ChartCard, ChartEmptyState, PageHeader, SegmentedTabs } from '../components/ui';
import { cardBase, pageShell } from '../components/uiTokens';
import { canCreateTasks, getCompaniesDashboardAction, getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import BackendFreshness from '../components/BackendFreshness';
import { cn, getRelativeDueDateString, parseOptionalDate, themeTokenColor } from '../lib/utils';
import { useColorTheme } from '../hooks/useColorTheme';
import type { User } from '../types';
import OperationsGlance from '../components/OperationsGlance';
import { getTrackedMonthlyCompletions, isTaskOpen } from '../lib/taskReporting';
import { isTaskCompleted } from '../lib/taskCompletion';
import ClientPortalDashboard from '../components/ClientPortalDashboard';
import TeamWorkload from '../components/TeamWorkload';
import { projectStatus } from '../lib/projectManagement';
import ServiceRoleDashboard from '../components/ServiceRoleDashboard';
import StaffMyWork from '../components/StaffMyWork';
import ManagementOverview from '../components/ManagementOverview';

const DeliveryReviewPanel = React.lazy(() => import('../components/DeliveryReviewPanel'));
import NeedsMyAttention from '../components/NeedsMyAttention';
import { useI18n } from '../components/I18nProvider';
import { isLocalServiceDemoEnabled, LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID } from '../mock/localServiceDemo';
import { useLocalToday } from '../hooks/useLocalToday';
import { getContractDaysRemaining } from '../lib/dashboardData';
import { getWorkWeekRange } from '../lib/workWeek';

type BossTab = 'overview' | 'portfolio' | 'pulse' | 'workload';

interface StatCardProps {
  title: string;
  value: number;
  to: string;
}

const StatCard = ({ title, value, to }: StatCardProps) => (
  <Link to={to} className="app-stat-row flex min-h-20 items-center justify-between gap-4 rounded-panel px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
    <span className="text-sm font-medium text-muted">{title}</span>
    <span className="calm-number text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</span>
  </Link>
);

const PORTFOLIO_PAGE_SIZE = 25;

const Dashboard: React.FC = () => {
  const { projects, tasks: allTasks, users, currentUser, rolePermissions, backend, setCreateTaskModalOpen, hasLocalServiceDemo, registrations, clientPlans, serviceCycles, clientProfiles } = useStore(useShallow(state => ({
    projects: state.projects,
    tasks: state.tasks,
    users: state.users,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    backend: state.backend,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
    hasLocalServiceDemo: state.clients.some(client => client.id === LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID),
    registrations: state.registrations,
    clientPlans: state.clientPlans,
    serviceCycles: state.serviceCycles,
    clientProfiles: state.clients,
  })));
  const { locale, t } = useI18n();
  const today = useLocalToday();
  const [bossTab, setBossTab] = useState<BossTab>('overview');
  const [portfolioOwner, setPortfolioOwner] = useState('All');
  const [searchParams] = useSearchParams();
  const portfolioSearch = searchParams.get('search') || '';
  const [portfolioPage, setPortfolioPage] = useState(1);

  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients: clientProfiles, projects }),
    [allTasks, clientProfiles, currentUser, projects, rolePermissions]
  );
  const { resolvedTheme } = useColorTheme();
  const chartColors = useMemo(() => {
    void resolvedTheme;
    return {
      grid: themeTokenColor('--calm-line', '#e2e8f0'),
      tick: themeTokenColor('--calm-muted', '#64748b'),
      accent: themeTokenColor('--calm-accent', '#c11c15'),
      cursor: themeTokenColor('--calm-inset', '#eff3f2'),
      surface: themeTokenColor('--calm-surface', '#ffffff'),
      series: [
        themeTokenColor('--calm-accent', '#c11c15'),
        themeTokenColor('--calm-muted', '#5f6c6f'),
        themeTokenColor('--calm-line', '#dce3e1'),
      ],
    };
  }, [resolvedTheme]);
  const visibleProjects = useMemo(
    () => getVisibleProjects(currentUser, projects, allTasks, rolePermissions, { clients: clientProfiles, projects }),
    [allTasks, clientProfiles, currentUser, projects, rolePermissions]
  );
  const activeWorkloadTasks = useMemo(() => {
    const closedIds = new Set(projects.filter(project => projectStatus(project) === 'Closed').map(project => project.id));
    return tasks.filter(task => !task.projectId || !closedIds.has(task.projectId));
  }, [projects, tasks]);
  const canCreateTask = canCreateTasks(currentUser, rolePermissions);
  const companiesDashboardAction = getCompaniesDashboardAction(currentUser, rolePermissions);
  const hasTaskData = tasks.length > 0;
  const showBossOperations = isBossKoo(currentUser);

  const portfolioOwners = useMemo(() => {
    if (!showBossOperations) return [];
    const ownerIds = new Set<string>();
    projects.forEach(project => {
      (project.projectManagerIds ?? (project.createdBy ? [project.createdBy] : [])).forEach(id => ownerIds.add(id));
    });
    clientProfiles.forEach(client => { if (client.createdBy) ownerIds.add(client.createdBy); });
    return users
      .filter(member => ownerIds.has(member.id))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [clientProfiles, projects, showBossOperations, users]);

  const portfolioAllRows = useMemo(() => {
    if (!showBossOperations) return [];
    const ownerName = (ownerId?: string) => users.find(member => member.id === ownerId)?.name || t('Unassigned');
    return [
      ...clientProfiles.map(client => ({
        id: `company-${client.id}`,
        type: t('Company'),
        company: client.clientName,
        project: t('All projects'),
        ownerIds: client.createdBy ? [client.createdBy] : [],
        owner: ownerName(client.createdBy),
        to: `/clients/${encodeURIComponent(client.id)}`,
      })),
      ...projects.map(project => ({
        id: `project-${project.id}`,
        type: t('Project'),
        company: project.clientName,
        project: project.projectName,
        ownerIds: project.projectManagerIds ?? (project.createdBy ? [project.createdBy] : []),
        owner: (project.projectManagerIds ?? (project.createdBy ? [project.createdBy] : []))
          .map(ownerName).join(', ') || t('Unassigned'),
        to: project.clientId ? `/clients/${encodeURIComponent(project.clientId)}` : '/projects',
      })),
    ];
  }, [clientProfiles, projects, showBossOperations, t, users]);

  const portfolioRows = useMemo(() => (
    portfolioAllRows
      .filter(row => (
        portfolioOwner === 'All'
        || (portfolioOwner === 'Unassigned' ? row.ownerIds.length === 0 : row.ownerIds.includes(portfolioOwner))
      ))
      .sort((left, right) => left.company.localeCompare(right.company) || left.project.localeCompare(right.project))
  ), [portfolioAllRows, portfolioOwner]);

  const filteredPortfolioRows = useMemo(() => {
    const query = portfolioSearch.trim().toLowerCase();
    if (!query) return portfolioRows;
    return portfolioRows.filter(row => [row.type, row.company, row.project, row.owner].some(value => value.toLowerCase().includes(query)));
  }, [portfolioRows, portfolioSearch]);

  const portfolioPageCount = Math.max(1, Math.ceil(filteredPortfolioRows.length / PORTFOLIO_PAGE_SIZE));
  const safePortfolioPage = Math.min(portfolioPage, portfolioPageCount);
  const pagedPortfolioRows = filteredPortfolioRows.slice(
    (safePortfolioPage - 1) * PORTFOLIO_PAGE_SIZE,
    safePortfolioPage * PORTFOLIO_PAGE_SIZE,
  );

  useEffect(() => {
    setPortfolioPage(1);
  }, [portfolioOwner, portfolioSearch]);

  const portfolioOwnerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    portfolioAllRows.forEach(row => {
      if (row.ownerIds.length === 0) {
        counts.set('Unassigned', (counts.get('Unassigned') || 0) + 1);
      } else {
        row.ownerIds.forEach(ownerId => counts.set(ownerId, (counts.get(ownerId) || 0) + 1));
      }
    });
    return counts;
  }, [portfolioAllRows]);

  const portfolioHasUnassigned = useMemo(
    () => portfolioAllRows.some(row => row.ownerIds.length === 0),
    [portfolioAllRows]
  );
  const showStaffOperations = currentUser?.role === 'Staff' || currentUser?.role === 'HOD';
  const showClientPortal = currentUser?.role === 'Client';

  const bossBriefing = useMemo(() => {
    if (!showBossOperations) return null;
    const pendingRegs = (registrations || []).filter(reg => reg.status === 'Pending');
    const overdue = tasks.filter(task => {
      const dueDate = parseOptionalDate(task.dueDate);
      return Boolean(isTaskOpen(task) && dueDate && isBefore(dueDate, today));
    });
    const waitingApproval = tasks.filter(task => isTaskOpen(task) && task.status === 'Waiting Approval');
    const renewing = (clientPlans || []).filter(plan => {
      if (plan.status !== 'Active' || !plan.contractEndDate) return false;
      const days = getContractDaysRemaining(plan.contractEndDate, today);
      return days !== null && days >= 0 && days <= 30;
    });
    return {
      pendingRegs,
      overdueCount: overdue.length,
      waitingCount: waitingApproval.length,
      renewals: renewing.sort((a, b) => (a.contractEndDate || '').localeCompare(b.contractEndDate || '')),
    };
  }, [clientPlans, registrations, showBossOperations, tasks, today]);

  const onboardingSteps = useMemo(() => {
    if (!showBossOperations) return [];
    const passwordDone = !currentUser?.mustResetPassword;
    const membersDone = users.filter(user => user.id !== currentUser?.id && !user.directoryOnly).length > 0;
    const tasksDone = tasks.length > 0;
    const clientsDone = (clientPlans || []).some(plan => plan.status === 'Active' || plan.status === 'Paused')
      || serviceCycles.some(cycle => cycle.status === 'Published' || cycle.status === 'Completed');
    return [
      { key: 'password', label: t('Set your own password'), done: passwordDone, to: '/settings' },
      { key: 'members', label: t('Add your first member'), done: membersDone, to: '/approvals' },
      { key: 'tasks', label: t('Create the first task'), done: tasksDone, to: '/tasks' },
      { key: 'clients', label: t('Add the first client'), done: clientsDone, to: '/projects' },
    ].filter(step => !step.done);
  }, [clientPlans, currentUser, serviceCycles, showBossOperations, t, tasks.length, users]);

  const openCreateTaskFor = React.useCallback((member: User) => {
    useStore.setState({ createTaskInitialAssignee: member.id });
    setCreateTaskModalOpen(true);
  }, [setCreateTaskModalOpen]);

  const dashboardDescription = showBossOperations
    ? t('Exceptions, approvals, and renewals that need a decision today.')
    : hasTaskData
      ? t('Open work, deadlines, and recent activity in your scope.')
      : t('Your live workspace is ready.');

  const stats = useMemo(() => {
    const weekRange = getWorkWeekRange(today);
    let pendingTasks = 0;
    let completedTasks = 0;
    let overdueTasks = 0;
    let dueTodayTasks = 0;
    let dueThisWeekTasks = 0;

    // Keep the dashboard metrics in one pass. In particular, calculate the
    // work-week range once instead of once per task on large workspaces.
    tasks.forEach(task => {
      const open = isTaskOpen(task);
      if (open) pendingTasks += 1;
      if (isTaskCompleted(task)) completedTasks += 1;
      if (!open) return;
      const dueDate = parseOptionalDate(task.dueDate);
      if (!dueDate) return;
      if (isBefore(dueDate, today)) overdueTasks += 1;
      if (isSameDay(dueDate, today)) dueTodayTasks += 1;
      if (isWithinInterval(dueDate, weekRange)) dueThisWeekTasks += 1;
    });

    return {
      activeProjects: visibleProjects.length,
      pendingTasks,
      completedTasks,
      overdueTasks,
      dueTodayTasks,
      dueThisWeekTasks,
    };
  }, [tasks, visibleProjects, today]);

  const tasksByTeamData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      counts[t.department] = (counts[t.department] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const tasksByStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const monthlyData = useMemo(() => getTrackedMonthlyCompletions(tasks, today, 6, locale), [locale, tasks, today]);
  const hasTrackedCompletionData = monthlyData.some(month => month.completed > 0);

  const recentTasks = useMemo(
    () => [...tasks]
      .sort((a, b) => (parseOptionalDate(b.updatedAt)?.getTime() || 0) - (parseOptionalDate(a.updatedAt)?.getTime() || 0))
      .slice(0, 5),
    [tasks]
  );







  if (backend?.isLoading) {
    return (
      <div className={pageShell}>
        <PageHeader
          title={t('Loading Dashboard...')}
          description={t('Fetching latest database state...')}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonMetricCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChartCard />
          <SkeletonChartCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonChartCard className="lg:col-span-2" />
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-5 bg-slate-300 rounded w-1/3"></div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-lg w-full"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (showStaffOperations) return <StaffMyWork />;

  if (currentUser?.role === 'Project Manager' && !isBossKoo(currentUser)) return (
    <div className={pageShell}>
      <PageHeader
        title={t('Dashboard')}
        description={t('What needs your attention today across your projects.')}
        onboardingTarget="dashboard-overview"
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <BackendFreshness />
            <Link to="/tasks" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
              {t('Portfolio work')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {canCreateTask && (
              <Button data-onboarding-target="create-task" onClick={() => setCreateTaskModalOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('New task')}
              </Button>
            )}
          </div>
        )}
      />
      <div className="mt-6"><ServiceRoleDashboard /></div>
    </div>
  );

  const analyticsSection = hasTaskData ? (
<section className="space-y-6" aria-labelledby="workspace-analytics-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="workspace-analytics-title" className="text-lg font-semibold text-slate-950">{t('Workspace analytics')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('Current workload distribution and completion trend.')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ChartCard title={t('Tasks by Department')}>
              {tasksByTeamData.length === 0 ? (
                <ChartEmptyState>{t('No task data yet')}</ChartEmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 256 }}>
                  <BarChart data={tasksByTeamData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                    <Tooltip cursor={{ fill: chartColors.cursor }} contentStyle={{ borderRadius: '8px', border: `1px solid ${chartColors.grid}`, boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }} />
                    <Bar dataKey="value" fill={chartColors.accent} radius={[4, 4, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={t('Tasks by Status')}>
              {tasksByStatusData.length === 0 ? (
                <ChartEmptyState>{t('No status data yet')}</ChartEmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 256 }}>
                  <PieChart>
                    <Pie data={tasksByStatusData} cx="50%" cy="50%" innerRadius={56} outerRadius={82} paddingAngle={4} dataKey="value">
                      {tasksByStatusData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={chartColors.series[index % chartColors.series.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${chartColors.grid}`, boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title={t('Tracked Monthly Completions')}
            description={t('Uses the actual completion timestamp. Historical completed tasks without one remain in all-time totals.')}
          >
            {hasTrackedCompletionData ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 960, height: 256 }}>
                <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                  <Tooltip cursor={{ fill: chartColors.cursor }} contentStyle={{ borderRadius: '8px', border: `1px solid ${chartColors.grid}`, boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }} />
                  <Line type="monotone" dataKey="completed" stroke={chartColors.accent} strokeWidth={2.5} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState>{t('No timestamped completions yet')}</ChartEmptyState>
            )}
          </ChartCard>
        </section>
  ) : null;

  const recentActivitySection = (
<section className={cn(cardBase, 'p-4 sm:p-5')} aria-labelledby="recent-activity-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="recent-activity-title" className="text-base font-semibold text-slate-950">{t('Recent workspace activity')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('Latest tasks across the work you can access.')}</p>
            </div>
            <Link to="/clients?period=all" className="flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700">
              {t('View tasks')} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {recentTasks.map(task => {
              const dueDateParsed = parseOptionalDate(task.dueDate);
              const isOverdue = Boolean(dueDateParsed && isTaskOpen(task) && isBefore(dueDateParsed, today));

              return (
                <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="min-w-0 rounded-control bg-inset/70 p-3 transition-colors hover:bg-inset">
                  <p data-i18n-skip className={cn('truncate text-sm font-semibold text-slate-900', isOverdue && 'text-red-700')}>{task.title}</p>
                  <p data-i18n-skip className="mt-1 truncate text-xs text-slate-500">{task.clientName} - {task.projectName || 'Independent'}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                    <span className={cn('truncate text-slate-500', isOverdue && 'font-semibold text-red-600')}>
                      {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status, locale)}
                    </span>
                    <span className={cn(
                      'shrink-0 rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700',
                      task.status === 'Completed' && 'bg-emerald-50 text-emerald-700',
                      task.status === 'In Progress' && 'bg-blue-50 text-blue-700',
                      (task.status === 'Pending' || task.status === 'Waiting Approval') && 'bg-amber-50 text-amber-700',
                      task.status === 'Cancelled' && 'bg-red-50 text-red-700'
                    )}>
                      {task.status}
                    </span>
                  </div>
                </Link>
              );
            })}
            {recentTasks.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center md:col-span-2 xl:col-span-5">
                <p className="text-sm font-semibold text-slate-600">{t('No recent tasks yet')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('Newly created work will appear here first.')}</p>
                {canCreateTask && (
                  <Button onClick={() => setCreateTaskModalOpen(true)} variant="secondary" className="mt-3 min-h-9 px-3 py-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    {t('New task')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
  );

  return (
    <>
    <div className={pageShell}>
      <PageHeader
        title={isBossKoo(currentUser) ? t('Agency operations') : currentUser?.role === 'Project Manager' ? t('Portfolio work') : showClientPortal ? t('Home') : t('Dashboard')}
        onboardingTarget="dashboard-overview"
        description={showClientPortal
          ? <>{t('Deliveries waiting for review, upcoming work, and shared updates for')} <span data-i18n-skip>{currentUser?.companyName || 'your company'}</span>.</>
          : dashboardDescription}
        action={(
          <div className="flex flex-wrap items-center gap-2.5">
            <BackendFreshness />
            {companiesDashboardAction && (
              <Link to="/projects" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
                <Plus className="h-4 w-4" />
                {t(companiesDashboardAction)}
              </Link>
            )}
            {canCreateTask && (
              <Button data-onboarding-target="create-task" onClick={() => setCreateTaskModalOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('New task')}
              </Button>
            )}
          </div>
        )}
      />

      {!showClientPortal && isLocalServiceDemoEnabled() && backend.mode === 'local' && hasLocalServiceDemo && (
        <section className={cn(cardBase, 'mt-5 overflow-hidden')} aria-labelledby="local-service-demo-heading">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="calm-eyebrow">{t('Local sample workspace')}</p>
              <h2 id="local-service-demo-heading" className="mt-1 text-lg font-semibold text-slate-950">{t('Explore the service demo')}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{t('Open UrbanEats for a published cycle, deliverables, task-chain dependencies, comments, files, and add-ons. TechNova and EcoLife show the other plan-creation modes.')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/clients/${LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 dark:text-[rgb(var(--calm-accent-ink))]">
                {t('Open UrbanEats')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {currentUser?.role !== 'Client' && <Link to="/clients" className="inline-flex min-h-11 items-center justify-center rounded-control px-4 text-sm font-semibold text-accent transition hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{t('Open delivery tracker')}</Link>}
            </div>
          </div>
        </section>
      )}

      {!showClientPortal && !hasTaskData && (
        <section className={cn(cardBase, 'overflow-hidden')}>
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <FolderKanban className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-950">
                  {currentUser?.role === 'Client'
                    ? t('No visible client tasks yet')
                    : currentUser?.role === 'Staff' || currentUser?.role === 'HOD'
                      ? t('No assigned tasks yet')
                      : t('Start the live workspace')}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  {currentUser?.role === 'Client'
                    ? t('Tasks for your company will appear here as soon as the team publishes or assigns them.')
                    : currentUser?.role === 'Staff' || currentUser?.role === 'HOD'
                      ? t('Work assigned to you and work in your permitted departments will appear here.')
                      : t('Demo tasks are cleared. Create the first real task so dashboards, calendars, notifications, and reports begin filling with live data.')}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              {canCreateTask && (
                <Button onClick={() => setCreateTaskModalOpen(true)} className="shrink-0">
                  <Plus className="h-4 w-4" />
                  {currentUser?.role === 'Staff' || currentUser?.role === 'HOD' ? t('New task') : t('Create first task')}
                </Button>
              )}
              <Link
                to="/projects"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t('View companies')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {showClientPortal ? (
        <ClientPortalDashboard tasks={tasks} users={users} />
      ) : (
      <div className="flex flex-col gap-6">
        {showBossOperations && onboardingSteps.length > 0 && (
          <section className={cn(cardBase, 'p-5')} aria-labelledby="onboarding-checklist-title">
            <h2 id="onboarding-checklist-title" className="text-base font-semibold text-ink">{t('Finish setup')}</h2>
            <p className="mt-1 text-sm text-muted">{t('A few steps to get the workspace moving.')}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {onboardingSteps.map(step => (
                <Link key={step.key} to={step.to} className="group flex min-h-11 items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-inset">
                  {step.label}
                  <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {showBossOperations ? (
          <>
            <SegmentedTabs<BossTab>
              items={[
                { id: 'overview' as const, label: t('Overview'), icon: LayoutList },
                { id: 'portfolio' as const, label: t('Portfolio'), icon: FolderKanban },
                { id: 'pulse' as const, label: t('Agency pulse'), icon: AlertCircle },
                { id: 'workload' as const, label: t('Team workload'), icon: Users },
              ]}
              value={bossTab}
              onChange={setBossTab}
              label={t('Boss dashboard views')}
              idPrefix="boss"
              variant="boss"
            />

            {bossTab === 'overview' && (
              <div id="boss-panel-overview" role="tabpanel" aria-labelledby="boss-tab-overview" tabIndex={0} className="space-y-6">
                {bossBriefing && bossBriefing.pendingRegs.length > 0 && (
                  <Link to="/approvals" className={cn(cardBase, 'flex flex-wrap items-center gap-4 border-l-2 border-accent p-5 transition-colors hover:bg-inset/50')}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{t('Registrations waiting for approval')}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {bossBriefing.pendingRegs.length} {t('pending registrations need your review.')}
                      </span>
                    </span>
                    <span className="inline-flex min-h-9 items-center rounded-control bg-accent px-3 text-sm font-semibold text-white">{t('Review')}</span>
                  </Link>
                )}

                <ManagementOverview part="summary" />
                <NeedsMyAttention />
                <React.Suspense fallback={null}><DeliveryReviewPanel /></React.Suspense>
                {recentActivitySection}
              </div>
            )}

            {bossTab === 'portfolio' && (
              <div id="boss-panel-portfolio" role="tabpanel" aria-labelledby="boss-tab-portfolio" tabIndex={0} className="space-y-6">
                <ManagementOverview part="portfolio" />
                <ServiceRoleDashboard />

                <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="portfolio-monitor-title">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
                    <div>
                      <h2 id="portfolio-monitor-title" className="text-base font-semibold text-ink">{t('Client & project monitor')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('Every company and project with its Project Manager owner.')}</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <span className="whitespace-nowrap">{t('Filter by owner')}</span>
                      <select
                        aria-label={t('Filter by owner')}
                        value={portfolioOwner}
                        onChange={event => setPortfolioOwner(event.target.value)}
                        className="min-h-9 rounded-control border border-line bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/35"
                      >
                        <option value="All">{t('All Project Managers')} ({portfolioAllRows.length})</option>
                        {portfolioHasUnassigned && (
                          <option value="Unassigned">{t('Unassigned')} ({portfolioOwnerCounts.get('Unassigned') || 0})</option>
                        )}
                        {portfolioOwners.map(owner => (
                          <option key={owner.id} value={owner.id}>{owner.name} ({portfolioOwnerCounts.get(owner.id) || 0})</option>
                        ))}
                      </select>
                      </label>
                    </div>
                  </div>
                  {filteredPortfolioRows.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-muted">{t('No companies or projects match this owner yet.')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="border-b border-line/60 bg-inset/40 text-xs tracking-wide text-muted">
                          <tr>
                            <th className="px-5 py-3 font-semibold">{t('Type')}</th>
                            <th className="px-5 py-3 font-semibold">{t('Company')}</th>
                            <th className="px-5 py-3 font-semibold">{t('Project')}</th>
                            <th className="px-5 py-3 font-semibold">{t('Owner')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/50">
                          {pagedPortfolioRows.map(row => (
                            <tr key={row.id} className="hover:bg-inset/40">
                              <td className="px-5 py-3 text-muted">{row.type}</td>
                              <td className="px-5 py-3 font-medium text-ink">{row.company}</td>
                              <td className="px-5 py-3 text-ink">
                                <Link to={row.to} className="hover:text-accent">{row.project}</Link>
                              </td>
                              <td className="px-5 py-3 text-muted">{row.owner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex flex-col gap-3 border-t border-line/60 px-5 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          {t('Showing')} {(safePortfolioPage - 1) * PORTFOLIO_PAGE_SIZE + 1}–{Math.min(safePortfolioPage * PORTFOLIO_PAGE_SIZE, filteredPortfolioRows.length)} {t('of')} {filteredPortfolioRows.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={safePortfolioPage <= 1}
                            onClick={() => setPortfolioPage(page => Math.max(1, page - 1))}
                            className="min-h-9 rounded-control border border-line bg-surface px-3 font-semibold text-ink transition-colors hover:bg-inset disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {t('Previous')}
                          </button>
                          <span aria-live="polite">{t('Page')} {safePortfolioPage} {t('of')} {portfolioPageCount}</span>
                          <button
                            type="button"
                            disabled={safePortfolioPage >= portfolioPageCount}
                            onClick={() => setPortfolioPage(page => Math.min(portfolioPageCount, page + 1))}
                            className="min-h-9 rounded-control border border-line bg-surface px-3 font-semibold text-ink transition-colors hover:bg-inset disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {t('Next')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {bossBriefing && bossBriefing.renewals.length > 0 && (
                  <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="renewals-title">
                    <div className="border-b border-line/70 px-5 py-4">
                      <h2 id="renewals-title" className="text-base font-semibold text-ink">{t('Contract renewals')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('Active plans ending within 30 days.')}</p>
                    </div>
                    <div className="divide-y divide-line/60">
                      {bossBriefing.renewals.slice(0, 6).map(plan => {
                        const days = getContractDaysRemaining(plan.contractEndDate, today);
                        if (days === null) return null;
                        return (
                          <div key={plan.id} className="flex items-center justify-between gap-3 px-5 py-3">
                            <Link to={`/clients/${encodeURIComponent(plan.clientId)}`} className="min-w-0 truncate text-sm font-medium text-ink hover:text-accent">
                              {plan.clientName} · {plan.name}
                            </Link>
                            <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold', days <= 7 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                              {days === 0 ? t('Ends today') : `${days} ${t('days left')}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            )}

            {bossTab === 'pulse' && (
              <div id="boss-panel-pulse" role="tabpanel" aria-labelledby="boss-tab-pulse" tabIndex={0} className="space-y-6">
                <OperationsGlance tasks={activeWorkloadTasks} users={users} scope="agency" />
                {analyticsSection}
              </div>
            )}

            {bossTab === 'workload' && (
              <div id="boss-panel-workload" role="tabpanel" aria-labelledby="boss-tab-workload" tabIndex={0} className="space-y-6">
                <ManagementOverview part="capacity" />
                <TeamWorkload tasks={activeWorkloadTasks} users={users} onCreateTaskFor={openCreateTaskFor} />
              </div>
            )}
          </>
        ) : (
          <>
            <ServiceRoleDashboard />
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('Workspace metrics')}>
              <StatCard title={t('Active Companies')} value={stats.activeProjects} to="/projects" />
              <StatCard title={t('Pending Tasks')} value={stats.pendingTasks} to="/tasks" />
              <StatCard title={t('Completed Tasks')} value={stats.completedTasks} to="/tasks?show=completed" />
              <StatCard title={t('Overdue Tasks')} value={stats.overdueTasks} to="/tasks?focus=overdue" />
              <StatCard title={t('Due Today')} value={stats.dueTodayTasks} to="/calendar" />
              <StatCard title={t('Due This Week')} value={stats.dueThisWeekTasks} to="/calendar" />
            </section>
            {analyticsSection}
            {recentActivitySection}
          </>
        )}


      </div>
      )}
    </div>
    </>
  );
};

export default Dashboard;
