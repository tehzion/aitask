import React from 'react';
import '../lib/pageCopy';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getVisibleTasks, isBossKoo } from '../lib/access';
import { computeDeliveryMetrics, onTimeRate } from '../lib/deliveryMetrics';
import { useLocalToday } from '../hooks/useLocalToday';
import { useI18n } from './I18nProvider';
import { Surface } from './ui';

const DAYS = 90;

/**
 * How well the agency is delivering, for Boss Koo: on-time rate, client
 * rating and revisions over the last 90 days. The same numbers a Project
 * Manager and each person see in their own scope, summed over everything.
 */
const AgencyDeliveryHealth: React.FC = () => {
  const { t } = useI18n();
  const today = useLocalToday();
  const { tasks, currentUser, rolePermissions, clients, projects } = useStore(useShallow(state => ({
    tasks: state.tasks, currentUser: state.currentUser, rolePermissions: state.rolePermissions, clients: state.clients, projects: state.projects,
  })));
  const now = React.useMemo(() => new Date(Math.max(Date.now(), today.getTime())), [today]);
  const boss = isBossKoo(currentUser);
  const metrics = React.useMemo(() => {
    if (!boss) return undefined;
    return computeDeliveryMetrics(getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects }), now, DAYS);
  }, [boss, clients, currentUser, now, projects, rolePermissions, tasks]);
  if (!metrics) return null;
  const rate = onTimeRate(metrics);
  const cells: [string, string][] = [
    [t('Finished'), String(metrics.completed)],
    [t('On time'), rate === undefined ? '\u2014' : `${rate}%`],
    [t('Client rating'), metrics.averageRating === undefined ? '\u2014' : `\u2605 ${metrics.averageRating.toFixed(1)}`],
    [t('Revisions per task'), String(metrics.averageRevisions)],
  ];
  return (
    <Surface variant="inset" className="overflow-hidden" aria-labelledby="agency-delivery-health-title" data-testid="agency-delivery-health">
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 py-4">
        <div>
          <h2 id="agency-delivery-health-title" className="font-semibold text-ink">{t('Delivery health')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('quality.lastDays', { count: DAYS })} · {t('Used to spot where support helps, not to rank people.')}</p>
        </div>
        <Link to="/reports" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline">
          {t('See quality by person')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {metrics.completed === 0
        ? <p className="border-t border-line bg-surface/60 px-5 py-4 text-sm text-muted">{t('No finished work in this period yet.')}</p>
        : <dl className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line bg-surface/60 sm:grid-cols-4 sm:divide-y-0">
          {cells.map(([label, value]) => <div key={label} className="px-3 py-4 sm:px-5"><dd className="calm-number text-xl font-semibold text-ink">{value}</dd><dt className="mt-1 text-xs leading-4 text-muted">{label}</dt></div>)}
        </dl>}
    </Surface>
  );
};

export default AgencyDeliveryHealth;
