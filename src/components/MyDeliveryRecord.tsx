import React from 'react';
import '../lib/pageCopy';
import { computeDeliveryMetrics, onTimeRate, onTimeStreak } from '../lib/deliveryMetrics';
import { useLocalToday } from '../hooks/useLocalToday';
import type { Task } from '../types';
import { useI18n } from './I18nProvider';
import { Surface } from './ui';

const DAYS = 90;

/**
 * A Staff member's own delivery record, Fiverr "seller stats" style: on-time
 * rate, rating, revisions and how fast they accept work. It is private to the
 * person and never ranks them against anyone.
 */
const MyDeliveryRecord: React.FC<{ tasks: readonly Task[] }> = ({ tasks }) => {
  const { t } = useI18n();
  const today = useLocalToday();
  const now = React.useMemo(() => new Date(Math.max(Date.now(), today.getTime())), [today]);
  const metrics = React.useMemo(() => computeDeliveryMetrics(tasks, now, DAYS), [now, tasks]);
  const streak = React.useMemo(() => onTimeStreak(tasks, now), [now, tasks]);
  const rate = onTimeRate(metrics);

  const cells: [string, string][] = [
    [t('Finished'), String(metrics.completed)],
    [t('On time'), rate === undefined ? '—' : `${rate}%`],
    [t('Client rating'), metrics.averageRating === undefined ? '—' : `★ ${metrics.averageRating.toFixed(1)}`],
    [t('Revisions per task'), String(metrics.averageRevisions)],
    [t('Accepts work in'), metrics.medianAcceptanceHours === undefined ? '—' : t('record.hours', { hours: metrics.medianAcceptanceHours })],
  ];

  return (
    <Surface variant="inset" className="overflow-hidden" aria-labelledby="my-delivery-record-title">
      <div className="px-5 py-4">
        <h2 id="my-delivery-record-title" className="font-semibold text-ink">{t('My delivery record')}</h2>
        <p className="mt-0.5 text-sm text-muted">{t('quality.lastDays', { count: DAYS })} · {t('Only you can see this.')}</p>
      </div>
      {metrics.completed === 0
        ? <p className="border-t border-line bg-surface/60 px-5 py-4 text-sm text-muted">{t('Your record appears after you finish your first task.')}</p>
        : <>
          <dl className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line bg-surface/60 sm:grid-cols-5 sm:divide-y-0">
            {cells.map(([label, value]) => <div key={label} className="px-3 py-4 sm:px-5"><dd className="calm-number text-xl font-semibold text-ink">{value}</dd><dt className="mt-1 text-xs leading-4 text-muted">{label}</dt></div>)}
          </dl>
          {streak >= 2 && <p className="border-t border-line bg-surface/60 px-5 py-3 text-sm font-medium text-ink">{t('record.streak', { count: streak })}</p>}
        </>}
    </Surface>
  );
};

export default MyDeliveryRecord;
