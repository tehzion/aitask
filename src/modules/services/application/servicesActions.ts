import { isWorkspaceMutationLocked, pendingMutationMessage } from '../../../infrastructure/commands/mutationGuard';
import { safeHttpsUrl } from '../../../infrastructure/serialization/security';
import {
  canCreateTasks,
  canEditTask,
  canManageClientPlans,
  canManageServiceCatalog,
  canManageServiceCycles,
  canManageTaskTemplates,
  canOpenServiceClient
} from '../../../shared/authorization/access';
import {
  isEligibleTaskAssignee
} from '../../../shared/authorization/departments';
import { queueActionFeedback } from '../../../shared/feedback/actionFeedback';
import { useToastStore } from '../../../shared/feedback/useToastStore';
import { msg } from '../../../shared/i18n/messages';
import { isTaskOpen } from '../../../shared/rules/taskCompletion';
import { isWorkflowTask } from '../../../shared/rules/workflowReview';
import {
  type Addon,
  type ClientProfile,
  type ClientServicePlan,
  type CycleComment,
  type Deliverable,
  type ServiceCycle,
  type ServicePackage,
  type ServicePricingSnapshot,
  type ServiceWorkflowTemplate,
  type Task
} from '../../../shared/types/index';
import { type StoreState, type WorkspaceGet, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { getTodayInputDate } from '../../../shared/utils/utils';
import { cleanProfileText, isValidIsoDate, nowId } from '../../../shared/validation/workspaceInput';
import { isServiceClientInScope, normalizeClientKey, serviceClientScopeError } from '../../clients/application/clientScope';
import { allowedDepartments } from '../../tasks/application/taskRules';
import { hasInvalidDeliveryLink } from '../domain/deliveryLinks';
import { getBillingToday, validateRevisionItems } from '../domain/monthlyRecords';
import {
  addDaysClamped,
  canSetDeliverableStatus,
  getPlanContractStartDate,
  makeCycleRecords,
  makePricingSnapshot,
  nextBillingDate,
  resolveDeliverableStatus
} from '../domain/serviceManagement';
import { allowedServiceCycleTransitions, deriveServiceProgress } from './serviceProgress';
export const createServicesActions = (set: WorkspaceSet, get: WorkspaceGet): Pick<StoreState, "saveServicePackage" | "saveWorkflowTemplate" | "deleteServicePackage" | "deleteWorkflowTemplate" | "createClientWithPlan" | "createClientPlan" | "createClientPlanRevision" | "scheduleClientPlanRevision" | "returnClientPlanRevisionToDraft" | "updateDraftClientPlan" | "updateActivePlanDates" | "activateClientPlan" | "generateDueLocalServiceCycles" | "setClientPlanStatus" | "setServiceCycleStatus" | "updateDeliverableStatus" | "unlinkInvalidTaskDelivery" | "linkTaskToDeliverable" | "generateDeliverableTaskChain" | "carryForwardTaskToCycle" | "addCycleComment" | "addCycleCommentAttachment" | "addAddon" | "setAddonActive"> => ({
  saveServicePackage: (data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageServiceCatalog(state.currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Project Managers or Boss Koo can manage service packages.' };
    }
    const name = data.name.trim().slice(0, 160);
    if (!name) return { ok: false, error: 'Package name is required.' };
    const serviceItems = data.serviceItems.map(item => ({
      ...item,
      id: item.id || nowId('SI'),
      name: item.name.trim().slice(0, 160),
      platforms: item.platforms.map(value => value.trim()).filter(Boolean).slice(0, 20),
      unit: item.unit.trim().slice(0, 80) || 'item',
      quantity: Math.max(1, Math.trunc(item.quantity)),
      unitPriceMinor: Math.max(0, Math.trunc(item.unitPriceMinor)),
      description: cleanProfileText(item.description, 2000),
      workflow: item.workflow ? {
        ...item.workflow,
        steps: item.workflow.steps.map(step => ({ ...step })).sort((left, right) => left.order - right.order),
      } : undefined,
    })).filter(item => item.name);
    if (serviceItems.length === 0) return { ok: false, error: 'Add at least one service item.' };
    if (serviceItems.reduce((sum, item) => sum + item.quantity, 0) > 400) return { ok: false, error: 'A package can generate at most 400 deliverables per cycle.' };
    const existing = data.id ? state.servicePackages.find(item => item.id === data.id) : undefined;
    if (data.id && !existing) return { ok: false, error: 'Package not found.' };
    const now = new Date().toISOString();
    const item: ServicePackage = {
      id: existing?.id || nowId('PKG'),
      name,
      description: cleanProfileText(data.description, 2000),
      revision: existing ? existing.revision + 1 : 1,
      currency: 'MYR',
      serviceItems,
      discountType: data.discountType,
      discountValue: Math.max(0, Math.trunc(data.discountValue)),
      taxRateBps: Math.min(10_000, Math.max(0, Math.trunc(data.taxRateBps))),
      isActive: data.isActive,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    set(current => ({
      servicePackages: existing
        ? current.servicePackages.map(pkg => pkg.id === existing.id ? item : pkg)
        : [...current.servicePackages, item],
    }));
    return { ok: true, id: item.id };
  },
  saveWorkflowTemplate: (data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageTaskTemplates(state.currentUser, state.rolePermissions)) return { ok: false, error: 'You cannot manage task workflow templates.' };
    const name = data.name.trim().slice(0, 160);
    if (!name) return { ok: false, error: 'Template name is required.' };
    const steps = data.steps
      .map((step, index) => ({
        ...step,
        id: step.id || nowId('WFS'),
        order: index + 1,
        title: step.title.trim().slice(0, 160),
        description: cleanProfileText(step.description, 2000),
        dueOffsetDays: step.dueOffsetDays === undefined ? undefined : Math.max(0, Math.min(365, Math.trunc(step.dueOffsetDays))),
        clientVisible: Boolean(step.clientVisible),
        required: step.required !== false,
      }))
      .filter(step => step.title)
      .slice(0, 50);
    if (!steps.length) return { ok: false, error: 'Add at least one workflow step.' };
    if (steps.some(step => !allowedDepartments.has(step.department))) return { ok: false, error: 'Every workflow step needs a valid department.' };
    const existing = data.id ? state.serviceWorkflowTemplates.find(item => item.id === data.id) : undefined;
    if (data.id && !existing) return { ok: false, error: 'Workflow template not found.' };
    const now = new Date().toISOString();
    const item: ServiceWorkflowTemplate = {
      id: existing?.id || nowId('SWT'),
      name,
      description: cleanProfileText(data.description, 2000),
      serviceTypes: data.serviceTypes.map(value => value.trim()).filter(Boolean).slice(0, 30),
      revision: existing ? existing.revision + 1 : 1,
      isActive: data.isActive,
      steps,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    set(current => ({
      serviceWorkflowTemplates: existing
        ? current.serviceWorkflowTemplates.map(template => template.id === existing.id ? item : template)
        : [...current.serviceWorkflowTemplates, item],
    }));
    return { ok: true, id: item.id };
  },
  deleteServicePackage: (id) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageServiceCatalog(state.currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Project Managers or Boss Koo can manage service packages.' };
    }
    const existing = state.servicePackages.find(item => item.id === id);
    if (!existing) return { ok: false, error: 'Package not found.' };
    set(current => ({
      servicePackages: current.servicePackages.filter(item => item.id !== id),
    }));
    return { ok: true };
  },
  deleteWorkflowTemplate: (id) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageTaskTemplates(state.currentUser, state.rolePermissions)) {
      return { ok: false, error: 'You cannot manage task workflow templates.' };
    }
    const existing = state.serviceWorkflowTemplates.find(item => item.id === id);
    if (!existing) return { ok: false, error: 'Workflow template not found.' };
    const frozenWorkflows = [
      ...state.servicePackages.flatMap(pkg => pkg.serviceItems.map(item => item.workflow)),
      ...state.clientPlans.flatMap(plan => plan.serviceItems.map(item => item.workflow)),
      ...state.serviceCycles.flatMap(cycle => cycle.serviceItems.map(item => item.workflow)),
    ];
    const referenced = frozenWorkflows.some(workflow => workflow?.templateId === id);
    if (referenced) {
      return { ok: false, error: 'This task workflow is still in use. Deactivate it to stop using it for new plans.' };
    }
    set(current => ({
      serviceWorkflowTemplates: current.serviceWorkflowTemplates.filter(item => item.id !== id),
    }));
    return { ok: true };
  },
  createClientWithPlan: (data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    if (!canManageClientPlans(actor, state.rolePermissions)) return { ok: false, error: 'You cannot create client plans.' };
    const clientName = data.clientName.trim().slice(0, 240);
    if (!clientName) return { ok: false, error: 'Client name is required.' };
    if (state.clients.some(client => !client.discovered && normalizeClientKey(client.clientName) === normalizeClientKey(clientName))) {
      return { ok: false, error: 'This client already exists. Open the client workspace to add a plan.' };
    }
    const serviceItems = data.serviceItems.map(item => ({
      ...item,
      id: item.id || nowId('SI'),
      name: item.name.trim().slice(0, 160),
      platforms: item.platforms.map(value => value.trim()).filter(Boolean).slice(0, 20),
      unit: item.unit.trim().slice(0, 80) || 'item',
      quantity: Math.max(1, Math.trunc(item.quantity)),
      unitPriceMinor: Math.max(0, Math.trunc(item.unitPriceMinor)),
      description: cleanProfileText(item.description, 2000),
      workflow: item.workflow ? { ...item.workflow, steps: item.workflow.steps.map(step => ({ ...step })) } : undefined,
    })).filter(item => item.name);
    if (!serviceItems.length) return { ok: false, error: 'Add at least one service item.' };
    if (serviceItems.reduce((sum, item) => sum + item.quantity, 0) > 400) return { ok: false, error: 'A plan can generate at most 400 deliverables per cycle.' };
    if (!isValidIsoDate(data.startDate)) return { ok: false, error: 'Choose a valid service start date.' };
    const now = new Date().toISOString();
    const clientId = nowId('CL');
    const planId = nowId('PLN');
    const client: ClientProfile = {
      id: clientId,
      clientName,
      createdBy: actor?.id,
      contactPerson: cleanProfileText(data.contactPerson, 160),
      email: cleanProfileText(data.email, 320),
      phone: cleanProfileText(data.phone, 80),
      address: cleanProfileText(data.address, 1000),
      website: data.website?.trim() ? safeHttpsUrl(data.website) || undefined : undefined,
      facebookPage: data.facebookPage?.trim() ? safeHttpsUrl(data.facebookPage) || undefined : undefined,
      notes: cleanProfileText(data.notes, 5000),
      createdAt: now,
      updatedAt: now,
    };
    const plan: ClientServicePlan = {
      id: planId,
      clientId,
      clientName,
      name: data.planName.trim().slice(0, 160) || `${clientName} Service Plan`,
      origin: data.origin,
      sourcePackageId: data.sourcePackageId,
      sourcePackageRevision: data.sourcePackageRevision,
      revision: 1,
      status: 'Draft',
      currency: 'MYR',
      serviceItems,
      discountType: data.discountType,
      discountValue: Math.max(0, Math.trunc(data.discountValue)),
      taxRateBps: Math.min(10_000, Math.max(0, Math.trunc(data.taxRateBps))),
      startDate: data.startDate,
      billingDay: Math.min(31, Math.max(1, Math.trunc(data.billingDay))),
      contractEndDate: data.contractEndDate && isValidIsoDate(data.contractEndDate) ? data.contractEndDate : undefined,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    const pricing = makePricingSnapshot({
      id: nowId('PRICE'), clientId, parentType: 'client_plan', parentId: planId, items: serviceItems,
      discountType: plan.discountType, discountValue: plan.discountValue, taxRateBps: plan.taxRateBps, now,
    });
    set(current => ({
      clients: [...current.clients, client],
      clientPlans: [...current.clientPlans, plan],
      servicePricingSnapshots: [...current.servicePricingSnapshots, pricing],
    }));
    useToastStore.getState().addToast(msg('plan.draftCreated', { name: clientName }), 'success');
    return { ok: true, clientId, planId };
  },
  createClientPlan: (clientId, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    if (!canManageClientPlans(actor, state.rolePermissions)) return { ok: false, error: 'You cannot create client plans.' };
    const client = state.clients.find(item => item.id === clientId);
    if (!client) return { ok: false, error: 'Choose an existing company before creating a plan.' };
    if (!isServiceClientInScope(state, client.id)) return { ok: false, error: serviceClientScopeError };

    const serviceItems = data.serviceItems.map(item => ({
      ...item,
      id: item.id || nowId('SI'),
      name: item.name.trim().slice(0, 160),
      platforms: item.platforms.map(value => value.trim()).filter(Boolean).slice(0, 20),
      unit: item.unit.trim().slice(0, 80) || 'item',
      quantity: Math.max(1, Math.trunc(item.quantity)),
      unitPriceMinor: Math.max(0, Math.trunc(item.unitPriceMinor)),
      description: cleanProfileText(item.description, 2000),
      workflow: item.workflow ? { ...item.workflow, steps: item.workflow.steps.map(step => ({ ...step })) } : undefined,
    })).filter(item => item.name);
    if (!serviceItems.length) return { ok: false, error: 'Add at least one service item.' };
    if (serviceItems.reduce((sum, item) => sum + item.quantity, 0) > 400) return { ok: false, error: 'A plan can generate at most 400 deliverables per cycle.' };
    if (!isValidIsoDate(data.startDate)) return { ok: false, error: 'Choose a valid service start date.' };

    const now = new Date().toISOString();
    const planId = nowId('PLN');
    const plan: ClientServicePlan = {
      id: planId,
      clientId,
      clientName: client.clientName,
      name: data.planName.trim().slice(0, 160) || `${client.clientName} Service Plan`,
      origin: data.origin,
      sourcePackageId: data.sourcePackageId,
      sourcePackageRevision: data.sourcePackageRevision,
      revision: 1,
      status: 'Draft',
      currency: 'MYR',
      serviceItems,
      discountType: data.discountType,
      discountValue: Math.max(0, Math.trunc(data.discountValue)),
      taxRateBps: Math.min(10_000, Math.max(0, Math.trunc(data.taxRateBps))),
      startDate: data.startDate,
      billingDay: Math.min(31, Math.max(1, Math.trunc(data.billingDay))),
      contractEndDate: data.contractEndDate && isValidIsoDate(data.contractEndDate) ? data.contractEndDate : undefined,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    const pricing = makePricingSnapshot({
      id: nowId('PRICE'), clientId, parentType: 'client_plan', parentId: planId, items: serviceItems,
      discountType: plan.discountType, discountValue: plan.discountValue, taxRateBps: plan.taxRateBps, now,
    });
    set(current => ({
      clientPlans: [...current.clientPlans, plan],
      servicePricingSnapshots: [...current.servicePricingSnapshots, pricing],
    }));
    useToastStore.getState().addToast(msg('plan.createdForClient', { name: client.clientName }), 'success');
    return { ok: true, planId };
  },
  createClientPlanRevision: (planId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageClientPlans(state.currentUser, state.rolePermissions)) return { ok: false, error: 'You cannot revise client plans.' };
    const source = state.clientPlans.find(item => item.id === planId);
    if (!source || !['Active', 'Ended'].includes(source.status)) return { ok: false, error: 'Only an active or ended plan can be renewed.' };
    if (!isServiceClientInScope(state, source.clientId)) return { ok: false, error: serviceClientScopeError };
    const pending = state.clientPlans.find(item => item.supersedesPlanId === source.id && item.status === 'Draft');
    if (pending) return { ok: true, planId: pending.id };
    const now = new Date().toISOString();
    const nextPlanId = nowId('PLN');
    const revision = Math.max(0, ...state.clientPlans.filter(item => item.clientId === source.clientId).map(item => item.revision)) + 1;
    const latestCycle = state.serviceCycles
      .filter(cycle => cycle.clientId === source.clientId && cycle.planId === source.id)
      .sort((left, right) => right.periodStart.localeCompare(left.periodStart))[0];
    const effectiveFromCycleStart = source.nextCycleStart
      || (latestCycle ? nextBillingDate(latestCycle.periodStart, source.billingDay) : undefined)
      || nextBillingDate(getBillingToday(), source.billingDay);
    const nextPlan: ClientServicePlan = {
      ...source,
      id: nextPlanId,
      version: undefined,
      revision,
      status: 'Draft',
      supersedesPlanId: source.id,
      effectiveFromCycleStart,
      revisionScheduleStatus: 'draft',
      startDate: effectiveFromCycleStart,
      nextCycleStart: undefined,
      serviceItems: source.serviceItems.map(item => ({
        ...item,
        platforms: [...item.platforms],
        workflow: item.workflow ? { ...item.workflow, steps: item.workflow.steps.map(step => ({ ...step })) } : undefined,
      })),
      createdBy: state.currentUser!.id,
      createdAt: now,
      updatedAt: now,
    };
    const sourcePricing = state.servicePricingSnapshots.find(item => item.parentId === source.id);
    const pricing = makePricingSnapshot({
      id: nowId('PRICE'), clientId: source.clientId, parentType: 'client_plan', parentId: nextPlanId,
      items: nextPlan.serviceItems, discountType: sourcePricing?.discountType || source.discountType,
      discountValue: sourcePricing?.discountValue ?? source.discountValue,
      taxRateBps: sourcePricing?.taxRateBps ?? source.taxRateBps, now,
    });
    set(current => ({
      clientPlans: [...current.clientPlans, nextPlan],
      servicePricingSnapshots: [...current.servicePricingSnapshots, pricing],
    }));
    return { ok: true, planId: nextPlanId };
  },
  scheduleClientPlanRevision: (planId, effectiveDate, expectedVersion) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const plan = state.clientPlans.find(item => item.id === planId);
    if (!canManageClientPlans(state.currentUser, state.rolePermissions) || !plan || !isServiceClientInScope(state, plan.clientId)) return { ok: false, error: serviceClientScopeError };
    if (plan.status !== 'Draft' || !plan.supersedesPlanId) return { ok: false, error: 'Only a draft revision can be scheduled.' };
    if (expectedVersion !== undefined && plan.version !== expectedVersion) return { ok: false, error: 'This revision changed elsewhere. Review the saved revision before saving.' };
    const source = state.clientPlans.find(item => item.id === plan.supersedesPlanId && item.clientId === plan.clientId);
    if (!source || source.status !== 'Active') return { ok: false, error: 'Resume the active plan before scheduling a revision.' };
    const next = source.nextCycleStart || nextBillingDate(getBillingToday(), source.billingDay);
    if (next <= getBillingToday() || next !== effectiveDate) return { ok: false, error: 'The billing date changed. Refresh and review the next cycle before scheduling.' };
    const error = validateRevisionItems(plan.serviceItems);
    if (error) return { ok: false, error };
    set({ clientPlans: state.clientPlans.map(item => item.id === plan.id ? { ...item, revisionScheduleStatus: 'scheduled', startDate: next, effectiveFromCycleStart: next, updatedAt: new Date().toISOString() } : item) });
    return { ok: true };
  },
  returnClientPlanRevisionToDraft: (planId, expectedVersion) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const plan = state.clientPlans.find(item => item.id === planId);
    if (!canManageClientPlans(state.currentUser, state.rolePermissions) || !plan || !isServiceClientInScope(state, plan.clientId)) return { ok: false, error: serviceClientScopeError };
    if (plan.status !== 'Draft' || !plan.supersedesPlanId) return { ok: false, error: 'This revision is already active. Create a new revision for the next cycle.' };
    if (expectedVersion !== undefined && plan.version !== expectedVersion) return { ok: false, error: 'This revision changed elsewhere. Review the saved revision before saving.' };
    set({ clientPlans: state.clientPlans.map(item => item.id === plan.id ? { ...item, revisionScheduleStatus: 'draft', updatedAt: new Date().toISOString() } : item) });
    return { ok: true };
  },
  updateDraftClientPlan: (planId, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageClientPlans(state.currentUser, state.rolePermissions)) return { ok: false, error: 'You cannot edit client plans.' };
    const plan = state.clientPlans.find(item => item.id === planId);
    if (!plan || plan.status !== 'Draft') return { ok: false, error: 'Only draft plans can be edited.' };
    if (plan.revisionScheduleStatus === 'scheduled') return { ok: false, error: 'Return this scheduled plan to draft before editing.' };
    const itemError = validateRevisionItems(data.serviceItems || plan.serviceItems);
    if (itemError) return { ok: false, error: itemError };
    if (!isServiceClientInScope(state, plan.clientId)) return { ok: false, error: serviceClientScopeError };
    const serviceItems = (data.serviceItems || plan.serviceItems).map(item => ({
      ...item,
      name: item.name.trim().slice(0, 160),
      platforms: item.platforms.map(value => value.trim()).filter(Boolean).slice(0, 20),
      unit: item.unit.trim().slice(0, 80) || 'item',
      quantity: Math.max(1, Math.trunc(item.quantity)),
      unitPriceMinor: Math.max(0, Math.trunc(item.unitPriceMinor)),
      workflow: item.workflow ? { ...item.workflow, steps: item.workflow.steps.map(step => ({ ...step })) } : undefined,
    })).filter(item => item.name);
    if (!serviceItems.length || serviceItems.reduce((sum, item) => sum + item.quantity, 0) > 400) return { ok: false, error: 'Draft plans need 1–400 deliverable slots.' };
    const nextStartDate = data.startDate !== undefined
      ? (isValidIsoDate(data.startDate) ? data.startDate : plan.startDate)
      : plan.startDate;
    const nextBillingDay = data.billingDay !== undefined
      ? Math.min(31, Math.max(1, Math.trunc(data.billingDay)))
      : plan.billingDay;
    // Only change the contract end when the caller supplies the field; an
    // omitted key preserves the stored value. Callers clear it by passing ''.
    const nextContractEnd = data.contractEndDate !== undefined
      ? (data.contractEndDate && isValidIsoDate(data.contractEndDate) ? data.contractEndDate : undefined)
      : plan.contractEndDate;
    const contractStartDate = getPlanContractStartDate({ ...plan, startDate: nextStartDate }, state.clientPlans);
    if (nextContractEnd && nextContractEnd < contractStartDate) return { ok: false, error: 'Contract end date cannot be before the start date.' };
    const now = new Date().toISOString();
    const next: ClientServicePlan = {
      ...plan,
      ...data,
      name: data.name?.trim().slice(0, 160) || plan.name,
      serviceItems,
      startDate: nextStartDate,
      billingDay: nextBillingDay,
      discountValue: Math.max(0, Math.trunc(data.discountValue ?? plan.discountValue)),
      taxRateBps: Math.min(10_000, Math.max(0, Math.trunc(data.taxRateBps ?? plan.taxRateBps))),
      contractEndDate: nextContractEnd,
      updatedAt: now,
    };
    const pricing = makePricingSnapshot({
      id: state.servicePricingSnapshots.find(item => item.parentId === plan.id)?.id || nowId('PRICE'),
      clientId: plan.clientId, parentType: 'client_plan', parentId: plan.id, items: serviceItems,
      discountType: next.discountType, discountValue: next.discountValue, taxRateBps: next.taxRateBps, now,
    });
    set(current => ({
      clientPlans: current.clientPlans.map(item => item.id === plan.id ? next : item),
      servicePricingSnapshots: current.servicePricingSnapshots.some(item => item.parentId === plan.id)
        ? current.servicePricingSnapshots.map(item => item.parentId === plan.id ? { ...pricing, createdAt: item.createdAt } : item)
        : [...current.servicePricingSnapshots, pricing],
    }));
    return { ok: true };
  },
  updateActivePlanDates: (planId, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageClientPlans(state.currentUser, state.rolePermissions)) return { ok: false, error: 'You cannot edit client plans.' };
    const plan = state.clientPlans.find(item => item.id === planId);
    if (!plan) return { ok: false, error: 'Plan not found.' };
    if (!isServiceClientInScope(state, plan.clientId)) return { ok: false, error: serviceClientScopeError };
    if (plan.status !== 'Active' && plan.status !== 'Paused') return { ok: false, error: 'Only active or paused plans can be edited here.' };
    const nextBillingDay = data.billingDay !== undefined ? Math.min(31, Math.max(1, Math.trunc(data.billingDay))) : plan.billingDay;
    const nextContractEnd = data.contractEndDate !== undefined
      ? (data.contractEndDate && isValidIsoDate(data.contractEndDate) ? data.contractEndDate : undefined)
      : plan.contractEndDate;
    if (nextContractEnd && nextContractEnd < getPlanContractStartDate(plan, state.clientPlans)) return { ok: false, error: 'Contract end date cannot be before the start date.' };
    const now = new Date().toISOString();
    set(current => ({
      clientPlans: current.clientPlans.map(item => item.id === planId
        ? { ...item, billingDay: nextBillingDay, contractEndDate: nextContractEnd, updatedAt: now }
        : item),
    }));
    return { ok: true };
  },
  activateClientPlan: (planId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    if (!canManageClientPlans(actor, state.rolePermissions)) return { ok: false, error: 'You cannot activate client plans.' };
    const plan = state.clientPlans.find(item => item.id === planId);
    if (!plan) return { ok: false, error: 'Plan not found.' };
    if (!isServiceClientInScope(state, plan.clientId)) return { ok: false, error: serviceClientScopeError };
    if (plan.status !== 'Draft' && plan.status !== 'Paused') return { ok: false, error: 'Only draft or paused plans can be activated.' };
    if (plan.status === 'Draft' && plan.supersedesPlanId) {
      const sourcePlan = state.clientPlans.find(item => item.id === plan.supersedesPlanId && item.clientId === plan.clientId);
      if (sourcePlan?.status !== 'Ended') return { ok: false, error: 'Review and schedule this revision for the next billing cycle.' };
    }
    if (state.clientPlans.some(item => item.clientId === plan.clientId && item.id !== plan.id && item.status === 'Active')) {
      return { ok: false, error: 'This client already has an active plan.' };
    }
    const periodStart = plan.status === 'Paused' ? nextBillingDate(getBillingToday(), plan.billingDay) : plan.startDate;
    const existing = state.serviceCycles.find(cycle => cycle.planId === plan.id && cycle.periodStart === periodStart);
    const records = existing ? null : makeCycleRecords(plan, state.addons.filter(addon => addon.clientId === plan.clientId), periodStart, nowId);
    const now = new Date().toISOString();
    const cyclePricing = records ? makePricingSnapshot({
      id: nowId('PRICE'), clientId: plan.clientId, parentType: 'service_cycle', parentId: records.cycle.id,
      items: records.cycle.serviceItems, discountType: plan.discountType, discountValue: plan.discountValue, taxRateBps: plan.taxRateBps, now,
    }) : undefined;
    if (records && cyclePricing) records.cycle.pricingSnapshotId = cyclePricing.id;
    set(current => ({
      clientPlans: current.clientPlans.map(item => item.id === plan.id ? {
        ...item,
        status: 'Active',
        nextCycleStart: nextBillingDate(periodStart, item.billingDay),
        updatedAt: now,
      } : item),
      serviceCycles: records ? [...current.serviceCycles, records.cycle] : current.serviceCycles,
      deliverables: records ? [...current.deliverables, ...records.deliverables] : current.deliverables,
      servicePricingSnapshots: cyclePricing ? [...current.servicePricingSnapshots, cyclePricing] : current.servicePricingSnapshots,
    }));
    useToastStore.getState().addToast(msg('plan.activated', { name: plan.name }), 'success');
    return { ok: true, cycleId: existing?.id || records?.cycle.id };
  },
  generateDueLocalServiceCycles: () => {
    const state = get();
    // Shared workspaces use the database's scheduled, transactional generator.
    if (state.backend.mode !== 'local' || state.backend.isLoading || isWorkspaceMutationLocked(state)
      || !canManageClientPlans(state.currentUser, state.rolePermissions)) return;
    const today = getBillingToday();
    const now = new Date().toISOString();
    const plans = [...state.clientPlans];
    const cycles: ServiceCycle[] = [];
    const deliverables: Deliverable[] = [];
    const prices: ServicePricingSnapshot[] = [];
    let changed = false;
    for (const source of state.clientPlans.filter(plan => plan.status === 'Active' && isServiceClientInScope(state, plan.clientId))) {
      let plan = source;
      let start = plan.nextCycleStart || plan.startDate;
      if (!isValidIsoDate(start)) continue;
      while (start <= today) {
        const revision = plans.filter(item => item.status === 'Draft' && item.revisionScheduleStatus === 'scheduled' && item.supersedesPlanId === plan.id
          && item.effectiveFromCycleStart && item.effectiveFromCycleStart <= start)
          .sort((a, b) => b.revision - a.revision)[0];
        if (revision) {
          plans[plans.findIndex(item => item.id === plan.id)] = { ...plan, status: 'Ended', updatedAt: now };
          plan = { ...revision, status: 'Active', updatedAt: now };
        }
        if (!Number.isInteger(plan.billingDay) || plan.billingDay < 1 || plan.billingDay > 31) break;
        // Match the database uniqueness rule: one cycle per client and start date.
        if (![...state.serviceCycles, ...cycles].some(cycle => cycle.clientId === plan.clientId && cycle.periodStart === start)) {
          const records = makeCycleRecords(plan, state.addons.filter(addon => addon.clientId === plan.clientId), start, nowId, now);
          const price = makePricingSnapshot({
            id: nowId('PRICE'), clientId: plan.clientId, parentType: 'service_cycle', parentId: records.cycle.id,
            items: records.cycle.serviceItems, discountType: plan.discountType,
            discountValue: plan.discountValue, taxRateBps: plan.taxRateBps, now,
          });
          records.cycle.pricingSnapshotId = price.id;
          cycles.push(records.cycle); deliverables.push(...records.deliverables); prices.push(price);
        }
        start = nextBillingDate(start, plan.billingDay);
        plan = { ...plan, nextCycleStart: start, updatedAt: now };
        plans[plans.findIndex(item => item.id === plan.id)] = plan;
        changed = true;
      }
    }
    if (!changed) return;
    set({
      clientPlans: plans,
      serviceCycles: [...state.serviceCycles, ...cycles],
      deliverables: [...state.deliverables, ...deliverables],
      servicePricingSnapshots: [...state.servicePricingSnapshots, ...prices],
    });
  },
  setClientPlanStatus: (planId, status) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    if (!canManageClientPlans(actor, state.rolePermissions)) return { ok: false, error: 'You cannot change plan status.' };
    const plan = state.clientPlans.find(item => item.id === planId);
    if (!plan) return { ok: false, error: 'Plan not found.' };
    if (!isServiceClientInScope(state, plan.clientId)) return { ok: false, error: serviceClientScopeError };
    if (status === 'Active') return { ok: false, error: 'Use Activate to start or resume this plan.' };
    if (plan.status === 'Ended') return { ok: false, error: 'Ended plans cannot be reopened.' };
    const hasStartedCycle = state.serviceCycles.some(cycle => cycle.planId === plan.id && cycle.status !== 'Draft');
    if (plan.status === 'Active' && status === 'Draft' && hasStartedCycle) {
      return { ok: false, error: 'Active plans with started cycles cannot return to Draft.' };
    }
    set(current => ({ clientPlans: current.clientPlans.map(item => item.id === planId ? { ...item, status, updatedAt: new Date().toISOString() } : item) }));
    return { ok: true };
  },
  setServiceCycleStatus: (cycleId, status) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const cycle = state.serviceCycles.find(item => item.id === cycleId);
    const actor = state.currentUser;
    if (!cycle || !actor) return { ok: false, error: 'Cycle not found.' };
    if (!isServiceClientInScope(state, cycle.clientId)) return { ok: false, error: serviceClientScopeError };
    if (!canManageServiceCycles(actor, state.rolePermissions)) return { ok: false, error: 'You do not have permission to manage service cycles.' };
    if (status === cycle.status) return { ok: true };
    if (!allowedServiceCycleTransitions[cycle.status].includes(status)) {
      return { ok: false, error: 'This cycle status transition is not allowed.' };
    }
    if (status === 'Completed') {
      const cycleDeliverables = state.deliverables.filter(item => item.cycleId === cycle.id && item.clientId === cycle.clientId);
      const allDelivered = cycleDeliverables.length > 0 && cycleDeliverables.every(
        deliverable => resolveDeliverableStatus(deliverable, state.tasks, state.serviceCycles) === 'Delivered',
      );
      if (!allDelivered) return { ok: false, error: 'Complete every required delivery before completing this cycle.' };
    }
    const now = new Date().toISOString();
    set(current => ({ serviceCycles: current.serviceCycles.map(item => item.id === cycleId ? { ...item, status, publishedAt: status === 'Published' ? item.publishedAt || now : item.publishedAt, updatedAt: now } : item) }));
    return { ok: true };
  },
  updateDeliverableStatus: (deliverableId, status) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const deliverable = state.deliverables.find(item => item.id === deliverableId);
    const actor = state.currentUser;
    if (!deliverable || !actor) return { ok: false, error: 'Deliverable not found.' };
    if (!isServiceClientInScope(state, deliverable.clientId)) return { ok: false, error: serviceClientScopeError };
    const authorized = canManageServiceCycles(actor, state.rolePermissions) || (['Staff', 'HOD'].includes(actor.role) && state.tasks.some(task => (task.deliverableId === deliverable.id || deliverable.taskIds.includes(task.id)) && task.assignedTo === actor.id));
    if (!authorized || (!canManageServiceCycles(actor, state.rolePermissions) && !canOpenServiceClient(actor, deliverable.clientName, state.tasks, state.rolePermissions, state.clients))) return { ok: false, error: 'You do not have access to this deliverable.' };
    if (!canSetDeliverableStatus(deliverable, status, state.tasks, state.serviceCycles, state.backend.mode === 'supabase')) return { ok: false, error: 'Deliverable status must match the progress of its required tasks.' };
    set(current => {
      const now = new Date().toISOString();
      const deliverables = current.deliverables.map(item => item.id === deliverableId ? {
        ...item,
        status,
        deliveredAt: status === 'Delivered' ? item.deliveredAt || now : undefined,
        updatedAt: now,
      } : item);
      const derived = deriveServiceProgress(get(), current.tasks, deliverables, current.serviceCycles);
      return derived;
    });
    return { ok: true };
  },
  unlinkInvalidTaskDelivery: (taskId) => {
    const state = get();
    const task = state.tasks.find(item => item.id === taskId);
    if (!task || !hasInvalidDeliveryLink(task, state.deliverables)) return { ok: false, error: 'Only invalid delivery links can be removed here.' };
    return get().linkTaskToDeliverable(taskId);
  },
  linkTaskToDeliverable: (taskId, cycleId, deliverableId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const task = state.tasks.find(item => item.id === taskId);
    if (!task || !canEditTask(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) return { ok: false, error: 'You cannot edit this task.' };
    if (isWorkflowTask(task) && (cycleId !== task.serviceCycleId || deliverableId !== task.deliverableId)) return { ok: false, error: 'Workflow identity and review records cannot be edited directly.' };
    const deliverable = deliverableId ? state.deliverables.find(item => item.id === deliverableId) : undefined;
    if (deliverableId && (!deliverable || deliverable.cycleId !== cycleId || deliverable.clientId !== task.clientId)) return { ok: false, error: 'The task and deliverable must belong to the same client and cycle.' };
    if (deliverable?.status === 'Delivered' && task.deliverableId !== deliverable.id && !deliverable.taskIds.includes(taskId)) return { ok: false, error: 'Reopen the delivery before adding task links.' };
    if (deliverableId && ((task.deliverableId && task.deliverableId !== deliverableId) || state.deliverables.some(item => item.id !== deliverableId && item.taskIds.includes(taskId)))) return { ok: false, error: 'This task is already linked to another deliverable.' };
    const now = new Date().toISOString();
    set(current => {
      const tasks = current.tasks.map(item => item.id === taskId ? { ...item, serviceCycleId: cycleId, deliverableId, updatedAt: now } : item);
      const deliverables = current.deliverables.map(item => {
        const isTarget = item.id === deliverableId;
        const wasLinked = item.taskIds.includes(taskId);
        if (!isTarget && !wasLinked) return item;
        return {
          ...item,
          taskIds: isTarget
            ? Array.from(new Set([...item.taskIds, taskId]))
            : item.taskIds.filter(id => id !== taskId),
          // Unlinking a task must not leave a dangling primary reference.
          primaryTaskId: !isTarget && item.primaryTaskId === taskId ? undefined : item.primaryTaskId,
          updatedAt: wasLinked || isTarget ? now : item.updatedAt,
        };
      });
      return { tasks, ...deriveServiceProgress(get(), tasks, deliverables, current.serviceCycles) };
    });
    return { ok: true };
  },
  generateDeliverableTaskChain: (deliverableId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    if (!actor || !canManageServiceCycles(actor, state.rolePermissions)) return { ok: false, error: 'Only authorized operations staff can generate task chains.' };
    const deliverable = state.deliverables.find(item => item.id === deliverableId);
    if (!deliverable) return { ok: false, error: 'Deliverable not found.' };
    if (!isServiceClientInScope(state, deliverable.clientId)) return { ok: false, error: serviceClientScopeError };
    const cycle = state.serviceCycles.find(item => item.id === deliverable.cycleId);
    const serviceItem = cycle?.serviceItems.find(item => item.id === deliverable.serviceItemId);
    const workflow = serviceItem?.workflow;
    if (!cycle || !workflow?.steps.length) return { ok: false, error: 'This service item has no saved task steps to include in the cycle.' };
    const existing = state.tasks.filter(task => task.deliverableId === deliverable.id && task.generatedFromDeliverable);
    if (existing.length) return { ok: true, taskIds: existing.sort((a, b) => (a.workflowStepOrder || 0) - (b.workflowStepOrder || 0)).map(task => task.id) };
    if (!canCreateTasks(actor, state.rolePermissions)) return { ok: false, error: 'You do not have permission to create tasks.' };
    if (deliverable.status === 'Delivered') return { ok: false, error: 'Reopen the delivery before adding task links.' };
    const generationId = nowId('WFG');
    const now = new Date().toISOString();
    const startDate = cycle.periodStart;
    const taskIds = workflow.steps.map(() => nowId('T'));
    const tasks: Task[] = workflow.steps.map((step, index) => ({
      id: taskIds[index],
      clientId: deliverable.clientId,
      serviceCycleId: cycle.id,
      deliverableId: deliverable.id,
      visibility: step.clientVisible ? 'client-visible' : 'internal',
      workflowTemplateId: workflow.templateId,
      workflowTemplateRevision: workflow.templateRevision,
      workflowStepId: step.id,
      workflowStepOrder: step.order,
      workflowStepRequired: step.required,
      workflowStepKind: step.kind,
      workflowOutputVersion: 1,
      predecessorTaskIds: index === 0 ? [] : [taskIds[index - 1]],
      generatedFromDeliverable: true,
      workflowGeneratedAt: now,
      clientName: deliverable.clientName,
      projectName: `${deliverable.clientName} service cycle`,
      serviceType: serviceItem.name,
      title: `${String(step.order).padStart(2, '0')}. ${step.title} — ${deliverable.title}`,
      description: step.description || `${step.title} for ${deliverable.title}`,
      department: step.department,
      assignedTo: '',
      createdBy: actor.id,
      startDate,
      dueDate: addDaysClamped(cycle.periodStart, step.dueOffsetDays, cycle.periodEnd),
      priority: 'Medium',
      status: 'Pending',
      completionPercentage: 0,
      isCompleted: false,
      revisionCount: 0,
      clientApprovalStatus: 'Pending',
      isRecurring: false,
      comments: [],
      approvalHistory: [],
      updatedAt: now,
    }));
    const nextDeliverables = state.deliverables.map(item => item.id === deliverable.id ? {
      ...item,
      taskIds: [...item.taskIds, ...taskIds],
      workflowGeneratedAt: now,
      workflowGenerationId: generationId,
      updatedAt: now,
    } : item);
    set({ tasks: [...state.tasks, ...tasks], ...deriveServiceProgress(get(), [...state.tasks, ...tasks], nextDeliverables, state.serviceCycles) });
    return { ok: true, taskIds };
  },
  carryForwardTaskToCycle: (taskId, targetCycleId, targetDeliverableId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    const source = state.tasks.find(task => task.id === taskId);
    const targetCycle = state.serviceCycles.find(cycle => cycle.id === targetCycleId);
    if (!actor || !source || !targetCycle) return { ok: false, error: 'The source task or target cycle is no longer available.' };
    if (!canManageServiceCycles(actor, state.rolePermissions) || !canCreateTasks(actor, state.rolePermissions)) {
      return { ok: false, error: 'Only authorised internal users can carry work into a new cycle.' };
    }
    if (source.clientId !== targetCycle.clientId || !source.serviceCycleId) {
      return { ok: false, error: 'The source task and target cycle must belong to the same client.' };
    }
    if (!isServiceClientInScope(state, targetCycle.clientId)) return { ok: false, error: serviceClientScopeError };
    const sourceCycle = state.serviceCycles.find(cycle => cycle.id === source.serviceCycleId && cycle.clientId === source.clientId);
    if (!sourceCycle || targetCycle.periodStart <= sourceCycle.periodStart) {
      return { ok: false, error: 'Choose a later service cycle for carry-forward.' };
    }
    if (!isTaskOpen(source)) return { ok: false, error: 'Only unresolved tasks can be carried forward.' };
    if (targetCycle.status === 'Cancelled') return { ok: false, error: 'Cancelled cycles cannot receive carried work.' };
    const sourceDeliverable = source.deliverableId
      ? state.deliverables.find(item => item.id === source.deliverableId && item.clientId === source.clientId && item.cycleId === source.serviceCycleId)
      : undefined;
    const targetDeliverable = targetDeliverableId
      ? state.deliverables.find(item => item.id === targetDeliverableId && item.clientId === targetCycle.clientId && item.cycleId === targetCycle.id)
      : sourceDeliverable
        ? state.deliverables
          .filter(item => item.clientId === targetCycle.clientId && item.cycleId === targetCycle.id && item.serviceItemId === sourceDeliverable.serviceItemId)
          .sort((left, right) => left.sequence - right.sequence)[0]
        : undefined;
    if (targetDeliverableId && !targetDeliverable) return { ok: false, error: 'The target deliverable is not part of the selected cycle.' };
    const existing = state.tasks.find(task => task.carriedFromTaskId === source.id && task.serviceCycleId === targetCycle.id);
    if (existing) return { ok: true, taskId: existing.id };
    if (targetDeliverable?.status === 'Delivered') return { ok: false, error: 'Reopen the target delivery before carrying work into it.' };

    const now = new Date().toISOString();
    const safeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
    const carriedId = `T-CARRY-${safeIdPart(source.id)}-${safeIdPart(targetCycle.id)}`;
    const assignee = state.users.find(user => user.id === source.assignedTo && user.role !== 'Client' && isEligibleTaskAssignee(user, source.department));
    const carried: Task = {
      ...source,
      id: carriedId,
      version: undefined,
      updatedAt: now,
      serviceCycleId: targetCycle.id,
      deliverableId: targetDeliverable?.id,
      startDate: targetCycle.periodStart,
      dueDate: targetCycle.periodEnd,
      assignedTo: assignee?.id || '',
      createdBy: actor.id,
      assignedBy: assignee ? actor.id : undefined,
      assignedAt: assignee ? now : undefined,
      status: 'Pending',
      completionPercentage: 0,
      isCompleted: false,
      completedAt: undefined,
      revisionCount: 0,
      clientApprovalStatus: 'Pending',
      isRecurring: false,
      dueReminderSent: false,
      attachmentLink: undefined,
      attachmentName: undefined,
      outputAttachments: [],
      reviewDecision: undefined,
      reviewOverrideReason: undefined,
      reviewEvidence: undefined,
      reviewAccess: undefined,
      internalReview: undefined,
      comments: [],
      approvalHistory: [],
      workState: {},
      workHistory: [],
      predecessorTaskIds: [],
      generatedFromDeliverable: false,
      workflowGeneratedAt: undefined,
      carriedFromTaskId: source.id,
      carriedFromCycleId: source.serviceCycleId,
      carriedForwardAt: now,
      notes: [source.notes, `Carried forward from ${sourceCycle.periodStart} – ${sourceCycle.periodEnd}.`].filter(Boolean).join('\n'),
    };
    const tasks = [...state.tasks, carried];
    const deliverables = targetDeliverable
      ? state.deliverables.map(item => item.id === targetDeliverable.id
        ? { ...item, taskIds: Array.from(new Set([...item.taskIds, carried.id])), updatedAt: now }
        : item)
      : state.deliverables;
    set({ tasks, ...deriveServiceProgress(get(), tasks, deliverables, state.serviceCycles) });
    queueActionFeedback(actor.id, `task:${carried.id}:create`, msg('task.created', { title: carried.title }), saved => saved.tasks.some(item => item.id === carried.id && item.carriedFromTaskId === source.id));
    return { ok: true, taskId: carried.id };
  },
  addCycleComment: (cycleId, text, visibility) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const cycle = state.serviceCycles.find(item => item.id === cycleId);
    const actor = state.currentUser;
    if (!cycle || !actor || actor.role === 'Client') return { ok: false, error: 'You cannot comment on this cycle.' };
    if (!isServiceClientInScope(state, cycle.clientId)) return { ok: false, error: serviceClientScopeError };
    const authorized = canManageServiceCycles(actor, state.rolePermissions)
      || (canOpenServiceClient(actor, cycle.clientName, state.tasks, state.rolePermissions, state.clients, state.projects) && state.tasks.some(task => task.serviceCycleId === cycle.id && task.assignedTo === actor.id));
    const clean = text.trim().slice(0, 10_000);
    if (!authorized || !clean) return { ok: false, error: authorized ? 'Comment cannot be empty.' : 'You do not have access to this cycle.' };
    const now = new Date().toISOString();
    const item: CycleComment = { id: nowId('CC'), clientId: cycle.clientId, clientName: cycle.clientName, cycleId, userId: actor.id, text: clean, visibility, attachments: [], createdAt: now, updatedAt: now };
    set(current => ({ cycleComments: [...current.cycleComments, item] }));
    return { ok: true, id: item.id };
  },
  addCycleCommentAttachment: (commentId, attachment) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const comment = state.cycleComments.find(item => item.id === commentId);
    if (!comment || comment.userId !== state.currentUser?.id) return { ok: false, error: 'You cannot attach a file to this comment.' };
    if (!isServiceClientInScope(state, comment.clientId)) return { ok: false, error: serviceClientScopeError };
    const authorized = canManageServiceCycles(state.currentUser, state.rolePermissions)
      || (canOpenServiceClient(state.currentUser, comment.clientName, state.tasks, state.rolePermissions, state.clients, state.projects)
        && state.tasks.some(task => task.serviceCycleId === comment.cycleId && task.assignedTo === state.currentUser?.id));
    if (!authorized) return { ok: false, error: 'You do not have access to this cycle.' };
    set(current => ({ cycleComments: current.cycleComments.map(item => item.id === commentId ? { ...item, attachments: [...item.attachments, attachment], updatedAt: new Date().toISOString() } : item) }));
    return { ok: true };
  },
  addAddon: (data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    if (!canManageClientPlans(actor, state.rolePermissions)) return { ok: false, error: 'You cannot manage add-ons.' };
    if (!state.clientPlans.some(plan => plan.id === data.planId && plan.clientId === data.clientId)) return { ok: false, error: 'Client plan not found.' };
    if (!isServiceClientInScope(state, data.clientId)) return { ok: false, error: serviceClientScopeError };
    const name = data.name.trim().slice(0, 160);
    if (!name) return { ok: false, error: 'Add-on name is required.' };
    if (data.billingMode === 'one_off' && !data.targetCycleId) return { ok: false, error: 'Choose the cycle for this one-off add-on.' };
    if (data.targetCycleId && !state.serviceCycles.some(cycle => cycle.id === data.targetCycleId && cycle.clientId === data.clientId && cycle.planId === data.planId)) return { ok: false, error: 'Choose a cycle from this client plan.' };
    if (!isValidIsoDate(data.effectiveFrom)) return { ok: false, error: 'Choose a valid effective date.' };
    const now = new Date().toISOString();
    const id = nowId('ADD');
    const pricingSnapshotId = nowId('PRICE');
    const item: Addon = { ...data, id, pricingSnapshotId, name, platforms: data.platforms.map(value => value.trim()).filter(Boolean).slice(0, 20), quantity: Math.max(1, Math.trunc(data.quantity)), unitPriceMinor: Math.max(0, Math.trunc(data.unitPriceMinor)), description: cleanProfileText(data.description, 2000), createdAt: now, updatedAt: now };
    const pricing = makePricingSnapshot({ id: pricingSnapshotId, clientId: item.clientId, parentType: 'addon', parentId: id, addonUnitPriceMinor: item.unitPriceMinor, addonQuantity: item.quantity, now });
    set(current => ({
      addons: [...current.addons, item],
      servicePricingSnapshots: [...current.servicePricingSnapshots, pricing],
      serviceCycles: current.serviceCycles.map(cycle => {
        const applies = cycle.status === 'Draft' && (
          (item.billingMode === 'one_off' && item.targetCycleId === cycle.id)
          || (item.billingMode === 'monthly' && cycle.planId === item.planId && cycle.periodStart >= item.effectiveFrom)
        );
        return applies ? { ...cycle, addonSnapshots: [...cycle.addonSnapshots, item], updatedAt: now } : cycle;
      }),
    }));
    return { ok: true, id: item.id };
  },
  setAddonActive: (addonId, isActive, effectiveUntil) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!canManageClientPlans(state.currentUser, state.rolePermissions)) return { ok: false, error: 'You cannot manage add-ons.' };
    const addon = state.addons.find(item => item.id === addonId);
    if (!addon) return { ok: false, error: 'Add-on not found.' };
    if (!isServiceClientInScope(state, addon.clientId)) return { ok: false, error: serviceClientScopeError };
    if (effectiveUntil && !isValidIsoDate(effectiveUntil)) return { ok: false, error: 'Choose a valid ending date.' };
    const now = new Date().toISOString();
    set(current => ({ addons: current.addons.map(item => item.id === addonId ? { ...item, isActive, effectiveUntil: isActive ? effectiveUntil : effectiveUntil || getTodayInputDate(), updatedAt: now } : item) }));
    return { ok: true };
  }
});
