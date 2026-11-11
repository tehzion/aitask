import type { ClientPlanStatus, ServiceCycleStatus } from '../types';

export const planStatusLabel = (status: ClientPlanStatus): string => status === 'Active' ? 'Running' : status;

export const cycleStatusLabel = (status: ServiceCycleStatus): string => {
  switch (status) {
    case 'Draft': return 'Not started';
    case 'Published': return 'In progress';
    case 'Completed': return 'Done';
    default: return status;
  }
};
