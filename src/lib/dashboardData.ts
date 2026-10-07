import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { ClientServicePlan, ServiceCycle } from '../types';
import { parseOptionalDate } from './utils';

export const getContractDaysRemaining = (contractEndDate: string | undefined, today: Date): number | null => {
  const end = parseOptionalDate(contractEndDate);
  return end ? differenceInCalendarDays(end, today) : null;
};

export const getCurrentPlanCycle = (
  plan: Pick<ClientServicePlan, 'id' | 'clientId'>,
  cycles: readonly ServiceCycle[],
  today: Date,
): ServiceCycle | undefined => {
  const day = startOfDay(today);
  return cycles
    .filter(cycle => {
      if (cycle.clientId !== plan.clientId || cycle.planId !== plan.id) return false;
      if (cycle.status !== 'Published' && cycle.status !== 'Completed') return false;
      const start = parseOptionalDate(cycle.periodStart);
      const end = parseOptionalDate(cycle.periodEnd);
      return Boolean(start && end && startOfDay(start) <= day && day <= startOfDay(end));
    })
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart))[0];
};
