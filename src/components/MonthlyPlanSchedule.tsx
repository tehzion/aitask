import '../lib/pageCopy';
import CyclePaymentControl from './CyclePaymentControl';
import { CalendarClock, Eye, History, Plus } from 'lucide-react';
import type { ClientServicePlan, Deliverable, ServiceCycle } from '../types';
import { getMonthHousekeeping } from '../lib/monthHousekeeping';
import { useI18n } from './I18nProvider';
import { formatLocalizedDate } from '../lib/i18n';
import { getCurrentPlanCycle } from '../lib/dashboardData';
import { getTodayInputDate, parseOptionalDate } from '../lib/utils';
import { Button, StatusChip } from './ui';

const MonthlyPlanSchedule = ({ plan, cycles, deliverables = [], today, canManagePlans = false, canManageCycles = false, busy = false, upcomingPlan, onEditDetails, onCreateNextPlan, onViewNextPlan, onViewCycle, onViewHistory, onSetCycleStatus }: {
  plan: ClientServicePlan;
  cycles: ServiceCycle[];
  deliverables?: Deliverable[];
  today: Date;
  canManagePlans?: boolean;
  canManageCycles?: boolean;
  busy?: boolean;
  onSetCycleStatus?: (cycleId: string, status: ServiceCycle['status']) => void;
  upcomingPlan?: ClientServicePlan;
  onEditDetails?: () => void;
  onCreateNextPlan?: () => void;
  onViewNextPlan?: () => void;
  onViewCycle?: (cycleId: string) => void;
  onViewHistory?: () => void;
}) => {
  const { t, locale } = useI18n();
  const todayKey = getTodayInputDate(today);
  const cycle = getCurrentPlanCycle(plan, cycles, today, { includeDraft: true });
  const nextDate = plan.status === 'Active' ? plan.nextCycleStart || plan.startDate : plan.startDate;
  const previousCycle = cycles
    .filter(item => item.clientId === plan.clientId && item.periodEnd < todayKey)
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))[0];
  const history = cycles
    .filter(item => item.clientId === plan.clientId && item.id !== cycle?.id)
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart))
    .slice(0, 6);
  const dateLabel = (value: string) => {
    const date = parseOptionalDate(value);
    return date ? formatLocalizedDate(date, locale) : t('Not scheduled');
  };
  const nextLabel = plan.status === 'Draft' ? 'First cycle starts' : nextDate <= getTodayInputDate(today) ? 'Monthly update due' : 'Next monthly update';
  const cycleState = (item: ServiceCycle) => item.periodStart > todayKey
    ? 'Upcoming'
    : item.periodStart <= todayKey && todayKey <= item.periodEnd
      ? 'This month'
      : 'Ended';

  // F3: ended months that still need a decision say so, with the PM's options.
  const monthStatus = (item: ServiceCycle) => {
    const housekeeping = getMonthHousekeeping(item, deliverables, todayKey);
    const act = (status: ServiceCycle['status'], label: string) => canManageCycles && onSetCycleStatus
      ? <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={busy} aria-label={`${t(label)}: ${dateLabel(item.periodStart)}`} onClick={() => onSetCycleStatus(item.id, status)}>{t(label)}</Button>
      : null;
    if (housekeeping.kind === 'never-published') return <div className="flex flex-wrap items-center gap-2"><StatusChip tone="amber">{t('Never started')}</StatusChip>{act('Published', 'Start late')}{act('Cancelled', 'Cancel month')}</div>;
    if (housekeeping.kind === 'ready-to-close') return <div className="flex flex-wrap items-center gap-2"><StatusChip tone="emerald">{t('Ready to close')}</StatusChip>{act('Completed', 'Close month')}</div>;
    if (housekeeping.kind === 'overdue') return <StatusChip tone="red">{t('Overdue: {count} not done', { count: housekeeping.notDone })}</StatusChip>;
    if (item.status === 'Completed') return <StatusChip tone="slate">{t('Closed')}</StatusChip>;
    if (item.status === 'Cancelled') return <StatusChip tone="slate">{t('Cancelled')}</StatusChip>;
    const state = cycleState(item);
    return <StatusChip tone={state === 'This month' ? 'emerald' : state === 'Upcoming' ? 'amber' : 'slate'}>{t(state)}</StatusChip>;
  };

  return <section aria-label={t('Monthly update schedule')} className="rounded-panel border border-line bg-surface px-5 py-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-ink">{t('Monthly Plan Overview')}</h2>
        <p className="mt-1 text-sm font-medium text-ink" data-i18n-skip>{plan.name}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canManagePlans && plan.status !== 'Ended' && <Button variant="secondary" onClick={onEditDetails}>{t('Edit details')}</Button>}
        {upcomingPlan ? <Button variant="secondary" onClick={onViewNextPlan}><Eye aria-hidden="true" className="h-4 w-4" />{t('View Next Month’s Plan')}</Button>
          : canManagePlans && (plan.status === 'Active' || plan.status === 'Ended') && <Button onClick={onCreateNextPlan}><Plus aria-hidden="true" className="h-4 w-4" />{t("Create Next Month's Plan")}</Button>}
        {history.length > 0 && <Button variant="secondary" onClick={onViewHistory}><History aria-hidden="true" className="h-4 w-4" />{t('View Plan History')}</Button>}
      </div>
    </div>
    <p className="mt-1 text-sm leading-6 text-muted">{t(plan.status === 'Draft'
      ? plan.supersedesPlanId ? 'This revision takes over automatically at its scheduled cycle.' : 'Start this plan to begin the months below.'
      : plan.status === 'Paused'
        ? 'Monthly updates are paused. Resume the plan to continue from the next billing day.'
        : plan.status === 'Ended'
          ? 'This plan has ended. Previous monthly cycles remain in history.'
          : 'A fresh draft cycle and deliverables are created on each billing day. Previous months keep their own progress and files.')}</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      <div><dt className="text-xs text-muted">{t('Monthly billing day')}</dt><dd className="mt-1 text-sm font-medium text-ink">{t('Day')} {plan.billingDay}</dd></div>
      <div><dt className="text-xs text-muted">{t('Current cycle')}</dt><dd className="mt-1 text-sm font-medium text-ink">{cycle
        ? `${dateLabel(cycle.periodStart)} – ${dateLabel(cycle.periodEnd)}` : t('No active cycle today')}</dd></div>
      <div><dt className="text-xs text-muted">{t(plan.status === 'Paused' || plan.status === 'Ended' ? 'Monthly update status' : nextLabel)}</dt><dd className="mt-1 text-sm font-medium text-ink">{plan.status === 'Paused' ? t('Paused') : plan.status === 'Ended' ? t('Ended') : dateLabel(nextDate)}</dd></div>
    </dl>
    {!cycle && plan.status === 'Active' && <p className="mt-3 flex items-start gap-2 rounded-control bg-inset px-3 py-2 text-sm leading-6 text-muted"><CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t('The previous period has ended. The next plan starts on')} {dateLabel(nextDate)}.</p>}
    {previousCycle && <p className="mt-3 text-sm text-muted">{t('Previous monthly plan')}: <span data-i18n-skip>{dateLabel(previousCycle.periodStart)} – {dateLabel(previousCycle.periodEnd)}</span> · {t('Ended')}</p>}
    {plan.billingDay > 28 && <p className="mt-3 text-xs leading-5 text-muted">{t('Shorter months use their last day, then return to your billing day the following month.')}</p>}
    {history.length > 0 && <div className="mt-5 overflow-x-auto border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-ink">{t('Plan History')}</h3>
      <table className="mt-3 w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs text-muted"><tr><th className="pb-2 font-medium">{t('Month')}</th><th className="pb-2 font-medium">{t('Period')}</th><th className="pb-2 font-medium">{t('Status')}</th><th className="pb-2 font-medium">{t('Payment')}</th><th className="pb-2 text-right font-medium">{t('Action')}</th></tr></thead>
        <tbody className="divide-y divide-line/70">{history.map(item => <tr key={item.id}><td className="py-3 font-medium text-ink">{dateLabel(item.periodStart)}</td><td className="py-3 text-muted">{dateLabel(item.periodStart)} – {dateLabel(item.periodEnd)}</td><td className="py-3">{monthStatus(item)}</td><td className="py-3"><CyclePaymentControl cycle={item} /></td><td className="py-3 text-right"><Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => onViewCycle?.(item.id)}>{t('View')}</Button></td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
};

export default MonthlyPlanSchedule;
