import type {
  Addon,
  ClientServicePlan,
  Deliverable,
  ServiceCycle,
  ServiceItem,
  ServicePricingSnapshot,
  ServiceWorkflowSnapshot,
  ServiceWorkflowTemplate,
  Task,
} from '../types';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export const clampBillingDate = (year: number, monthIndex: number, billingDay: number) => {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(year, monthIndex, Math.min(Math.max(1, billingDay), lastDay))));
};

export const nextBillingDate = (afterDate: string, billingDay: number) => {
  const after = utcDate(afterDate);
  let year = after.getUTCFullYear();
  let month = after.getUTCMonth();
  let candidate = clampBillingDate(year, month, billingDay);
  if (candidate <= afterDate) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = clampBillingDate(year, month, billingDay);
  }
  return candidate;
};

export const cyclePeriodEnd = (periodStart: string, billingDay: number) => {
  const next = utcDate(nextBillingDate(periodStart, billingDay));
  next.setUTCDate(next.getUTCDate() - 1);
  return isoDate(next);
};

export const calculateServiceSubtotalMinor = (items: ServiceItem[]) => items.reduce(
  (sum, item) => sum + Math.max(0, Math.trunc(item.quantity)) * Math.max(0, Math.trunc(item.unitPriceMinor)),
  0,
);

export const calculatePlanTotalMinor = (
  items: ServiceItem[],
  discountType: ClientServicePlan['discountType'],
  discountValue: number,
  taxRateBps: number,
) => {
  const subtotal = calculateServiceSubtotalMinor(items);
  const discount = discountType === 'percent'
    ? Math.round(subtotal * Math.min(10_000, Math.max(0, discountValue)) / 10_000)
    : discountType === 'fixed'
      ? Math.min(subtotal, Math.max(0, Math.trunc(discountValue)))
      : 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * Math.min(10_000, Math.max(0, taxRateBps)) / 10_000);
  return { subtotal, discount, tax, total: taxable + tax };
};

export const snapshotWorkflow = (template: ServiceWorkflowTemplate): ServiceWorkflowSnapshot => ({
  templateId: template.id,
  templateRevision: template.revision,
  templateName: template.name,
  name: template.name,
  steps: template.steps
    .map(step => ({ ...step }))
    .sort((left, right) => left.order - right.order),
});

export const makePricingSnapshot = (data: {
  id: string;
  clientId: string;
  parentType: ServicePricingSnapshot['parentType'];
  parentId: string;
  items?: ServiceItem[];
  addonUnitPriceMinor?: number;
  addonQuantity?: number;
  discountType?: ServicePricingSnapshot['discountType'];
  discountValue?: number;
  taxRateBps?: number;
  now?: string;
}): ServicePricingSnapshot => {
  const items = data.items || [];
  const discountType = data.discountType || 'none';
  const discountValue = Math.max(0, Math.trunc(data.discountValue || 0));
  const taxRateBps = Math.max(0, Math.min(10_000, Math.trunc(data.taxRateBps || 0)));
  const addonSubtotal = Math.max(0, Math.trunc(data.addonUnitPriceMinor || 0)) * Math.max(1, Math.trunc(data.addonQuantity || 1));
  const totals = calculatePlanTotalMinor(items, discountType, discountValue, taxRateBps);
  const subtotalMinor = totals.subtotal + addonSubtotal;
  const discountMinor = discountType === 'percent'
    ? Math.round(subtotalMinor * Math.min(10_000, discountValue) / 10_000)
    : discountType === 'fixed' ? Math.min(subtotalMinor, discountValue) : 0;
  const taxable = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = Math.round(taxable * taxRateBps / 10_000);
  const now = data.now || new Date().toISOString();
  return {
    id: data.id,
    clientId: data.clientId,
    parentType: data.parentType,
    parentId: data.parentId,
    currency: 'MYR',
    itemPrices: items.map(item => ({ serviceItemId: item.id, unitPriceMinor: Math.max(0, Math.trunc(item.unitPriceMinor)) })),
    addonUnitPriceMinor: data.addonUnitPriceMinor === undefined ? undefined : Math.max(0, Math.trunc(data.addonUnitPriceMinor)),
    discountType,
    discountValue,
    taxRateBps,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: taxable + taxMinor,
    createdAt: now,
    updatedAt: now,
  };
};

export const applyPricingSnapshot = <T extends { serviceItems?: ServiceItem[]; unitPriceMinor?: number; discountType?: ClientServicePlan['discountType']; discountValue?: number; taxRateBps?: number }>(
  item: T,
  pricing?: ServicePricingSnapshot,
): T => {
  if (!pricing) return item;
  const prices = new Map(pricing.itemPrices.map(line => [line.serviceItemId, line.unitPriceMinor]));
  return {
    ...item,
    serviceItems: item.serviceItems?.map(serviceItem => ({
      ...serviceItem,
      unitPriceMinor: prices.get(serviceItem.id) ?? serviceItem.unitPriceMinor,
    })),
    unitPriceMinor: pricing.addonUnitPriceMinor ?? item.unitPriceMinor,
    discountType: pricing.discountType,
    discountValue: pricing.discountValue,
    taxRateBps: pricing.taxRateBps,
  };
};

export const stripServiceItemPrices = (items: ServiceItem[]): ServiceItem[] => items.map(item => ({ ...item, unitPriceMinor: 0 }));

export const resolveDeliverableStatus = (
  deliverable: Deliverable,
  tasks: Task[],
): Deliverable['status'] => {
  const linked = tasks.filter(task => task.deliverableId === deliverable.id || deliverable.taskIds.includes(task.id));
  if (!linked.length) return deliverable.status === 'Delivered' ? 'Delivered' : 'Planned';
  const required = linked.filter(task => task.workflowStepRequired !== false);
  const allRequiredComplete = required.length > 0 && required.every(task => task.isCompleted || task.status === 'Completed');
  if (allRequiredComplete) return deliverable.status === 'Delivered' ? 'Delivered' : 'Ready';
  const anyStarted = linked.some(task => task.status !== 'Pending' || task.completionPercentage > 0 || task.revisionCount > 0);
  return anyStarted ? 'In Progress' : 'Planned';
};

export const getCycleServiceProgress = (cycle: ServiceCycle, deliverables: Deliverable[]) => cycle.serviceItems.map(item => {
  const slots = deliverables.filter(deliverable => deliverable.cycleId === cycle.id && deliverable.serviceItemId === item.id);
  const completed = slots.filter(deliverable => deliverable.status === 'Delivered').length;
  return { serviceItemId: item.id, name: item.name, included: slots.length, completed, remaining: Math.max(0, slots.length - completed) };
});

export const addDaysClamped = (periodStart: string, offset: number | undefined, periodEnd: string) => {
  if (offset === undefined) return '';
  const date = utcDate(periodStart);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.trunc(offset)));
  return [isoDate(date), periodEnd].sort()[0];
};

export const SHORT_VIDEO_WORKFLOW_TEMPLATE: ServiceWorkflowTemplate = {
  id: 'SWT-short-video-production',
  name: 'Short Video Production',
  description: 'Editable ten-step production flow for short-form video deliverables.',
  serviceTypes: ['Short Video', 'Video'],
  revision: 1,
  isActive: true,
  steps: [
    ['Content Idea', 'Operation', 'work', false],
    ['Script Writing', 'Operation', 'work', false],
    ['Script Internal Review', 'Operation', 'internal_review', false],
    ['Client Script Approval', 'Operation', 'client_approval', true],
    ['Shooting', 'Video Shooting', 'work', false],
    ['Video Editing', 'Video Editor', 'work', false],
    ['Internal Review', 'Operation', 'internal_review', false],
    ['Client Approval', 'Operation', 'client_approval', true],
    ['Revision', 'Video Editor', 'work', false],
    ['Posting', 'Operation', 'publishing', true],
  ].map(([title, department, kind, clientVisible], index) => ({
    id: `SWTS-short-video-${index + 1}`,
    order: index + 1,
    title: String(title),
    department: department as ServiceWorkflowTemplate['steps'][number]['department'],
    kind: kind as ServiceWorkflowTemplate['steps'][number]['kind'],
    clientVisible: Boolean(clientVisible),
    required: true,
  })),
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

export const isAddonEffectiveForCycle = (addon: Addon, cycleStart: string, cycleId?: string) => {
  if (!addon.isActive && addon.billingMode === 'monthly') return false;
  if (addon.billingMode === 'one_off') return addon.targetCycleId === cycleId;
  return addon.effectiveFrom <= cycleStart && (!addon.effectiveUntil || addon.effectiveUntil >= cycleStart);
};

export const makeCycleRecords = (
  plan: ClientServicePlan,
  addons: Addon[],
  periodStart: string,
  makeId: (prefix: string) => string,
  now = new Date().toISOString(),
): { cycle: ServiceCycle; deliverables: Deliverable[] } => {
  const cycleId = makeId('CY');
  const addonSnapshots = addons.filter(addon => isAddonEffectiveForCycle(addon, periodStart));
  const cycle: ServiceCycle = {
    id: cycleId,
    clientId: plan.clientId,
    clientName: plan.clientName,
    planId: plan.id,
    planRevision: plan.revision,
    periodStart,
    periodEnd: cyclePeriodEnd(periodStart, plan.billingDay),
    status: 'Draft',
    currency: plan.currency,
    serviceItems: plan.serviceItems.map(item => ({
      ...item,
      platforms: [...item.platforms],
      workflow: item.workflow ? { ...item.workflow, steps: item.workflow.steps.map(step => ({ ...step })) } : undefined,
    })),
    addonSnapshots: addonSnapshots.map(addon => ({ ...addon, platforms: [...addon.platforms] })),
    discountType: plan.discountType,
    discountValue: plan.discountValue,
    taxRateBps: plan.taxRateBps,
    createdAt: now,
    updatedAt: now,
  };
  const deliverables = plan.serviceItems.flatMap(item => (
    Array.from({ length: Math.max(0, Math.trunc(item.quantity)) }, (_, index): Deliverable => ({
      id: makeId('DL'),
      clientId: plan.clientId,
      clientName: plan.clientName,
      planId: plan.id,
      cycleId,
      serviceItemId: item.id,
      sequence: index + 1,
      title: `${item.name} ${index + 1}`,
      status: 'Planned',
      taskIds: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
    }))
  ));
  return { cycle, deliverables };
};

export const formatMoney = (minor: number, currency = 'MYR') => new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency,
}).format(minor / 100);
