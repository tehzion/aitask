import React, { useMemo } from 'react';
import { useStore } from '../store';
import { SkeletonMetricCard, SkeletonChartCard } from '../components/SkeletonCard';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { format, isToday, isThisWeek, isBefore, subMonths, isSameMonth, differenceInDays } from 'date-fns';
import { CheckCircle2, Clock, AlertCircle, LayoutList, Calendar, CalendarDays, ArrowRight, LucideIcon, Plus, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, ChartCard, ChartEmptyState, MetricCard, PageHeader } from '../components/ui';
import { cardBase, pageShell } from '../components/uiTokens';
import { canCreateTasks, getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import BackendFreshness from '../components/BackendFreshness';
import { cn, getRelativeDueDateString, parseOptionalDate } from '../lib/utils';

const COLORS = ['#2563eb', '#0f766e', '#f59e0b', '#dc2626', '#7c3aed', '#db2777'];

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone: 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
  to: string;
}

const StatCard = ({ title, value, icon: Icon, tone, to }: StatCardProps) => (
  <Link to={to} className="block rounded-lg transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200">
    <MetricCard title={title} value={value} icon={Icon} tone={tone} />
  </Link>
);

const Dashboard: React.FC = () => {
  const { projects, tasks: allTasks, currentUser, rolePermissions, backend, setCreateTaskModalOpen } = useStore();

  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions),
    [allTasks, currentUser, rolePermissions]
  );
  const visibleProjects = useMemo(
    () => getVisibleProjects(currentUser, projects, allTasks, rolePermissions),
    [allTasks, currentUser, projects, rolePermissions]
  );
  const canCreateTask = canCreateTasks(currentUser, rolePermissions);
  const hasTaskData = tasks.length > 0;
  const prioritizePersonalWork = currentUser?.role === 'Staff' || currentUser?.role === 'Client';

  const stats = useMemo(() => {
    const today = new Date();
    
    const activeProjects = visibleProjects.length;
      
    const pendingTasks = tasks.filter(t => !t.isCompleted).length;
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

  const monthlyData = useMemo(() => {
    const currentMonth = new Date();
    return [5, 4, 3, 2, 1, 0].map(offset => {
      const month = subMonths(currentMonth, offset);
      return {
        name: format(month, 'MMM'),
        completed: tasks.filter(task => {
          const dueDate = parseOptionalDate(task.dueDate);
          return Boolean(dueDate && task.isCompleted && isSameMonth(dueDate, month));
        }).length,
      };
    });
  }, [tasks]);

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
      if (t.isCompleted || t.status === 'Cancelled') return false;
      if (currentUser.role === 'Client') {
        return t.clientName === currentUser.companyName && t.status === 'Waiting Approval';
      } else {
        return t.assignedTo === currentUser.id && t.status === 'Waiting Approval';
      }
    });

    return { dueToday, overdue, actionRequired };
  }, [tasks, currentUser]);

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
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm animate-pulse space-y-4">
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
        title={isBossKoo(currentUser) ? 'Super Admin Dashboard' : currentUser?.role === 'Admin' ? 'Admin Dashboard' : currentUser?.role === 'Client' ? 'Client Dashboard' : 'My Dashboard'}
        description={hasTaskData ? `Welcome back, ${currentUser?.name}! Here's your task overview.` : `Welcome back, ${currentUser?.name}! Your live workspace is ready.`}
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

      {!hasTaskData && (
        <section className={cn(cardBase, 'overflow-hidden border-blue-100 bg-blue-50/35')}>
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <FolderKanban className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-950">
                  {currentUser?.role === 'Client' ? 'No visible client tasks yet' : 'Start the live workspace'}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  {currentUser?.role === 'Client'
                    ? 'Tasks for your company will appear here as soon as the team publishes or assigns them.'
                    : 'Demo tasks are cleared. Create the first real task so dashboards, calendars, notifications, and reports begin filling with live data.'}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              {canCreateTask && (
                <Button onClick={() => setCreateTaskModalOpen(true)} className="shrink-0">
                  <Plus className="h-4 w-4" />
                  Create first task
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

      <div className="flex flex-col gap-6">
        <section className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6', prioritizePersonalWork ? 'order-2' : 'order-1')} aria-label="Workspace metrics">
          <StatCard title="Active Companies" value={stats.activeProjects} icon={LayoutList} tone="blue" to="/projects" />
          <StatCard title="Pending Tasks" value={stats.pendingTasks} icon={Clock} tone="amber" to="/tasks" />
          <StatCard title="Completed Tasks" value={stats.completedTasks} icon={CheckCircle2} tone="emerald" to="/tasks" />
          <StatCard title="Overdue Tasks" value={stats.overdueTasks} icon={AlertCircle} tone="red" to="/tasks" />
          <StatCard title="Due Today" value={stats.dueTodayTasks} icon={Calendar} tone="blue" to="/calendar" />
          <StatCard title="Due This Week" value={stats.dueThisWeekTasks} icon={CalendarDays} tone="slate" to="/calendar" />
        </section>

        <section className={cn('space-y-6', prioritizePersonalWork ? 'order-4' : 'order-2')} aria-labelledby="workspace-analytics-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="workspace-analytics-title" className="text-lg font-semibold text-slate-950">Workspace analytics</h2>
              <p className="mt-1 text-sm text-slate-500">Current workload distribution and completion trend.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Tasks by Department">
              {tasksByTeamData.length === 0 ? (
                <ChartEmptyState>No task data yet</ChartEmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 256 }}>
                  <BarChart data={tasksByTeamData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }} />
                    <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={36} />
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
                        <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Monthly Completed Tasks">
            {hasTaskData ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 960, height: 256 }}>
                <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }} />
                  <Line type="monotone" dataKey="completed" stroke="#2563eb" strokeWidth={2.5} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState>No completed task history yet</ChartEmptyState>
            )}
          </ChartCard>
        </section>

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
                <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50">
                  <p className={cn('truncate text-sm font-semibold text-slate-900', isOverdue && 'text-red-700')}>{task.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{task.clientName} - {task.projectName || 'Independent'}</p>
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

        {currentUser && (
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
                <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Due today <span className="text-slate-400">{myTasks.dueToday.length}</span>
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {myTasks.dueToday.map(task => (
                    <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block rounded-lg border border-slate-200 bg-slate-50/40 p-3 transition-colors hover:bg-slate-50">
                      <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                      <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                        <span>{task.id}</span>
                        <span className="truncate font-medium">{task.clientName}</span>
                      </div>
                    </Link>
                  ))}
                  {myTasks.dueToday.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No tasks due today.</p>}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Overdue <span className="text-slate-400">{myTasks.overdue.length}</span>
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {myTasks.overdue.map(task => {
                    const dueDate = parseOptionalDate(task.dueDate);
                    const days = dueDate ? Math.max(1, differenceInDays(new Date(), dueDate)) : 0;
                    return (
                      <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block rounded-lg border border-red-100 bg-red-50/30 p-3 transition-colors hover:bg-red-50/60" title={dueDate ? `Due: ${format(dueDate, 'yyyy-MM-dd')}` : 'No due date'}>
                        <p className="truncate text-sm font-semibold text-red-900">{task.title}</p>
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
                <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {currentUser.role === 'Client' ? 'Waiting for your review' : 'Waiting approval'} <span className="text-slate-400">{myTasks.actionRequired.length}</span>
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {myTasks.actionRequired.map(task => (
                    <Link key={task.id} to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="block rounded-lg border border-slate-200 bg-slate-50/40 p-3 transition-colors hover:bg-slate-50">
                      <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
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
    </div>
  );
};

export default Dashboard;
