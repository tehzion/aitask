import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileWarning,
  FolderKanban,
  RefreshCw,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import { getManagementSnapshot, getSharedEmployeeWorkload } from '../lib/managementIntelligence';
import { formatLocalizedDate } from '../lib/i18n';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import { cardBase } from './uiTokens';

type MetricTone = 'neutral' | 'success' | 'warning' | 'danger';

const toneClasses: Record<MetricTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

const Metric = ({
  label,
  value,
  to,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: MetricTone;
}) => (
  <Link
    to={to}
    className="group min-h-28 rounded-panel border border-line/80 bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
  >
    <div className="flex items-start justify-between gap-3">
      <span className={cn('inline-flex rounded-control p-2', toneClasses[tone])}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </div>
    <p className="calm-number mt-4 text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</p>
    <p className="mt-1 text-xs font-medium text-muted">{label}</p>
  </Link>
);

const ManagementOverview: React.FC = () => {
  const { t, locale } = useI18n();
  const now = useLocalToday();
  const {
    currentUser,
    rolePermissions,
    tasks,
    projects,
    clients,
    deliverables,
    clientPlans,
    serviceCycles,
    users,
  } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    tasks: state.tasks,
    projects: state.projects,
    clients: state.clients,
    deliverables: state.deliverables,
    clientPlans: state.clientPlans,
    serviceCycles: state.serviceCycles,
    users: state.users,
  })));

  const snapshot = React.useMemo(() => {
    if (!isBossKoo(currentUser)) return null;
    const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects });
    const visibleProjects = getVisibleProjects(currentUser, projects, tasks, rolePermissions, { clients, projects });
    return getManagementSnapshot({
      projects: visibleProjects,
      tasks: visibleTasks,
      deliverables,
      clientPlans,
      serviceCycles,
      users,
      now,
    });
  }, [clientPlans, clients, currentUser, deliverables, now, projects, rolePermissions, serviceCycles, tasks, users]);

  const workload = React.useMemo(() => {
    if (!isBossKoo(currentUser)) return [];
    const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects });
    return getSharedEmployeeWorkload(visibleTasks, users, now).sort((left, right) => right.open - left.open || right.dueSoon - left.dueSoon).slice(0, 8);
  }, [clients, currentUser, now, projects, rolePermissions, tasks, users]);

  if (!snapshot) return null;

  const healthRows = snapshot.projectRows
    .filter(row => row.health.health !== 'onTrack')
    .sort((left, right) => right.health.overdueCount - left.health.overdueCount)
    .slice(0, 6);

  return (
    <section className="space-y-4" aria-labelledby="management-overview-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="management-overview-title" className="text-lg font-semibold text-ink">{t('Management overview')}</h2>
          <p className="mt-1 text-sm text-muted">{t('Company-wide operational snapshot.')}</p>
        </div>
        <Link to="/reports" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline">
          {t('Open monthly report')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label={t('Active projects')} value={snapshot.activeProjects} to="/projects" icon={FolderKanban} />
        <Metric label={t('Completed projects')} value={snapshot.completedProjects} to="/projects" icon={CheckCircle2} tone="success" />
        <Metric label={t('At-risk projects')} value={snapshot.atRiskProjects} to="/projects?health=atRisk" icon={AlertTriangle} tone="danger" />
        <Metric label={t('Overdue tasks')} value={snapshot.overdueTasks} to="/tasks?focus=overdue" icon={Clock3} tone="danger" />
        <Metric label={t('Pending approvals')} value={snapshot.pendingApprovals} to="/tasks?focus=waiting" icon={ClipboardCheck} tone="warning" />
        <Metric label={t('Active monthly plans')} value={snapshot.activeMonthlyPlans} to="/clients" icon={RefreshCw} />
        <Metric label={t('Renewals in 30 days')} value={snapshot.upcomingRenewals} to="/clients" icon={RefreshCw} tone="warning" />
        <Metric label={t('Overdue deliverables')} value={snapshot.overdueDeliverables} to="/clients" icon={FileWarning} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="management-health-title">
          <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
            <div>
              <h3 id="management-health-title" className="font-semibold text-ink">{t('Projects needing attention')}</h3>
              <p className="mt-1 text-sm text-muted">{t('Open the relevant work instead of scanning every project.')}</p>
            </div>
            <span className="calm-number text-sm font-semibold text-muted">{snapshot.atRiskProjects + snapshot.projectRows.filter(row => row.health.health === 'attentionRequired').length}</span>
          </div>
          <div className="divide-y divide-line/60">
            {healthRows.map(row => {
              const isRisk = row.health.health === 'atRisk';
              return (
                <Link key={row.project.id} to={`/tasks?projectId=${encodeURIComponent(row.project.id)}`} className="group flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-inset/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35">
                  <div className="min-w-0">
                    <p data-i18n-skip className="truncate text-sm font-semibold text-ink">{row.project.projectName}</p>
                    <p className="mt-1 truncate text-xs text-muted"><span data-i18n-skip>{row.project.clientName}</span> · {row.health.overdueCount} {t('overdue')} · {row.health.pendingApprovalCount} {t('pending reviews')}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-semibold', isRisk ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>{t(isRisk ? 'At risk' : 'Attention required')}</span>
                </Link>
              );
            })}
            {healthRows.length === 0 && <div className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" aria-hidden="true" /><p className="mt-2 text-sm font-semibold text-ink">{t('Everything is on track')}</p><p className="mt-1 text-xs text-muted">{t('No project risks are currently flagged.')}</p></div>}
          </div>
        </section>

        <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="management-pm-title">
          <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
            <div>
              <h3 id="management-pm-title" className="font-semibold text-ink">{t('Project Manager overview')}</h3>
              <p className="mt-1 text-sm text-muted">{t('Operational signals, not performance scores.')}</p>
            </div>
            <UsersRound className="h-5 w-5 text-accent" aria-hidden="true" />
          </div>
          <div className="divide-y divide-line/60">
            {snapshot.projectManagers.slice(0, 6).map(row => (
              <div key={row.member.id} className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-center gap-3 px-5 py-3">
                <div className="min-w-0"><p data-i18n-skip className="truncate text-sm font-semibold text-ink">{row.member.name}</p><p className="mt-1 text-xs text-muted">{row.projects} {t('projects')}</p></div>
                <div className="text-right"><p className={cn('calm-number text-sm font-semibold', row.overdueTasks > 0 ? 'text-red-700' : 'text-ink')}>{row.overdueTasks}</p><p className="text-[11px] text-muted">{t('overdue')}</p></div>
                <div className="text-right"><p className={cn('calm-number text-sm font-semibold', row.pendingReviews > 0 ? 'text-amber-700' : 'text-ink')}>{row.pendingReviews}</p><p className="text-[11px] text-muted">{t('reviews')}</p></div>
                <div className="text-right"><p className={cn('calm-number text-sm font-semibold', row.atRiskProjects > 0 ? 'text-red-700' : 'text-ink')}>{row.atRiskProjects}</p><p className="text-[11px] text-muted">{t('at risk')}</p></div>
              </div>
            ))}
            {snapshot.projectManagers.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t('No Project Managers available.')}</p>}
          </div>
        </section>
      </div>

      <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="management-capacity-title">
        <div className="flex flex-col gap-1 border-b border-line/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="management-capacity-title" className="font-semibold text-ink">{t('Shared employee capacity')}</h3>
            <p className="mt-1 text-sm text-muted">{t('Availability signals are workload indicators, not performance scores.')}</p>
          </div>
          <span className="text-sm font-semibold text-muted">{t('Team workload')}</span>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {workload.map(row => {
            const tone = row.signal === 'overloaded' ? 'text-red-700 bg-red-50' : row.signal === 'busy' ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50';
            return <div key={row.member.id} className="rounded-control border border-line/70 bg-inset/30 p-3"><div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-semibold text-ink" data-i18n-skip>{row.member.name}</p><span className={cn('shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold capitalize', tone)}>{t(row.signal)}</span></div><p className="mt-2 text-xs text-muted">{row.open} {t('open')} · {row.dueSoon} {t('due soon')} · {row.projects} {t('projects')}</p></div>;
          })}
          {workload.length === 0 && <p className="text-sm text-muted">{t('No internal capacity data yet.')}</p>}
        </div>
      </section>

      <p className="text-xs leading-5 text-muted">{t('Metrics are calculated from permission-visible projects, tasks, plans, cycles, and deliverables as of')} {formatLocalizedDate(now, locale)}.</p>
    </section>
  );
};

export default ManagementOverview;

