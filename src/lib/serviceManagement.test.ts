import { describe, expect, it } from 'vitest';
import type { ClientServicePlan, Deliverable, ServiceItem, Task } from '../types';
import { applyPricingSnapshot, calculatePlanTotalMinor, clampBillingDate, cyclePeriodEnd, getCycleServiceProgress, makeCycleRecords, makePricingSnapshot, nextBillingDate, resolveDeliverableStatus, SHORT_VIDEO_WORKFLOW_TEMPLATE, snapshotWorkflow, stripServiceItemPrices } from './serviceManagement';

const items: ServiceItem[] = [{ id: 'item-1', name: 'Video', platforms: ['TikTok'], unit: 'video', quantity: 3, unitPriceMinor: 12500 }];

describe('service management calculations', () => {
  it('clamps billing days for short and leap-year months', () => {
    expect(clampBillingDate(2026, 1, 31)).toBe('2026-02-28');
    expect(clampBillingDate(2028, 1, 31)).toBe('2028-02-29');
    expect(nextBillingDate('2026-01-31', 31)).toBe('2026-02-28');
    expect(cyclePeriodEnd('2026-01-31', 31)).toBe('2026-02-27');
  });

  it('calculates quantity, discount and tax in minor units', () => {
    expect(calculatePlanTotalMinor(items, 'percent', 1000, 800)).toEqual({
      subtotal: 37500,
      discount: 3750,
      tax: 2700,
      total: 36450,
    });
  });

  it('creates independent cycle and deliverable snapshots', () => {
    const plan: ClientServicePlan = {
      id: 'plan-1', clientId: 'client-1', clientName: 'Acme', name: 'Growth', origin: 'custom', revision: 1,
      status: 'Active', currency: 'MYR', serviceItems: structuredClone(items), discountType: 'none', discountValue: 0,
      taxRateBps: 0, startDate: '2026-08-15', billingDay: 15, createdBy: 'admin', createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-15T00:00:00.000Z',
    };
    let id = 0;
    const result = makeCycleRecords(plan, [], plan.startDate, prefix => `${prefix}-${++id}`, '2026-08-15T00:00:00.000Z');
    expect(result.deliverables).toHaveLength(3);
    expect(result.cycle.periodEnd).toBe('2026-09-14');
    plan.serviceItems[0].name = 'Changed later';
    expect(result.cycle.serviceItems[0].name).toBe('Video');
  });

  it('freezes workflow revisions and separates pricing from operational scope', () => {
    const workflow = snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE);
    const scopedItems = [{ ...items[0], workflow }];
    const pricing = makePricingSnapshot({ id: 'price-1', clientId: 'client-1', parentType: 'client_plan', parentId: 'plan-1', items: scopedItems, discountType: 'percent', discountValue: 1000, taxRateBps: 800 });
    const operational = stripServiceItemPrices(scopedItems);
    SHORT_VIDEO_WORKFLOW_TEMPLATE.steps[0].title = 'Changed catalog step';
    expect(workflow.steps[0].title).toBe('Content Idea');
    expect(operational[0].unitPriceMinor).toBe(0);
    expect(applyPricingSnapshot({ serviceItems: operational, discountType: 'none' as const, discountValue: 0, taxRateBps: 0 }, pricing)).toMatchObject({
      serviceItems: [{ unitPriceMinor: 12500 }], discountType: 'percent', discountValue: 1000, taxRateBps: 800,
    });
    SHORT_VIDEO_WORKFLOW_TEMPLATE.steps[0].title = 'Content Idea';
  });

  it('derives deliverable and monthly included/completed/remaining progress', () => {
    const deliverable: Deliverable = {
      id: 'deliverable-1', clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', cycleId: 'cycle-1',
      serviceItemId: 'item-1', sequence: 1, title: 'Video 1', status: 'Planned', taskIds: ['task-1', 'task-2'], attachments: [],
      createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-15T00:00:00.000Z',
    };
    const task = (id: string, completed: boolean, required = true): Task => ({
      id, clientId: 'client-1', deliverableId: deliverable.id, clientName: 'Acme', serviceType: 'Video', title: id,
      description: '', department: 'Video Editor', assignedTo: 'editor', createdBy: 'admin', startDate: '2026-08-15', dueDate: '',
      priority: 'Medium', status: completed ? 'Completed' : 'In Progress', completionPercentage: completed ? 100 : 50,
      isCompleted: completed, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false, comments: [], approvalHistory: [],
      workflowStepRequired: required,
    });
    expect(resolveDeliverableStatus(deliverable, [task('task-1', true), task('task-2', false, false)])).toBe('Ready');
    const cycle = {
      id: 'cycle-1', clientId: 'client-1', clientName: 'Acme', planId: 'plan-1', planRevision: 1,
      periodStart: '2026-08-15', periodEnd: '2026-09-14', status: 'Published' as const, currency: 'MYR' as const,
      serviceItems: items, addonSnapshots: [], discountType: 'none' as const, discountValue: 0, taxRateBps: 0,
      createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-15T00:00:00.000Z',
    };
    expect(getCycleServiceProgress(cycle, [{ ...deliverable, status: 'Delivered' }, { ...deliverable, id: 'deliverable-2', sequence: 2, status: 'Ready' }])).toEqual([
      { serviceItemId: 'item-1', name: 'Video', included: 2, completed: 1, remaining: 1 },
    ]);
  });
});
