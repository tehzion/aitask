import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { AlertCircle, CheckCircle2, Clock, Download, Users } from 'lucide-react';
import { useStore } from '../store';
import { Button, ChartCard, ChartEmptyState, MetricCard, PageHeader } from '../components/ui';
import { useI18n } from '../components/I18nProvider';
import { cardBase, pageShell } from '../components/uiTokens';
import { getVisibleTasks } from '../lib/access';
import { getDueWorkDepartmentPerformance, getDueWorkPerformance, type DueWorkOutcome } from '../lib/taskReporting';
import { formatLocalizedDate } from '../lib/i18n';
import { themeTokenColor } from '../lib/utils';
import { useColorTheme } from '../hooks/useColorTheme';

const Reports: React.FC = () => {
  const { tasks: allTasks, currentUser, rolePermissions, clients, projects } = useStore();
  const { locale, t } = useI18n();
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
      surface: themeTokenColor('--calm-surface', '#ffffff'),
      ink: themeTokenColor('--calm-ink', '#1a1a1a'),
      onTime: themeTokenColor('--calm-success', '#10b981'),
      late: themeTokenColor('--calm-danger', '#ef4444'),
      upcoming: themeTokenColor('--calm-accent', '#c11c15'),
      open: themeTokenColor('--calm-warning', '#f59e0b'),
      overdue: themeTokenColor('--calm-danger', '#ef4444'),
    };
  }, [resolvedTheme]);
  const isClientUser = currentUser?.role === 'Client';
  const performance = useMemo(() => getDueWorkPerformance(tasks), [tasks]);
  const dueTasks = performance.flatMap(week => week.tasks);

  const formatWeekLabel = (week: { start: Date; end: Date; isCurrent: boolean }) => {
    const range = `${formatLocalizedDate(week.start, locale)} – ${formatLocalizedDate(week.end, locale)}`;
    return week.isCurrent ? `${range} (${t('In progress')})` : range;
  };

  const trendData = performance.map(week => ({
    name: formatWeekLabel(week),
    onTime: week.onTime,
    late: week.late,
    upcoming: week.upcoming,
    open: week.open,
    overdue: week.overdue,
  }));

  const overview = useMemo(() => {
    const onTime = performance.reduce((total, week) => total + week.onTime, 0);
    const late = performance.reduce((total, week) => total + week.late, 0);
    const upcoming = performance.reduce((total, week) => total + week.upcoming, 0);
    const open = performance.reduce((total, week) => total + week.open, 0);
    const overdue = performance.reduce((total, week) => total + week.overdue, 0);
    const untracked = performance.reduce((total, week) => total + week.untracked, 0);
    const tracked = onTime + late;
    return {
      due: dueTasks.length,
      onTime,
      late,
      upcoming,
      open,
      overdue,
      untracked,
      tracked,
      completionRate: tracked ? Math.round((onTime / tracked) * 100) : 0,
      assigneesInPeriod: new Set(dueTasks.map(task => task.assignedTo).filter(Boolean)).size,
    };
  }, [dueTasks, performance]);

  // Department totals derive from the same cohort outcomes so they always reconcile.
  const departmentStats = useMemo(() => getDueWorkDepartmentPerformance(performance), [performance]);
  const firstWeek = performance[0];
  const lastWeek = performance[performance.length - 1];
  const reportRangeLabel = firstWeek && lastWeek
    ? `${formatLocalizedDate(firstWeek.start, locale)} – ${formatLocalizedDate(lastWeek.end, locale)}`
    : t('No report period');
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const exportReport = () => {
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const outcomeLabels: Record<DueWorkOutcome, string> = {
      onTime: t('On time'),
      late: t('Late'),
      upcoming: t('Upcoming'),
      open: t('Open today'),
      overdue: t('Overdue'),
      untracked: t('Untracked'),
    };
    const headers = [t('Week'), t('Task'), t('Client'), t('Assignee'), t('Department'), t('Outcome')];
    const rows = performance.flatMap(week => week.outcomes.map(({ task, outcome }) => [
      formatWeekLabel(week),
      task.title,
      task.clientName,
      task.assignedTo || '',
      task.department || t('Unassigned'),
      outcomeLabels[outcome],
    ]));
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'aitask-due-work-report.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tooltipStyle = {
    borderRadius: '8px',
    border: `1px solid ${chartColors.grid}`,
    backgroundColor: chartColors.surface,
    color: chartColors.ink,
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title={t('Four-Week Performance Report')}
        description={t(isClientUser
          ? 'Review delivery timing across the latest four Monday-to-Saturday weeks.'
          : 'Review due work across the latest four Monday-to-Saturday weeks.')}
        meta={(
          <>
            <span>{t('Scope')}: {t(isClientUser ? 'Client workspace' : 'Internal workspace')}</span>
            <span aria-hidden="true">•</span>
            <span>{reportRangeLabel}</span>
            <span aria-hidden="true">•</span>
            <span>{t('Local time')}: {timezone}</span>
          </>
        )}
        action={(
          <Button variant="secondary" onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('Export CSV')}
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard title={t('Due tasks')} value={overview.due} icon={Clock} tone="indigo" />
        <MetricCard title={t('On time')} value={overview.onTime} icon={CheckCircle2} tone="emerald" />
        <MetricCard title={t('Late')} value={overview.late} icon={AlertCircle} tone="red" />
        <MetricCard title={t('Overdue')} value={overview.overdue} icon={AlertCircle} tone="red" />
        <MetricCard title={t('Upcoming')} value={overview.upcoming} icon={Clock} tone="indigo" />
        <MetricCard title={t('Open today')} value={overview.open} icon={Clock} tone="amber" />
        <MetricCard title={t('Tracked completion rate')} value={`${overview.completionRate}%`} icon={CheckCircle2} tone="emerald" footer={`${overview.tracked} ${t('Tracked').toLowerCase()}`} />
        {!isClientUser && <MetricCard title={t('Assignees in period')} value={overview.assigneesInPeriod} icon={Users} tone="indigo" />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <ChartCard
            title={t('Due work by week')}
            description={t('Each week contains tasks due in that Monday-to-Saturday window. Completion rate uses only completed tasks with a recorded completion time.')}
          >
            {!dueTasks.length ? (
              <ChartEmptyState>{t('No tracked weekly activity yet')}</ChartEmptyState>
            ) : (
              <div aria-hidden="true" className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 288 }}>
                  <LineChart accessibilityLayer={false} data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.cursor }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="onTime" name={t('On time')} stroke={chartColors.onTime} strokeWidth={3} activeDot={{ r: 8 }} />
                    <Line type="monotone" dataKey="late" name={t('Late')} stroke={chartColors.late} strokeWidth={3} strokeDasharray="6 3" />
                    <Line type="monotone" dataKey="upcoming" name={t('Upcoming')} stroke={chartColors.upcoming} strokeWidth={2} />
                    <Line type="monotone" dataKey="open" name={t('Open today')} stroke={chartColors.open} strokeWidth={2} />
                    <Line type="monotone" dataKey="overdue" name={t('Overdue')} stroke={chartColors.overdue} strokeWidth={3} strokeDasharray="2 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {dueTasks.length > 0 && (
            <details className="rounded-control border border-line bg-surface px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                {t('View weekly data table')}
              </summary>
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={t('Weekly due-work data')}>
                <table className="min-w-[680px] w-full text-left text-sm">
                  <caption className="sr-only">{t('Weekly due-work data')}</caption>
                  <thead className="text-xs tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">{t('Week')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('On time')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Late')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Upcoming')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Open today')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Overdue')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Untracked')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Tracked completion rate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {performance.map(week => (
                      <tr key={week.label}>
                        <th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-ink">{formatWeekLabel(week)}</th>
                        <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-300">{week.onTime}</td>
                        <td className="px-3 py-3 text-right text-red-700 dark:text-red-300">{week.late}</td>
                        <td className="px-3 py-3 text-right text-accent">{week.upcoming}</td>
                        <td className="px-3 py-3 text-right text-amber-700 dark:text-amber-300">{week.open}</td>
                        <td className="px-3 py-3 text-right text-red-700 dark:text-red-300">{week.overdue}</td>
                        <td className="px-3 py-3 text-right text-muted">{week.untracked}</td>
                        <td className="px-3 py-3 text-right font-semibold text-ink">{week.completionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>

        {!isClientUser && (
          <div className="min-w-0 space-y-3">
            <ChartCard title={t('Department Productivity Overview')}>
              {departmentStats.length === 0 ? (
                <ChartEmptyState>{t('No department data yet')}</ChartEmptyState>
              ) : (
                <div aria-hidden="true" className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 640, height: 288 }}>
                    <BarChart accessibilityLayer={false} data={departmentStats} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartColors.grid} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick }} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} width={100} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.cursor }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="onTime" name={t('On time')} stackId="a" fill={chartColors.onTime} />
                      <Bar dataKey="late" name={t('Late')} stackId="a" fill={chartColors.late} />
                      <Bar dataKey="upcoming" name={t('Upcoming')} stackId="a" fill={chartColors.upcoming} />
                      <Bar dataKey="open" name={t('Open today')} stackId="a" fill={chartColors.open} />
                      <Bar dataKey="overdue" name={t('Overdue')} stackId="a" fill={chartColors.overdue} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            {departmentStats.length > 0 && (
              <details className="rounded-control border border-line bg-surface px-4 py-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                  {t('View department data table')}
                </summary>
                <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={t('Department performance data')}>
                  <table className="min-w-[680px] w-full text-left text-sm">
                    <caption className="sr-only">{t('Department performance data')}</caption>
                  <thead className="text-xs tracking-wide text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">{t('Department')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Total Tasks')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('On time')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Late')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Upcoming')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Open today')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Overdue')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Tracked completion rate')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70">
                      {departmentStats.map(dept => (
                        <tr key={dept.name}>
                          <th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-ink">{dept.name}</th>
                          <td className="px-3 py-3 text-right text-ink">{dept.total}</td>
                          <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-300">{dept.onTime}</td>
                          <td className="px-3 py-3 text-right text-red-700 dark:text-red-300">{dept.late}</td>
                          <td className="px-3 py-3 text-right text-accent">{dept.upcoming}</td>
                          <td className="px-3 py-3 text-right text-amber-700 dark:text-amber-300">{dept.open}</td>
                          <td className="px-3 py-3 text-right text-red-700 dark:text-red-300">{dept.overdue}</td>
                          <td className="px-3 py-3 text-right font-semibold text-ink">{dept.completionRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {!isClientUser && (
        <div className={`${cardBase} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-line/70 bg-inset/50 px-6 py-5">
            <div>
              <h3 className="text-lg font-semibold text-ink">{t('Department Performance Details')}</h3>
              <p className="mt-1 text-sm text-muted">{t('Detailed breakdown for the selected report scope.')}</p>
            </div>
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-inset text-xs tracking-wide text-muted">
                  <th scope="col" className="border-b border-line px-6 py-4 font-semibold">{t('Department')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('Total Tasks')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('On time')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('Late')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('Upcoming')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('Open today')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('Overdue')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-center font-semibold">{t('Untracked')}</th>
                  <th scope="col" className="border-b border-line px-6 py-4 text-right font-semibold">{t('Tracked completion rate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {departmentStats.map(dept => (
                  <tr key={dept.name} className="transition-colors hover:bg-inset">
                    <th scope="row" className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                        <span className="text-sm font-semibold text-ink">{dept.name}</span>
                      </div>
                    </th>
                    <td className="px-6 py-4 text-center font-medium text-ink">{dept.total}</td>
                    <td className="px-6 py-4 text-center font-medium text-emerald-700 dark:text-emerald-300">{dept.onTime}</td>
                    <td className="px-6 py-4 text-center font-medium text-red-700 dark:text-red-300">{dept.late}</td>
                    <td className="px-6 py-4 text-center font-medium text-accent">{dept.upcoming}</td>
                    <td className="px-6 py-4 text-center font-medium text-amber-700 dark:text-amber-300">{dept.open}</td>
                    <td className="px-6 py-4 text-center font-medium text-red-700 dark:text-red-300">{dept.overdue}</td>
                    <td className="px-6 py-4 text-center font-medium text-muted">{dept.untracked}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <div className="h-2 w-full max-w-[100px] rounded-full bg-line/60">
                          <div
                            className={`h-2 rounded-full ${dept.completionRate >= 80 ? 'bg-emerald-500' : dept.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${dept.completionRate}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-sm font-bold text-ink">{dept.completionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 xl:hidden">
            {departmentStats.length === 0 ? (
              <ChartEmptyState>{t('No department data yet')}</ChartEmptyState>
            ) : departmentStats.map(dept => (
              <article key={dept.name} className="rounded-control border border-line bg-inset/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <h4 className="min-w-0 break-words text-sm font-semibold text-ink">{dept.name}</h4>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-ink">{dept.completionRate}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-line/60" aria-label={`${dept.name} ${t('Tracked completion rate')} ${dept.completionRate}%`} role="img">
                  <div
                    className={`h-full rounded-full ${dept.completionRate >= 80 ? 'bg-emerald-500' : dept.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${dept.completionRate}%` }}
                  />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted">{t('Total Tasks')}</dt><dd className="mt-0.5 font-semibold text-ink">{dept.total}</dd></div>
                  <div><dt className="text-xs text-muted">{t('On time')}</dt><dd className="mt-0.5 font-semibold text-emerald-700 dark:text-emerald-300">{dept.onTime}</dd></div>
                  <div><dt className="text-xs text-muted">{t('Late')}</dt><dd className="mt-0.5 font-semibold text-red-700 dark:text-red-300">{dept.late}</dd></div>
                  <div><dt className="text-xs text-muted">{t('Upcoming')}</dt><dd className="mt-0.5 font-semibold text-accent">{dept.upcoming}</dd></div>
                  <div><dt className="text-xs text-muted">{t('Open today')}</dt><dd className="mt-0.5 font-semibold text-amber-700 dark:text-amber-300">{dept.open}</dd></div>
                  <div><dt className="text-xs text-muted">{t('Overdue')}</dt><dd className="mt-0.5 font-semibold text-red-700 dark:text-red-300">{dept.overdue}</dd></div>
                  <div><dt className="text-xs text-muted">{t('Untracked')}</dt><dd className="mt-0.5 font-semibold text-muted">{dept.untracked}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
