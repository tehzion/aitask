import type { ClientServicePlan, ServiceCycle } from '../types';
import { useI18n } from './I18nProvider';
import { formatLocalizedDate } from '../lib/i18n';
import { getCurrentPlanCycle } from '../lib/dashboardData';
import { getTodayInputDate, parseOptionalDate } from '../lib/utils';

const MonthlyPlanSchedule = ({ plan, cycles, today }: {
  plan: ClientServicePlan;
  cycles: ServiceCycle[];
  today: Date;
}) => {
  const { t, locale } = useI18n();
  const cycle = getCurrentPlanCycle(plan, cycles, today, { includeDraft: true });
  const nextDate = plan.status === 'Active' ? plan.nextCycleStart || plan.startDate : plan.startDate;
  const dateLabel = (value: string) => {
    const date = parseOptionalDate(value);
    return date ? formatLocalizedDate(date, locale) : t('Not scheduled');
  };
  const nextLabel = plan.status === 'Draft' ? 'First cycle starts' : nextDate <= getTodayInputDate(today) ? 'Monthly update due' : 'Next monthly update';

  return <section aria-label={t('Monthly update schedule')} className="rounded-panel border border-line bg-surface px-5 py-4">
    <h2 className="font-semibold text-ink">{t('Monthly updates')}</h2>
    <p className="mt-1 text-sm leading-6 text-muted">{t(plan.status === 'Draft'
      ? plan.supersedesPlanId ? 'This revision takes over automatically at its scheduled cycle.' : 'Activate this plan to begin monthly cycles on the dates below.'
      : plan.status === 'Paused'
        ? 'Monthly updates are paused. Resume the plan to continue from the next billing day.'
        : plan.status === 'Ended'
          ? 'This plan has ended. Previous monthly cycles remain in history.'
          : 'A fresh draft cycle and deliverables are created on each billing day. Previous months keep their own progress and files.')}</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      <div><dt className="text-xs text-muted">{t('Monthly billing day')}</dt><dd className="mt-1 text-sm font-medium text-ink">{t('Day')} {plan.billingDay}</dd></div>
      <div><dt className="text-xs text-muted">{t('Current cycle')}</dt><dd className="mt-1 text-sm font-medium text-ink">{cycle
        ? `${dateLabel(cycle.periodStart)} – ${dateLabel(cycle.periodEnd)}` : t('No cycle for this period')}</dd></div>
      <div><dt className="text-xs text-muted">{t(plan.status === 'Paused' || plan.status === 'Ended' ? 'Monthly update status' : nextLabel)}</dt><dd className="mt-1 text-sm font-medium text-ink">{plan.status === 'Paused' ? t('Paused') : plan.status === 'Ended' ? t('Ended') : dateLabel(nextDate)}</dd></div>
    </dl>
    {plan.billingDay > 28 && <p className="mt-3 text-xs leading-5 text-muted">{t('Shorter months use their last day, then return to your billing day the following month.')}</p>}
  </section>;
};

export default MonthlyPlanSchedule;
