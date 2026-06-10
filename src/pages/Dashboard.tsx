import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { format, isToday, isThisWeek, isBefore, parseISO, subMonths, isSameMonth } from 'date-fns';
import { CheckCircle2, Clock, AlertCircle, LayoutList, Calendar, CalendarDays, ArrowRight, LucideIcon } from 'lucide-react';
import CreateTaskModal from '../components/CreateTaskModal';
import { Link } from 'react-router-dom';
import { Button, ChartCard, ChartEmptyState, MetricCard, PageHeader, pageShell } from '../components/ui';
import { canCreateTasks, getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import BackendFreshness from '../components/BackendFreshness';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  colorClass: string;
  to: string;
}

const StatCard = ({ title, value, icon: Icon, colorClass, to }: StatCardProps) => (
  <Link to={to} className="block transition hover:-translate-y-0.5 hover:shadow-md rounded-lg">
    <MetricCard
      title={title}
      value={value}
      icon={Icon}
      tone={
        colorClass.includes('emerald') ? 'emerald' :
        colorClass.includes('amber') ? 'amber' :
        colorClass.includes('red') ? 'red' :
        colorClass.includes('blue') ? 'blue' :
        colorClass.includes('purple') ? 'purple' :
        'indigo'
      }
    />
  </Link>
);

const Dashboard: React.FC = () => {
  const { projects, tasks: allTasks, currentUser, rolePermissions } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const tasks = useMemo(() => getVisibleTasks(currentUser, allTasks), [allTasks, currentUser]);
  const visibleProjects = useMemo(() => getVisibleProjects(currentUser, projects), [currentUser, projects]);
  const canCreateTask = canCreateTasks(currentUser, rolePermissions);

  const stats = useMemo(() => {
    const today = new Date();
    
    const activeProjects = visibleProjects.length;
      
    const pendingTasks = tasks.filter(t => !t.isCompleted).length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    
    const overdueTasks = tasks.filter(t => 
      !t.isCompleted && isBefore(parseISO(t.dueDate), today) && !isToday(parseISO(t.dueDate))
    ).length;
    
    const dueTodayTasks = tasks.filter(t => 
      !t.isCompleted && isToday(parseISO(t.dueDate))
    ).length;
    
    const dueThisWeekTasks = tasks.filter(t => 
      !t.isCompleted && isThisWeek(parseISO(t.dueDate))
    ).length;

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
        completed: tasks.filter(task => task.isCompleted && isSameMonth(parseISO(task.dueDate), month)).length,
      };
    });
  }, [tasks]);

  // Get top 5 recent tasks
  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, 5);

  return (
    <div className={pageShell}>
      <PageHeader
        title={isBossKoo(currentUser) ? 'Super Admin Dashboard' : currentUser?.role === 'Admin' ? 'Admin Dashboard' : currentUser?.role === 'Client' ? 'Client Dashboard' : 'My Dashboard'}
        description={`Welcome back, ${currentUser?.name}! Here's your task overview.`}
        action={(
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <BackendFreshness />
            {canCreateTask && (
              <Button onClick={() => setIsModalOpen(true)}>
                + Create New Task
              </Button>
            )}
          </div>
        )}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Active Projects" value={stats.activeProjects} icon={LayoutList} colorClass="text-indigo-600" to="/projects" />
        <StatCard title="Pending Tasks" value={stats.pendingTasks} icon={Clock} colorClass="text-amber-500" to="/tasks" />
        <StatCard title="Completed Tasks" value={stats.completedTasks} icon={CheckCircle2} colorClass="text-emerald-500" to="/tasks" />
        <StatCard title="Overdue Tasks" value={stats.overdueTasks} icon={AlertCircle} colorClass="text-red-500" to="/tasks" />
        <StatCard title="Due Today" value={stats.dueTodayTasks} icon={Calendar} colorClass="text-blue-500" to="/calendar" />
        <StatCard title="Due This Week" value={stats.dueThisWeekTasks} icon={CalendarDays} colorClass="text-purple-500" to="/calendar" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Tasks by Department">
          {tasksByTeamData.length === 0 ? (
            <ChartEmptyState>No task data yet</ChartEmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksByTeamData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Tasks by Status">
          {tasksByStatusData.length === 0 ? (
            <ChartEmptyState>No status data yet</ChartEmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tasksByStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {tasksByStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 2 & Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Monthly Completed Tasks" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
        </ChartCard>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-slate-900">Recent Tasks</h3>
            <Link to="/tasks" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {recentTasks.map(task => (
              <div key={task.id} className="p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-slate-800 text-sm truncate pr-2">{task.title}</span>
                </div>
                <div className="text-xs text-slate-500 flex justify-between items-center mt-2">
                  <span className="font-medium text-indigo-600">{task.clientName}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                    task.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                    task.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                    task.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {task.status}
                  </span>
                </div>
              </div>
            ))}
            {recentTasks.length === 0 && (
              <div className="text-center text-slate-400 py-8 text-sm">
                No recent tasks found.
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

export default Dashboard;
