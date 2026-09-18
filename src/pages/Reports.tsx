import React, { useMemo } from 'react';
import { useStore } from '../store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Users, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { ChartCard, ChartEmptyState, MetricCard, PageHeader } from '../components/ui';
import { cardBase, pageShell } from '../components/uiTokens';
import { getVisibleTasks } from '../lib/access';
import { getDueWorkDepartmentPerformance, getDueWorkPerformance } from '../lib/taskReporting';
import { themeTokenColor } from '../lib/utils';
import { useColorTheme } from '../hooks/useColorTheme';

const Reports: React.FC = () => {
  const { tasks: allTasks, currentUser, rolePermissions, clients, projects } = useStore();
  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients, projects }),
    [allTasks, clients, currentUser, projects, rolePermissions]
  );
  const { resolvedTheme } = useColorTheme();
  const chartColors = useMemo(() => {
    void resolvedTheme;
    return {
      grid: themeTokenColor('--calm-line', '#e2e8f0'),
      tick: themeTokenColor('--calm-muted', '#64748b'),
      cursor: themeTokenColor('--calm-inset', '#f8fafc'),
    };
  }, [resolvedTheme]);
  const scopeLabel = currentUser?.role === 'Client'
    ? `${currentUser.companyName || 'your company'} tasks`
    : 'your accessible workspace tasks';
  const isClientUser = currentUser?.role === 'Client';

  const performance = useMemo(() => getDueWorkPerformance(tasks), [tasks]);
  const trendData = performance.map(week => ({
    name: `${week.label}${week.isCurrent ? ' (in progress)' : ''}`,
    onTime: week.onTime,
    late: week.late,
    open: week.open,
  }));
  const dueTasks = performance.flatMap(week => week.tasks);
  const overview = useMemo(() => {
    const onTime = performance.reduce((total, week) => total + week.onTime, 0);
    const late = performance.reduce((total, week) => total + week.late, 0);
    const open = performance.reduce((total, week) => total + week.open, 0);
    const untracked = performance.reduce((total, week) => total + week.untracked, 0);
    return {
      due: dueTasks.length,
      onTime,
      late,
      open,
      untracked,
      completionRate: dueTasks.length ? Math.round((onTime / dueTasks.length) * 100) : 0,
      activeUsers: new Set(dueTasks.map(task => task.assignedTo).filter(Boolean)).size,
    };
  }, [dueTasks, performance]);

  // Department totals derive from the same cohort outcomes so they always reconcile.
  const departmentStats = useMemo(() => getDueWorkDepartmentPerformance(performance), [performance]);

  return (
    <div className={pageShell}>
      <PageHeader
        title="Four-Week Performance Report"
        description={`Analyze ${scopeLabel} across the latest four Monday-to-Saturday weeks.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard title="Due tasks" value={overview.due} icon={Clock} tone="indigo" />
        <MetricCard title="On time" value={overview.onTime} icon={CheckCircle2} tone="emerald" />
        <MetricCard title="Late" value={overview.late} icon={AlertCircle} tone="red" />
        <MetricCard title="Open" value={overview.open} icon={Clock} tone="amber" />
        <MetricCard title="On-time rate" value={`${overview.completionRate}%`} icon={CheckCircle2} tone="emerald" />
        {!isClientUser && <MetricCard title="Active Assignees" value={overview.activeUsers} icon={Users} tone="indigo" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Due-Work Performance"
          description="Each week contains tasks due in that Monday–Saturday window. On-time completion means completed by the end of the due date."
        >
          {!dueTasks.length ? (
            <ChartEmptyState>No tracked weekly activity yet</ChartEmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 288 }}>
              <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} />
                <Tooltip cursor={{ fill: chartColors.cursor }} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Line type="monotone" dataKey="onTime" name="On time" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="late" name="Late" stroke="#ef4444" strokeWidth={3} />
                <Line type="monotone" dataKey="open" name="Open" stroke="#f59e0b" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {!isClientUser && (
        <ChartCard title="Department Productivity Overview">
          {departmentStats.length === 0 ? (
            <ChartEmptyState>No department data yet</ChartEmptyState>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 288 }}>
              <BarChart data={departmentStats} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartColors.grid} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} width={100} />
                <Tooltip cursor={{ fill: chartColors.cursor }} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="onTime" name="On time" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" name="Late" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="open" name="Open" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        )}
      </div>

      {/* Detailed Department Performance Table */}
      {!isClientUser && (
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
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">On time</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Late</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Open</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-center">Untracked</th>
                <th scope="col" className="px-6 py-4 font-semibold border-b border-slate-200 text-right">On-time rate</th>
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
                  <td className="px-6 py-4 text-center text-emerald-600 font-medium">{dept.onTime}</td>
                  <td className="px-6 py-4 text-center text-red-600 font-medium">{dept.late}</td>
                  <td className="px-6 py-4 text-center text-amber-500 font-medium">{dept.open}</td>
                  <td className="px-6 py-4 text-center text-slate-500 font-medium">{dept.untracked}</td>
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
      )}
    </div>
  );
};

export default Reports;
