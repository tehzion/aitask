import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from './I18nProvider';
import { Surface } from './ui';
import { useLocalToday } from '../hooks/useLocalToday';
import type { Task } from '../types';
import { computeDeliveryMetrics, onTimeRate } from '../lib/deliveryMetrics';

const DAYS = 30;

/**
 * A department lead's quick read on delivery quality over the last 30 days:
 * how much was finished, how much on time, how much needed revisions. The
 * per-person detail lives in Reports; this is only the department's pulse.
 */
const DepartmentDeliveryGlance: React.FC<{ tasks: readonly Task[] }> = ({ tasks }) => {
  const { t } = useI18n();
  const today = useLocalToday();
  const metrics = React.useMemo(
    () => computeDeliveryMetrics(tasks, new Date(Math.max(Date.now(), today.getTime())), DAYS),
    [tasks, today],
  );
  const rate = onTimeRate(metrics);
  const cells: [string, string][] = [
    [t('Finished'), String(metrics.completed)],
    [t('On time'), rate === undefined ? '—' : `${rate}%`],
    [t('Needed revisions'), metrics.completed ? `${metrics.revisionRate}%` : '—'],
  ];
  return (
    <Surface variant="inset" className="overflow-hidden" aria-labelledby="department-delivery-title">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div>
          <h2 id="department-delivery-title" className="font-semibold text-ink">{t('Department delivery')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('quality.lastDays', { count: DAYS })}</p>
        </div>
        <Link to="/reports" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:underline">{t('See details in Reports')}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </div>
      {metrics.completed === 0
        ? <p className="border-t border-line bg-surface/60 px-5 py-4 text-sm text-muted">{t('No finished work in this period yet.')}</p>
        : <dl className="grid grid-cols-3 divide-x divide-line border-t border-line bg-surface/60">
          {cells.map(([label, value]) => <div key={label} className="px-3 py-4 sm:px-5"><dd className="calm-number text-xl font-semibold text-ink">{value}</dd><dt className="mt-1 text-xs leading-4 text-muted">{label}</dt></div>)}
        </dl>}
    </Surface>
  );
};

export default DepartmentDeliveryGlance;
