import React, { useMemo } from 'react';
import { useStore } from '../store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Department } from '../types';
import { Users, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { endOfWeek, format, isWithinInterval, parseISO, startOfWeek, subWeeks } from 'date-fns';
import { ChartCard, ChartEmptyState, MetricCard, PageHeader } from '../components/ui';
import { cardBase, pageShell } from '../components/uiTokens';
import { getVisibleTasks } from '../lib/access';

const Reports: React.FC = () => {
  const { tasks: allTasks, currentUser } = useStore();
  const tasks = useMemo(() => getVisibleTasks(currentUser, allTasks), [allTasks, currentUser]);
  const scopeLabel = currentUser?.role === 'Client'
    ? `${currentUser.companyName || 'your company'} tasks`
    : 'your accessible workspace tasks';

  const trendData = useMemo(() => {
    const currentWeek = startOfWeek(new Date());
    return [3, 2, 1, 0].map(offset => {
      const weekStart = subWeeks(currentWeek, offset);
      const weekEnd = endOfWeek(weekStart);
      const weekTasks = tasks.filter(task => {
        const dueDate = parseISO(task.dueDate);
        return isWithinInterval(dueDate, { start: weekStart, end: weekEnd });
      });

      return {
        name: format(weekStart, 'MMM d'),
        completed: weekTasks.filter(task => task.isCompleted).length,
        pending: weekTasks.filter(task => !task.isCompleted).length,
      };
    });
  }, [tasks]);

  const overview = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const completed = tasks.filter(task => task.isCompleted).length;
    const pending = tasks.filter(task => !task.isCompleted).length;
    const overdue = tasks.filter(task => !task.isCompleted && task.dueDate < today).length;
    const activeUsers = new Set(tasks.map(task => task.assignedTo)).size;

    return { completed, pending, overdue, activeUsers };
  }, [tasks]);

  // Dynamic calculation of department performance
  const departmentStats = useMemo(() => {
    const stats: Record<string, { total: number; completed: number; pending: number; overdue: number; name: string }> = {};
    
    // Initialize stats for each department
    const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor'];
    DEPARTMENTS.forEach(dept => {
      stats[dept] = { name: dept, total: 0, completed: 0, pending: 0, overdue: 0 };
    });

    const today = new Date().toISOString().split('T')[0];

    tasks.forEach(task => {
      const dept = task.department;
      if (stats[dept]) {
        stats[dept].total += 1;
        if (task.isCompleted) {
          stats[dept].completed += 1;
        } else {
          stats[dept].pending += 1;
          if (task.dueDate < today) {
            stats[dept].overdue += 1;
          }
        }
      }
    });

    return Object.values(stats)
      .filter(dept => dept.total > 0)
      .map(dept => ({
        ...dept,
        completionRate: dept.total > 0 ? Math.round((dept.completed / dept.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total); // Sort by total tasks descending
  }, [tasks]);

  return (
    <div className={pageShell}>
      <PageHeader
        title="Four-Week Performance Report"
        description={`Analyze ${scopeLabel} across the latest four due-date weeks.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Completed" value={overview.completed} icon={CheckCircle2} tone="emerald" />
        <MetricCard title="Pending" value={overview.pending} icon={Clock} tone="amber" />
        <MetricCard title="Overdue" value={overview.overdue} icon={AlertCircle} tone="red" />
        <MetricCard title="Active Assignees" value={overview.activeUsers} icon={Users} tone="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Task Completion Trend">
          {tasks.length === 0 ? (
            <ChartEmptyState>No task data yet</ChartEmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Department Productivity Overview">
          {departmentStats.length === 0 ? (
            <ChartEmptyState>No department data yet</ChartEmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentStats} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="completed" name="Completed Tasks" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" name="Pending Tasks" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Detailed Department Performance Table */}
      <div className={`${cardBase} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Department Performance Details</h3>
            <p className="text-sm text-slate-500 mt-1">Detailed breakdown for {scopeLabel}.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200">Department</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Total Tasks</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Completed</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Pending</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Overdue</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-right">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departmentStats.map((dept) => (
                <tr key={dept.name} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="font-semibold text-slate-800 text-sm">{dept.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center font-medium text-slate-700">{dept.total}</td>
                  <td className="px-6 py-4 text-center text-emerald-600 font-medium">{dept.completed}</td>
                  <td className="px-6 py-4 text-center text-amber-500 font-medium">{dept.pending}</td>
                  <td className="px-6 py-4 text-center">
                    {dept.overdue > 0 ? (
                      <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        {dept.overdue}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-3">
                      <div className="w-full max-w-[100px] bg-slate-100 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            dept.completionRate >= 80 ? 'bg-emerald-500' : 
                            dept.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`} 
                          style={{ width: `${dept.completionRate}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold text-slate-700 w-10 text-right">{dept.completionRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
