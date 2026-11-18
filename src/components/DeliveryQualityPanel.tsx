import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { useI18n } from './I18nProvider';
import { Surface } from './ui';
import { useLocalToday } from '../hooks/useLocalToday';
import { getVisibleTasks } from '../lib/access';
import type { MessageId } from '../lib/messages';
import { computeDeliveryMetrics, computePersonDeliveryMetrics, onTimeRate, type DeliveryMetrics } from '../lib/deliveryMetrics';

const PERIODS = [30, 90] as const;

const formatHours = (hours: number | undefined, t: (key: MessageId, params?: Record<string, string | number>) => string) => {
  if (hours === undefined) return '—';
  return hours < 48 ? t('quality.hours', { count: hours }) : t('quality.days', { count: Math.round(hours / 24) });
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="px-4 py-3">
    <dt className="text-xs font-medium text-muted">{label}</dt>
    <dd className="calm-number mt-1 text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</dd>
    {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
  </div>
);

/**
 * Delivery quality for the work this person can see: on-time rate, revision
 * rate, how fast work is accepted and the client rating. A Staff member sees
 * only their own numbers; PMs and HODs see each person in their scope. It is
 * for coaching, not for ranking.
 */
const DeliveryQualityPanel: React.FC = () => {
  const { t } = useI18n();
  const { tasks: allTasks, currentUser, rolePermissions, clients, projects, users } = useStore(useShallow(state => ({
    tasks: state.tasks, currentUser: state.currentUser, rolePermissions: state.rolePermissions, clients: state.clients, projects: state.projects, users: state.users,
  })));
  const [days, setDays] = React.useState<(typeof PERIODS)[number]>(90);
  const today = useLocalToday();

  const visible = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients, projects, users }),
    [allTasks, clients, currentUser, projects, rolePermissions, users],
  );
  const isStaff = currentUser?.role === 'Staff';
  const scoped = React.useMemo(() => (isStaff ? visible.filter(task => task.assignedTo === currentUser?.id) : visible), [currentUser?.id, isStaff, visible]);
  // Today's midnight only triggers a refresh at day change; the period itself ends right now.
  const overall: DeliveryMetrics = React.useMemo(() => computeDeliveryMetrics(scoped, new Date(Math.max(Date.now(), today.getTime())), days), [days, scoped, today]);
  const people = React.useMemo(() => (isStaff ? [] : computePersonDeliveryMetrics(scoped, new Date(Math.max(Date.now(), today.getTime())), days)), [days, isStaff, scoped, today]);
  const rate = onTimeRate(overall);

  return (
    <section aria-labelledby="delivery-quality-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="delivery-quality-title" className="text-lg font-semibold text-ink">{t('Delivery quality')}</h2>
          <p className="mt-1 text-sm text-muted">{isStaff ? t('Your finished work. Used to spot where support helps, not to rank people.') : t('Finished work in your scope. Used to spot where support helps, not to rank people.')}</p>
        </div>
        <div role="group" aria-label={t('Period')} className="flex gap-1">
          {PERIODS.map(value => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}
              className={`min-h-10 rounded-control px-3 text-sm font-semibold ${days === value ? 'bg-ink text-surface' : 'text-muted hover:bg-inset'}`}>
              {t('quality.lastDays', { count: value })}
            </button>
          ))}
        </div>
      </div>
      {overall.completed === 0 ? (
        <Surface className="px-5 py-8 text-center text-sm text-muted">{t('No finished work in this period yet.')}</Surface>
      ) : (
        <>
          <Surface className="overflow-hidden">
            <dl className="grid grid-cols-2 divide-x divide-y divide-line/60 sm:grid-cols-5 sm:divide-y-0">
              <Stat label={t('Finished')} value={String(overall.completed)} />
              <Stat label={t('On time')} value={rate === undefined ? '—' : `${rate}%`} hint={rate === undefined ? t('No due dates') : t('quality.ofTotal', { done: overall.onTime, total: overall.withDueDate })} />
              <Stat label={t('Needed revisions')} value={`${overall.revisionRate}%`} hint={t('quality.avgRounds', { count: overall.averageRevisions })} />
              <Stat label={t('Time to accept')} value={formatHours(overall.medianAcceptanceHours, t)} hint={t('Median')} />
              <Stat label={t('Client rating')} value={overall.averageRating === undefined ? '—' : `${overall.averageRating} / 5`} hint={overall.ratedCount ? t('quality.rated', { count: overall.ratedCount }) : t('Not rated yet')} />
            </dl>
          </Surface>
          {people.length > 0 && (
            <Surface className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('Results by person')}>
              <table className="w-full min-w-[34rem] text-left text-sm">
                <caption className="sr-only">{t('Delivery quality by person')}</caption>
                <thead className="border-b border-line/70 text-xs text-muted">
                  <tr><th scope="col" className="px-4 py-2 font-medium">{t('Person')}</th><th scope="col" className="px-3 py-2 font-medium">{t('Finished')}</th><th scope="col" className="px-3 py-2 font-medium">{t('On time')}</th><th scope="col" className="px-3 py-2 font-medium">{t('Needed revisions')}</th><th scope="col" className="px-3 py-2 font-medium">{t('Time to accept')}</th></tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {people.map(row => {
                    const person = users.find(user => user.id === row.userId);
                    const personRate = onTimeRate(row);
                    return (
                      <tr key={row.userId}>
                        <th scope="row" data-i18n-skip className="px-4 py-2 font-medium text-ink">{person?.name || t('Unavailable member')}</th>
                        <td className="calm-number px-3 py-2">{row.completed}</td>
                        <td className="calm-number px-3 py-2">{personRate === undefined ? '—' : `${personRate}%`}</td>
                        <td className="calm-number px-3 py-2">{row.revisionRate}%</td>
                        <td className="calm-number px-3 py-2">{formatHours(row.medianAcceptanceHours, t)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Surface>
          )}
        </>
      )}
    </section>
  );
};

export default DeliveryQualityPanel;
