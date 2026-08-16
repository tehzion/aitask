import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { SkeletonMetricCard, SkeletonChartCard } from '../components/SkeletonCard';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { format, isToday, isThisWeek, isBefore, differenceInDays } from 'date-fns';
import { CheckCircle2, Clock, AlertCircle, LayoutList, Calendar, CalendarDays, ArrowRight, LucideIcon, Plus, FolderKanban, UserPlus, Users, FileCheck2, Sparkles, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, ChartCard, ChartEmptyState, MetricCard, PageHeader } from '../components/ui';
import { cardBase, pageShell } from '../components/uiTokens';
import { canCreateTasks, getClientKey, getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import { getClientTaskStage } from '../lib/clientPortal';
import BackendFreshness from '../components/BackendFreshness';
import { cn, getRelativeDueDateString, parseOptionalDate, themeTokenColor } from '../lib/utils';
import { useColorTheme } from '../hooks/useColorTheme';
import type { User } from '../types';
import { getMemberDepartments } from '../lib/departments';
import OperationsGlance from '../components/OperationsGlance';
import { getTrackedMonthlyCompletions, isTaskOpen } from '../lib/taskReporting';
import ClientPortalDashboard from '../components/ClientPortalDashboard';
import TeamWorkload from '../components/TeamWorkload';
import ServiceRoleDashboard from '../components/ServiceRoleDashboard';
import { useI18n } from '../components/I18nProvider';
import { isLocalServiceDemoEnabled, LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID } from '../mock/localServiceDemo';

type BossTab = 'overview' | 'pulse' | 'workload';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone: 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
  to: string;
}

const StatCard = ({ title, value, icon: Icon, tone, to }: StatCardProps) => (
  <Link to={to} className="block rounded-panel transition-colors hover:bg-inset/70 focus:outline-none focus:ring-2 focus:ring-accent/35">
    <MetricCard title={title} value={value} icon={Icon} tone={tone} />
  </Link>
);

const Dashboard: React.FC = () => {
  const { projects, tasks: allTasks, users, currentUser, rolePermissions, backend, setCreateTaskModalOpen, hasLocalServiceDemo, registrations, clientPlans, serviceCycles } = useStore(useShallow(state => ({
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
  })));
  const { t } = useI18n();
  const [bossTab, setBossTab] = useState<BossTab>('overview');

  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions),
    [allTasks, currentUser, rolePermissions]
  );
  const { resolvedTheme } = useColorTheme();
  const chartColors = useMemo(() => {
    void resolvedTheme;
    return {
      grid: themeTokenColor('--calm-line', '#e2e8f0'),
      tick: themeTokenColor('--calm-muted', '#64748b'),
      accent: themeTokenColor('--calm-accent', '#1d6b5d'),
      cursor: themeTokenColor('--calm-inset', '#eff3f2'),
      surface: themeTokenColor('--calm-surface', '#ffffff'),
      series: [
        themeTokenColor('--calm-accent', '#1d6b5d'),
        themeTokenColor('--calm-muted', '#5f6c6f'),
        themeTokenColor('--calm-line', '#dce3e1'),
      ],
    };
  }, [resolvedTheme]);
  const visibleProjects = useMemo(
    () => getVisibleProjects(currentUser, projects, allTasks, rolePermissions),
    [allTasks, currentUser, projects, rolePermissions]
  );
  const canCreateTask = canCreateTasks(currentUser, rolePermissions);
  const hasTaskData = tasks.length > 0;
  const prioritizePersonalWork = currentUser?.role === 'Staff' || currentUser?.role === 'Client';
  const showBossOperations = isBossKoo(currentUser);
  const showStaffOperations = currentUser?.role === 'Staff';
  const showClientPortal = currentUser?.role === 'Client';

  const bossBriefing = useMemo(() => {
    if (!showBossOperations) return null;
    const today = new Date();
    const pendingRegs = (registrations || []).filter(reg => reg.status === 'Pending');
    const overdue = tasks.filter(task => {
      const dueDate = parseOptionalDate(task.dueDate);
      return Boolean(isTaskOpen(task) && dueDate && isBefore(dueDate, today) && !isToday(dueDate));
    });
    const waitingApproval = tasks.filter(task => isTaskOpen(task) && task.status === 'Waiting Approval');
    const renewing = (clientPlans || []).filter(plan => {
      if (plan.status !== 'Active' || !plan.contractEndDate) return false;
      const days = differenceInDays(parseOptionalDate(plan.contractEndDate) || today, today);
      return days >= 0 && days <= 30;
    });
    return {
      pendingRegs,
      overdueCount: overdue.length,
      waitingCount: waitingApproval.length,
      renewals: renewing.sort((a, b) => (a.contractEndDate || '').localeCompare(b.contractEndDate || '')),
    };
  }, [clientPlans, registrations, showBossOperations, tasks]);

  const onboardingSteps = useMemo(() => {
    if (!showBossOperations) return [];
    const passwordDone = !currentUser?.mustResetPassword;
    const membersDone = users.filter(user => user.id !== currentUser?.id && !user.directoryOnly).length > 0;
    const tasksDone = tasks.length > 0;
    const clientsDone = (clientPlans || []).length > 0 || serviceCycles.length > 0 || hasLocalServiceDemo;
    return [
      { key: 'password', label: t('Set your own password'), done: passwordDone, to: '/settings' },
      { key: 'members', label: t('Add your first member'), done: membersDone, to: '/approvals' },
      { key: 'tasks', label: t('Create the first task'), done: tasksDone, to: '/tasks' },
      { key: 'clients', label: t('Create the first client plan'), done: clientsDone, to: '/clients' },
    ].filter(step => !step.done);
  }, [clientPlans, currentUser, hasLocalServiceDemo, serviceCycles.length, showBossOperations, t, tasks.length, users]);

  const openCreateTaskFor = React.useCallback((member: User) => {
    useStore.setState({ createTaskInitialAssignee: member.id });
    setCreateTaskModalOpen(true);
  }, [setCreateTaskModalOpen]);
  const staffAssignedTasks = useMemo(
    () => showStaffOperations && currentUser
      ? tasks.filter(task => task.assignedTo === currentUser.id)
      : [],
    [currentUser, showStaffOperations, tasks]
  );
  const dashboardDescription = currentUser?.role === 'Staff'
    ? staffAssignedTasks.length > 0
      ? `Welcome back, ${currentUser.name}. Here is what needs your attention and what you have completed.`
      : `Welcome back, ${currentUser.name}. Your assigned work will appear here.`
    : hasTaskData
      ? `Welcome back, ${currentUser?.name}! Here's your task overview.`
      : `Welcome back, ${currentUser?.name}! Your live workspace is ready.`;

  const stats = useMemo(() => {
    const today = new Date();
    
    const activeProjects = visibleProjects.length;
      
    const pendingTasks = tasks.filter(isTaskOpen).length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    
    const overdueTasks = tasks.filter(t => {
      const dueDate = parseOptionalDate(t.dueDate);
      return Boolean(dueDate && !t.isCompleted && isBefore(dueDate, today) && !isToday(dueDate));
    }).length;
    
    const dueTodayTasks = tasks.filter(t => {
      const dueDate = parseOptionalDate(t.dueDate);
      return Boolean(dueDate && !t.isCompleted && isToday(dueDate));
    }).length;
    
    const dueThisWeekTasks = tasks.filter(t => {
      const dueDate = parseOptionalDate(t.dueDate);
      return Boolean(dueDate && !t.isCompleted && isThisWeek(dueDate));
    }).length;

    return { activeProjects, pendingTasks, completedTasks, overdueTasks, dueTodayTasks, dueThisWeekTasks };
  }, [tasks, visibleProjects]);

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

  const monthlyData = useMemo(() => getTrackedMonthlyCompletions(tasks), [tasks]);
  const hasTrackedCompletionData = monthlyData.some(month => month.completed > 0);

  const recentTasks = useMemo(
    () => [...tasks]
      .sort((a, b) => (parseOptionalDate(b.startDate)?.getTime() || 0) - (parseOptionalDate(a.startDate)?.getTime() || 0))
      .slice(0, 5),
    [tasks]
  );

  const myTasks = useMemo(() => {
    if (!currentUser) return { dueToday: [], overdue: [], actionRequired: [] };
    const today = new Date();
    const isPersonalTask = (task: (typeof tasks)[number]) => currentUser.role === 'Client'
      ? task.clientName === currentUser.companyName
      : task.assignedTo === currentUser.id;

    const dueToday = tasks.filter(t => {
      const dueDate = parseOptionalDate(t.dueDate);
      return Boolean(
        dueDate &&
        !t.isCompleted &&
        t.status !== 'Cancelled' &&
        isPersonalTask(t) &&
        isToday(dueDate)
      );
    });

    const overdue = tasks.filter(t =>
      {
        const dueDate = parseOptionalDate(t.dueDate);
        return Boolean(
          dueDate &&
          !t.isCompleted &&
          t.status !== 'Cancelled' &&
          isPersonalTask(t) &&
          isBefore(dueDate, today) &&
          !isToday(dueDate)
        );
      }
    );

    const actionRequired = tasks.filter(t => {
      if (currentUser.role === 'Client') {
        return getClientKey(t.clientName) === getClientKey(currentUser.companyName)
          && getClientTaskStage(t) === 'awaiting_review';
      } else {
        return !t.isCompleted && t.status !== 'Cancelled'
          && t.assignedTo === currentUser.id && t.status === 'Waiting Approval';
      }
    });

    return { dueToday, overdue, actionRequired };
  }, [tasks, currentUser]);
  const staffBriefing = useMemo(() => {
    if (!showStaffOperations || !currentUser) return null;
    const dueSoon = staffAssignedTasks
      .filter(task => isTaskOpen(task) && task.dueDate)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 6);
    const waitingCount = staffAssignedTasks.filter(task => isTaskOpen(task) && task.status === 'Waiting Approval').length;
    return {
      dueTodayCount: myTasks.dueToday.length,
      overdueCount: myTasks.overdue.length,
      waitingCount,
      dueSoon,
    };
  }, [currentUser, myTasks.dueToday.length, myTasks.overdue.length, showStaffOperations, staffAssignedTasks]);

  const departmentContext = useMemo(() => {
    if (!showStaffOperations || !currentUser) return null;
    const myDepartments = getMemberDepartments(currentUser);
    if (myDepartments.length === 0) return null;
    const primaryDepartment = myDepartments[0];
    const teammates = users.filter(user => (
      user.id !== currentUser.id
      && user.role !== 'Client'
      && !user.directoryOnly
      && getMemberDepartments(user).includes(primaryDepartment)
    ));
    const departmentTasks = allTasks.filter(task => task.department === primaryDepartment);
    const openCount = departmentTasks.filter(isTaskOpen).length;
    const overdueCount = departmentTasks.filter(task => {
      const dueDate = parseOptionalDate(task.dueDate);
      return Boolean(isTaskOpen(task) && dueDate && isBefore(dueDate, new Date()) && !isToday(dueDate));
    }).length;
    const waitingCount = departmentTasks.filter(task => isTaskOpen(task) && task.status === 'Waiting Approval').length;
    return { primaryDepartment, teammates, openCount, overdueCount, waitingCount };
  }, [allTasks, currentUser, showStaffOperations, users]);

  const staffOnboardingSteps = useMemo(() => {
    if (!showStaffOperations || !currentUser) return [];
    const passwordDone = !currentUser?.mustResetPassword;
    const profileDone = Boolean(currentUser.avatar || currentUser.email);
    const taskAssigned = staffAssignedTasks.length > 0;
    const updatedSomething = tasks.some(task => (
      task.assignedTo === currentUser.id && (task.isCompleted || (task.comments?.length || 0) > 0)
    ));
    return [
      { key: 'password', label: t('Set your own password'), done: passwordDone, to: '/settings' },
      { key: 'profile', label: t('Complete your profile'), done: profileDone, to: '/settings' },
      { key: 'first-task', label: t('Review your first assigned task'), done: taskAssigned, to: '/tasks' },
      { key: 'first-update', label: t('Complete a task or leave an update'), done: updatedSomething, to: '/tasks' },
    ].filter(step => !step.done);
  }, [currentUser, showStaffOperations, staffAssignedTasks.length, t, tasks]);




  if (backend?.isLoading) {
    return (
      <div className={pageShell}>
        <PageHeader
          title="Loading Dashboard..."
          description="Fetching latest database state..."
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

  return (
    <div className={pageShell}>
      <PageHeader
        title={isBossKoo(currentUser) ? 'Super Admin Dashboard' : currentUser?.role === 'Admin' ? 'Admin Dashboard' : showClientPortal ? 'Client Portal' : 'My Dashboard'}
        description={showClientPortal
          ? `${currentUser?.companyName || 'Your company'} work, deliveries, feedback, and approvals.`
          : dashboardDescription}
        action={(
          <div className="flex flex-wrap items-center gap-2.5">
            <BackendFreshness />
            {canCreateTask && (
              <Button onClick={() => setCreateTaskModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Task
              </Button>
            )}
          </div>
        )}
      />

      {isLocalServiceDemoEnabled() && backend.mode === 'local' && hasLocalServiceDemo && (
        <section className={cn(cardBase, 'mt-5 overflow-hidden')} aria-labelledby="local-service-demo-heading">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="calm-eyebrow">Local sample workspace</p>
              <h2 id="local-service-demo-heading" className="mt-1 text-lg font-semibold text-slate-950">Explore the service demo</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Open UrbanEats for a published cycle, deliverables, task-chain dependencies, comments, files, and add-ons. TechNova and EcoLife show the other plan-creation modes.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/clients/${LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 dark:text-[rgb(var(--calm-accent-ink))]">
                Open UrbanEats
                <ArrowRight className="h-4 w-4" />
              </Link>
              {currentUser?.role !== 'Client' && <Link to="/clients" className="inline-flex min-h-11 items-center justify-center rounded-control px-4 text-sm font-semibold text-accent transition hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">Browse clients</Link>}
            </div>
          </div>
        </section>
      )}

      {!hasTaskData && (
        <section className={cn(cardBase, 'overflow-hidden')}>
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <FolderKanban className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-950">
                  {currentUser?.role === 'Client'
                    ? 'No visible client tasks yet'
                    : currentUser?.role === 'Staff'
                      ? 'No assigned tasks yet'
                      : 'Start the live workspace'}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  {currentUser?.role === 'Client'
                    ? 'Tasks for your company will appear here as soon as the team publishes or assigns them.'
                    : currentUser?.role === 'Staff'
                      ? 'Work assigned to you will appear here. You can also create a task for an existing Admin-created company.'
                      : 'Demo tasks are cleared. Create the first real task so dashboards, calendars, notifications, and reports begin filling with live data.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              {canCreateTask && (
                <Button onClick={() => setCreateTaskModalOpen(true)} className="shrink-0">
                  <Plus className="h-4 w-4" />
                  {currentUser?.role === 'Staff' ? 'Create task' : 'Create first task'}
                </Button>
              )}
              <Link
                to="/projects"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                View companies
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
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h2 id="onboarding-checklist-title" className="text-base font-semibold text-ink">{t('Workspace setup')}</h2>
            </div>
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
            <div className="inline-flex w-fit rounded-panel border border-line bg-surface p-1 shadow-sm" role="tablist" aria-label={t('Boss dashboard views')}>
              {([['overview', t('Overview'), LayoutList], ['pulse', t('Agency pulse'), AlertCircle], ['workload', t('Team workload'), Users]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={bossTab === key}
                  onClick={() => setBossTab(key)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors',
                    bossTab === key ? 'bg-accent text-white' : 'text-muted hover:bg-inset hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>

            {bossTab === 'overview' && (
              <div className="space-y-6">
                {bossBriefing && bossBriefing.pendingRegs.length > 0 && (
                  <Link to="/approvals" className={cn(cardBase, 'flex flex-wrap items-center gap-4 p-5 transition-colors hover:bg-inset/50')}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"><UserPlus className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{t('Registrations waiting for approval')}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {bossBriefing.pendingRegs.length} {t('pending registrations need your review.')}
                      </span>
                    </span>
                    <span className="inline-flex min-h-9 items-center rounded-control bg-accent px-3 text-sm font-semibold text-white">{t('Review')}</span>
                  </Link>
                )}

                {bossBriefing && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Link to="/tasks" className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', bossBriefing.overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-inset text-muted')}><AlertCircle className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="calm-number block text-xl font-semibold text-ink">{bossBriefing.overdueCount}</span>
                        <span className="block truncate text-xs text-muted">{t('Overdue tasks')}</span>
                      </span>
                    </Link>
                    <Link to="/tasks" className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', bossBriefing.waitingCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-inset text-muted')}><FileCheck2 className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="calm-number block text-xl font-semibold text-ink">{bossBriefing.waitingCount}</span>
                        <span className="block truncate text-xs text-muted">{t('Waiting approval')}</span>
                      </span>
                    </Link>
                    <Link to="/clients" className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', bossBriefing.renewals.length > 0 ? 'bg-blue-50 text-blue-700' : 'bg-inset text-muted')}><CalendarClock className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="calm-number block text-xl font-semibold text-ink">{bossBriefing.renewals.length}</span>
                        <span className="block truncate text-xs text-muted">{t('Renewals in 30 days')}</span>
                      </span>
                    </Link>
                  </div>
                )}

                <ServiceRoleDashboard />

                {bossBriefing && bossBriefing.renewals.length > 0 && (
                  <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="renewals-title">
                    <div className="border-b border-line/70 px-5 py-4">
                      <h2 id="renewals-title" className="text-base font-semibold text-ink">{t('Contract renewals')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('Active plans ending within 30 days.')}</p>
                    </div>
                    <div className="divide-y divide-line/60">
                      {bossBriefing.renewals.slice(0, 6).map(plan => {
                        const days = differenceInDays(parseOptionalDate(plan.contractEndDate) || new Date(), new Date());
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
              <div className="space-y-6">
                <OperationsGlance tasks={tasks} users={users} scope="agency" />
              </div>
            )}

            {bossTab === 'workload' && (
              <TeamWorkload tasks={tasks} users={users} onCreateTaskFor={openCreateTaskFor} />
            )}
          </>
        ) : (
          <>
            <div className="order-1">
              <ServiceRoleDashboard />
            </div>
            {showStaffOperations ? (
              <div className="order-2">
                <OperationsGlance tasks={staffAssignedTasks} users={users} scope="staff" />
              </div>
            ) : (
              <section className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', prioritizePersonalWork ? 'order-2' : 'order-1')} aria-label="Workspace metrics">
                <StatCard title="Active Companies" value={stats.activeProjects} icon={LayoutList} tone="blue" to="/projects" />
                <StatCard title="Pending Tasks" value={stats.pendingTasks} icon={Clock} tone="amber" to="/tasks" />
                <StatCard title="Completed Tasks" value={stats.completedTasks} icon={CheckCircle2} tone="emerald" to="/tasks" />
                <StatCard title="Overdue Tasks" value={stats.overdueTasks} icon={AlertCircle} tone="red" to="/tasks" />
                <StatCard title="Due Today" value={stats.dueTodayTasks} icon={Calendar} tone="blue" to="/calendar" />
                <StatCard title="Due This Week" value={stats.dueThisWeekTasks} icon={CalendarDays} tone="slate" to="/calendar" />
              </section>
            )}

            {showStaffOperations && (
              <div className="order-2 space-y-6">
                {staffOnboardingSteps.length > 0 && (
                  <section className={cn(cardBase, 'p-5')} aria-labelledby="staff-onboarding-title">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-accent" />
                      <h2 id="staff-onboarding-title" className="text-base font-semibold text-ink">{t('Getting started')}</h2>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {staffOnboardingSteps.map(step => (
                        <Link key={step.key} to={step.to} className="group flex min-h-11 items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-inset">
                          {step.label}
                          <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {staffBriefing && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Link to="/tasks?period=today" className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', staffBriefing.dueTodayCount > 0 ? 'bg-blue-50 text-blue-700' : 'bg-inset text-muted')}><Calendar className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="calm-number block text-xl font-semibold text-ink">{staffBriefing.dueTodayCount}</span>
                        <span className="block truncate text-xs text-muted">{t('Due today')}</span>
                      </span>
                    </Link>
                    <Link to="/tasks" className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', staffBriefing.overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-inset text-muted')}><AlertCircle className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="calm-number block text-xl font-semibold text-ink">{staffBriefing.overdueCount}</span>
                        <span className="block truncate text-xs text-muted">{t('Overdue')}</span>
                      </span>
                    </Link>
                    <Link to="/tasks" className={cn(cardBase, 'flex items-center gap-3 p-4 transition-colors hover:bg-inset/50')}>
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', staffBriefing.waitingCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-inset text-muted')}><FileCheck2 className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="calm-number block text-xl font-semibold text-ink">{staffBriefing.waitingCount}</span>
                        <span className="block truncate text-xs text-muted">{t('Waiting approval')}</span>
                      </span>
                    </Link>
                  </div>
                )}

                {staffBriefing && staffBriefing.dueSoon.length > 0 && (
                  <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="due-soon-title">
                    <div className="border-b border-line/70 px-5 py-4">
                      <h2 id="due-soon-title" className="text-base font-semibold text-ink">{t('Due soon')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('Your upcoming deadlines in order.')}</p>
                    </div>
                    <div className="divide-y divide-line/60">
                      {staffBriefing.dueSoon.map(task => (
                        <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-inset/50">
                          <span className="min-w-0 truncate text-sm font-medium text-ink">
                            <span data-i18n-skip>{task.title}</span>
                            <span className="ml-2 text-xs text-muted">{task.clientName}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-muted">{getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {departmentContext && (
                  <section className={cn(cardBase, 'p-5')} aria-labelledby="department-context-title">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 id="department-context-title" className="text-base font-semibold text-ink">
                          {t('My department')} · <span data-i18n-skip>{departmentContext.primaryDepartment}</span>
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                          {departmentContext.teammates.length + 1} {t('members')} · {departmentContext.openCount} {t('open tasks')} · {departmentContext.overdueCount} {t('overdue')} · {departmentContext.waitingCount} {t('in review')}
                        </p>
                      </div>
                      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                        {t('My tasks')} <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                    {departmentContext.teammates.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {departmentContext.teammates.map(member => (
                          <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-inset px-3 py-1 text-xs font-medium text-ink">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
                              {member.avatar ? <img src={member.avatar} alt="" className="h-full w-full rounded-full object-cover" /> : member.name.charAt(0)}
                            </span>
                            <span data-i18n-skip>{member.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}

        {hasTaskData && (
        <section className={cn('space-y-6', prioritizePersonalWork ? 'order-4' : 'order-2')} aria-labelledby="workspace-analytics-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="workspace-analytics-title" className="text-lg font-semibold text-slate-950">Workspace analytics</h2>
              <p className="mt-1 text-sm text-slate-500">Current workload distribution and completion trend.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ChartCard title="Tasks by Department">
              {tasksByTeamData.length === 0 ? (
                <ChartEmptyState>No task data yet</ChartEmptyState>
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

            <ChartCard title="Tasks by Status">
              {tasksByStatusData.length === 0 ? (
                <ChartEmptyState>No status data yet</ChartEmptyState>
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
            title="Tracked Monthly Completions"
            description="Uses the actual completion timestamp. Historical completed tasks without one remain in all-time totals."
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
              <ChartEmptyState>No timestamped completions yet</ChartEmptyState>
            )}
          </ChartCard>
        </section>
        )}

        <section className={cn(cardBase, 'order-3 p-4 sm:p-5')} aria-labelledby="recent-activity-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="recent-activity-title" className="text-base font-semibold text-slate-950">Recent workspace activity</h2>
              <p className="mt-1 text-sm text-slate-500">Latest tasks across the work you can access.</p>
            </div>
            <Link to="/tasks" className="flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700">
              View tasks <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {recentTasks.map(task => {
              const dueDateParsed = parseOptionalDate(task.dueDate);
              const isOverdue = Boolean(dueDateParsed && !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed));

              return (
                <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="min-w-0 rounded-control bg-inset/70 p-3 transition-colors hover:bg-inset">
                  <p data-i18n-skip className={cn('truncate text-sm font-semibold text-slate-900', isOverdue && 'text-red-700')}>{task.title}</p>
                  <p data-i18n-skip className="mt-1 truncate text-xs text-slate-500">{task.clientName} - {task.projectName || 'Independent'}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                    <span className={cn('truncate text-slate-500', isOverdue && 'font-semibold text-red-600')}>
                      {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
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
                <p className="text-sm font-semibold text-slate-600">No recent tasks yet</p>
                <p className="mt-1 text-xs text-slate-500">Newly created work will appear here first.</p>
                {canCreateTask && (
                  <Button onClick={() => setCreateTaskModalOpen(true)} variant="secondary" className="mt-3 min-h-9 px-3 py-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    Create task
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {currentUser && !showStaffOperations && !isBossKoo(currentUser) && (
          <section className={cn(cardBase, 'p-4 sm:p-5', prioritizePersonalWork ? 'order-1' : 'order-4')} aria-labelledby="personal-work-title">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="personal-work-title" className="text-lg font-semibold text-slate-950">
                  {currentUser.role === 'Client' ? 'Your review work' : 'My work'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Due work, overdue items, and actions requiring attention.</p>
              </div>
              <Link to="/tasks" className="flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700">
                Go to tasks <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 border-b border-line/70 pb-2 text-sm font-semibold text-ink">
                  Due today <span className="calm-number text-muted">{myTasks.dueToday.length}</span>
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {myTasks.dueToday.map(task => (
                    <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block rounded-control bg-inset/55 p-3 transition-colors hover:bg-inset">
                      <p data-i18n-skip className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                      <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                        <span>{task.id}</span>
                        <span data-i18n-skip className="truncate font-medium">{task.clientName}</span>
                      </div>
                    </Link>
                  ))}
                  {myTasks.dueToday.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No tasks due today.</p>}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="flex items-center gap-2 border-b border-line/70 pb-2 text-sm font-semibold text-ink">
                  Overdue <span className="calm-number text-red-700">{myTasks.overdue.length}</span>
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {myTasks.overdue.map(task => {
                    const dueDate = parseOptionalDate(task.dueDate);
                    const days = dueDate ? Math.max(1, differenceInDays(new Date(), dueDate)) : 0;
                    return (
                      <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block rounded-control bg-red-50/30 p-3 transition-colors hover:bg-red-50/60" title={dueDate ? `Due: ${format(dueDate, 'yyyy-MM-dd')}` : 'No due date'}>
                        <p data-i18n-skip className="truncate text-sm font-semibold text-red-900">{task.title}</p>
                        <div className="mt-1 flex justify-between gap-2 text-xs text-red-700">
                          <span>{days} day{days === 1 ? '' : 's'} overdue</span>
                          <span className="truncate font-medium">{task.clientName}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {myTasks.overdue.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No overdue tasks.</p>}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="flex items-center gap-2 border-b border-line/70 pb-2 text-sm font-semibold text-ink">
                  {currentUser.role === 'Client' ? 'Waiting for your review' : 'Waiting approval'} <span className="calm-number text-amber-700">{myTasks.actionRequired.length}</span>
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {myTasks.actionRequired.map(task => (
                    <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block rounded-control bg-inset/55 p-3 transition-colors hover:bg-inset">
                      <p data-i18n-skip className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                      <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                        <span>{task.status}</span>
                        <span className="truncate font-medium">{task.clientName}</span>
                      </div>
                    </Link>
                  ))}
                  {myTasks.actionRequired.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No reviews pending.</p>}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
      )}
    </div>
  );
};

export default Dashboard;
