import type { ClientPlanStatus, ServiceCycleStatus } from '../types';

export const planStatusLabel = (status: ClientPlanStatus): string => status === 'Active' ? 'Running' : status;

export const cycleStatusLabel = (status: ServiceCycleStatus): string => ({ Draft: 'Not started', Published: 'In progress', Completed: 'Done', Cancelled: 'Cancelled' })[status];
