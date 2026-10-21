import React from 'react';
import { Download, FileBarChart2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getVisibleProjects, getVisibleTasks, getDashboardPersona } from '../lib/access';
import { getMonthlyOperationalReport } from '../lib/managementIntelligence';
import { createCsvBlob } from '../lib/csv';
import { formatLocalizedDate } from '../lib/i18n';
import { useI18n } from './I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import { cardBase, inputBase } from './uiTokens';
import { cn } from '../lib/utils';

const metricTone: Record<string, string> = {
  neutral: 'text-ink',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
};

const MonthlyOperationalReport: React.FC = () => {
  const { t, locale } = useI18n();
  const today = useLocalToday();
  const {
    currentUser,
    rolePermissions,
    tasks,
    projects,
    clients,
    deliverables,
    clientPlans,
    serviceCycles,
  } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    tasks: state.tasks,
    projects: state.projects,
    clients: state.clients,
    deliverables: state.deliverables,
    clientPlans: state.clientPlans,
    serviceCycles: state.serviceCycles,
  })));
  const persona = getDashboardPersona(currentUser);
  const [month, setMonth] = React.useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [projectId, setProjectId] = React.useState('all');

  const visibleTasks = React.useMemo(
    () => getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects }),
    [clients, currentUser, projects, rolePermissions, tasks],
  );
  const visibleProjects = React.useMemo(
    () => getVisibleProjects(currentUser, projects, tasks, rolePermissions, { clients, projects }),
    [clients, currentUser, projects, rolePermissions, tasks],
  );
  const report = React.useMemo(() => {
    if (persona === 'client') return null;
    const selectedProjects = projectId === 'all' ? visibleProjects : visibleProjects.filter(project => project.id === projectId);
    const selectedClientIds = new Set(selectedProjects.map(project => project.clientId).filter(Boolean));
    const selectedTasks = projectId === 'all' ? visibleTasks : visibleTasks.filter(task => task.projectId === projectId);
    const selectedDeliverables = projectId === 'all' ? deliverables : deliverables.filter(item => selectedClientIds.has(item.clientId));
    const selectedPlans = projectId === 'all' ? clientPlans : clientPlans.filter(plan => selectedClientIds.has(plan.clientId));
    const selectedCycles = projectId === 'all' ? serviceCycles : serviceCycles.filter(cycle => selectedClientIds.has(cycle.clientId));
    return getMonthlyOperationalReport({
      month: new Date(`${month}-01T12:00:00`),
      projects: selectedProjects,
      tasks: selectedTasks,
      deliverables: selectedDeliverables,
      clientPlans: selectedPlans,
      serviceCycles: selectedCycles,
      now: today,
    });
  }, [clientPlans, deliverables, month, persona, projectId, serviceCycles, today, visibleProjects, visibleTasks]);

  if (persona === 'client' || !report) return null;

  const exportReport = () => {
    const headers = [t('Project'), t('Completed tasks'), t('Outstanding tasks'), t('Delayed milestones'), t('Outstanding issues')];
    const rows = report.projectRows.map(row => [row.project.projectName, row.completedTasks, row.outstandingTasks, row.delayedMilestones, row.overdueItems]);
    const url = URL.createObjectURL(createCsvBlob([
      [t('Monthly operational report'), month],
      headers,
      ...rows,
    ]));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aitask-monthly-operational-report-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    { label: t('Active projects'), value: report.activeProjects, tone: 'neutral' },
    { label: t('Completed tasks'), value: report.completedTasks, tone: 'success' },
    { label: t('Outstanding tasks'), value: report.outstandingTasks, tone: 'warning' },
    { label: t('Completed deliverables'), value: report.completedDeliverables, tone: 'success' },
    { label: t('Total deliverables'), value: report.totalDeliverables, tone: 'neutral' },
    { label: t('Pending approvals'), value: report.pendingApprovals, tone: 'warning' },
    { label: t('Monthly renewals'), value: report.renewals, tone: 'neutral' },
    { label: t('Delayed milestones'), value: report.delayedMilestones, tone: 'danger' },
  ];

  return (
    <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="monthly-operational-report-title">
      <div className="flex flex-col gap-4 border-b border-line/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-control bg-accent-soft p-2 text-accent"><FileBarChart2 className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="monthly-operational-report-title" className="text-base font-semibold text-ink">{t('Monthly operational report')}</h2>
            <p className="mt-1 text-sm text-muted">{formatLocalizedDate(report.monthStart, locale)} – {formatLocalizedDate(report.monthEnd, locale)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted"><span className="mb-1 block">{t('Reporting month')}</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} className={cn(inputBase, 'min-h-10 w-auto px-3')} /></label>
          <label className="text-xs font-medium text-muted"><span className="mb-1 block">{t('Project')}</span><select value={projectId} onChange={event => setProjectId(event.target.value)} className={cn(inputBase, 'min-h-10 w-auto px-3')}><option value="all">{t('All projects')}</option>{visibleProjects.map(project => <option key={project.id} value={project.id}>{project.projectName}</option>)}</select></label>
          <button type="button" onClick={exportReport} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><Download className="h-4 w-4" aria-hidden="true" />{t('Export monthly CSV')}</button>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {metrics.map(metric => <div key={metric.label} className="rounded-control border border-line/70 bg-inset/40 p-3"><p className={cn('calm-number text-2xl font-semibold', metricTone[metric.tone])}>{metric.value}</p><p className="mt-1 text-xs font-medium text-muted">{metric.label}</p></div>)}
      </div>
      <div className="border-t border-line/70 px-5 py-4">
        <h3 className="font-semibold text-ink">{t('Project-level monthly detail')}</h3>
        {report.projectRows.length === 0 ? <p className="mt-4 text-sm text-muted">{t('No monthly activity in this period.')}</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-muted"><tr><th scope="col" className="px-3 py-2 font-semibold">{t('Project')}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t('Completed tasks')}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t('Outstanding tasks')}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t('Delayed milestones')}</th><th scope="col" className="px-3 py-2 text-right font-semibold">{t('Outstanding issues')}</th></tr></thead><tbody className="divide-y divide-line/60">{report.projectRows.map(row => <tr key={row.project.id}><th scope="row" className="px-3 py-3 font-medium text-ink">{row.project.projectName}</th><td className="px-3 py-3 text-right">{row.completedTasks}</td><td className="px-3 py-3 text-right">{row.outstandingTasks}</td><td className="px-3 py-3 text-right">{row.delayedMilestones}</td><td className="px-3 py-3 text-right">{row.overdueItems}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  );
};

export default MonthlyOperationalReport;
