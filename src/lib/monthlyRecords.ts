import type { ClientServicePlan, ServiceCycle, ServiceItem } from '../types';
import { formatLocalizedDate, formatLocalizedMonth } from './i18n';
import { parseOptionalDate } from './utils';

/** Human-readable label for a monthly record (e.g. "September 2026 · 1 Sep – 30 Sep 2026"). */
export const monthlyRecordLabel = (cycle: ServiceCycle, locale: Parameters<typeof formatLocalizedDate>[1]) =>
  `${formatLocalizedMonth(parseOptionalDate(cycle.periodStart)!, locale)} · ${formatLocalizedDate(parseOptionalDate(cycle.periodStart)!, locale)} – ${formatLocalizedDate(parseOptionalDate(cycle.periodEnd)!, locale)}`;

/** Service billing follows the workspace's Malaysian business calendar. */
export const getBillingToday = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const resolveMonthlyRecord = (cycles: ServiceCycle[], clientId: string, today: string, requestedId?: string | null, planIds?: ReadonlySet<string>) => {
  // When the caller knows the client's plan revisions, ignore cycles that do
  // not belong to any of them so an orphan or foreign-plan cycle can never be
  // presented as this client's current record.
  const scopeToPlans = Boolean(planIds && planIds.size > 0);
  const available = cycles.filter(item => item.clientId === clientId
    && (!scopeToPlans || !item.planId || planIds!.has(item.planId))
    && /^\d{4}-\d{2}-\d{2}$/.test(item.periodStart)
    && /^\d{4}-\d{2}-\d{2}$/.test(item.periodEnd) && item.periodStart <= item.periodEnd)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const current = available.find(item => item.periodStart <= today && today <= item.periodEnd);
  const selected = requestedId ? available.find(item => item.id === requestedId) : current;
  return { available, current, selected, unavailable: Boolean(requestedId && !selected) };
};

export const validateRevisionItems = (items: ServiceItem[]) => {
  if (!items.length) return 'Add at least one service item.';
  if (items.some(item => !item.name.trim() || !item.unit.trim())) return 'Every service item needs a name and unit.';
  if (new Set(items.map(item => item.id)).size !== items.length) return 'Service items must have unique identities.';
  if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1) || items.reduce((sum, item) => sum + item.quantity, 0) > 400) return 'Draft plans need 1–400 deliverable slots.';
  if (items.some(item => !Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 0)) return 'Unit prices must be non-negative.';
  return undefined;
};

export const migrateLegacyPlanSchedules = (plans: ClientServicePlan[]) => plans.map(plan => (
  plan.status === 'Draft' && plan.supersedesPlanId && plan.effectiveFromCycleStart && !plan.revisionScheduleStatus
    ? { ...plan, revisionScheduleStatus: 'scheduled' as const } : plan
));
