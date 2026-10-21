import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getDashboardPersona, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { getManagementAttentionItems } from '../lib/managementIntelligence';
import { formatLocalizedDate } from '../lib/i18n';
import { parseOptionalDate, cn } from '../lib/utils';
import { useI18n } from './I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import { cardBase } from './uiTokens';

const severityStyles = {
  critical: { icon: AlertTriangle, className: 'bg-red-50 text-red-700' },
  attention: { icon: Clock3, className: 'bg-amber-50 text-amber-700' },
  information: { icon: Info, className: 'bg-blue-50 text-blue-700' },
} as const;

const NeedsMyAttention: React.FC = () => {
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

  const attention = React.useMemo(() => {
    const persona = getDashboardPersona(currentUser);
    if (persona !== 'boss' && persona !== 'projectManager') return null;
    const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects });
    const visibleProjects = getVisibleProjects(currentUser, projects, tasks, rolePermissions, { clients, projects });
    const clientIds = new Set(visibleProjects.map(project => project.clientId).filter(Boolean));
    visibleTasks.forEach(task => { if (task.clientId) clientIds.add(task.clientId); });
    const scopedPlans = persona === 'boss' ? clientPlans : clientPlans.filter(plan => clientIds.has(plan.clientId));
    const scopedCycles = persona === 'boss' ? serviceCycles : serviceCycles.filter(cycle => clientIds.has(cycle.clientId));
    const scopedDeliverables = persona === 'boss' ? deliverables : deliverables.filter(item => clientIds.has(item.clientId));
    return getManagementAttentionItems({
      persona,
      userId: currentUser?.id,
      projects: visibleProjects,
      tasks: visibleTasks,
      deliverables: scopedDeliverables,
      clientPlans: scopedPlans,
      serviceCycles: scopedCycles,
      now,
    });
  }, [clientPlans, clients, currentUser, deliverables, now, projects, rolePermissions, serviceCycles, tasks]);

  if (!attention) return null;

  return (
    <section className={cn(cardBase, 'overflow-hidden')} aria-labelledby="needs-attention-title">
      <div className="flex flex-col gap-1 border-b border-line/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="needs-attention-title" className="text-base font-semibold text-ink">{t('Needs my attention')}</h2>
          <p className="mt-1 text-sm text-muted">{t('The next decisions and risks in your scope.')}</p>
        </div>
        <Link to="/tasks" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent hover:underline">
          {t('Open work')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-line/60">
        {attention.map(item => {
          const style = severityStyles[item.severity];
          const Icon = style.icon;
          const dueDate = parseOptionalDate(item.dueDate);
          return (
            <Link key={item.id} to={item.to} className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-inset/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35">
              <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control', style.className)}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                <span className="mt-1 block truncate text-xs text-muted">{item.detail}{dueDate ? ` · ${formatLocalizedDate(dueDate, locale)}` : ''}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          );
        })}
        {attention.length === 0 && (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-ink">{t('Everything is under control')}</p>
            <p className="mt-1 text-xs text-muted">{t('No urgent work needs your attention right now.')}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default NeedsMyAttention;
