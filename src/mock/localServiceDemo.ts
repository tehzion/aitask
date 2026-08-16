import type {
  Addon,
  AttachmentRef,
  ClientProfile,
  ClientServicePlan,
  Deliverable,
  ServiceCycle,
  ServiceItem,
  ServicePackage,
  ServicePricingSnapshot,
  ServiceWorkflowTemplate,
  Task,
  User,
  CycleComment,
} from '../types';
import {
  clampBillingDate,
  cyclePeriodEnd,
  makePricingSnapshot,
  SHORT_VIDEO_WORKFLOW_TEMPLATE,
  snapshotWorkflow,
} from '../lib/serviceManagement';
import { getTodayInputDate } from '../lib/utils';

export const LOCAL_SERVICE_DEMO_VERSION = '2026-08-16.1';
export const LOCAL_SERVICE_DEMO_VERSION_KEY = 'aitask:local-service-demo-version';
export const LOCAL_SERVICE_DEMO_ID_PREFIX = 'demo-service-';
export const LOCAL_SERVICE_DEMO_BUCKET = 'local-service-demo';
export const LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID = 'demo-service-client-urban';

export const LOCAL_SERVICE_DEMO_USER_IDS = {
  operation: 'u-operation-demo-local',
  account: 'u-account-demo-local',
} as const;

export const isLocalServiceDemoEnabled = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const configuredBackend = (import.meta.env.VITE_AITASK_BACKEND as string | undefined)?.trim().toLowerCase();
  return configuredBackend === 'local' && ['localhost', '127.0.0.1', '::1'].includes(host);
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const monthStart = (date: string, offset = 0) => {
  const source = new Date(`${date}T00:00:00.000Z`);
  return isoDate(new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + offset, 1)));
};

const addDays = (date: string, days: number) => {
  const source = new Date(`${date}T00:00:00.000Z`);
  source.setUTCDate(source.getUTCDate() + days);
  return isoDate(source);
};

const dateWithinCycle = (date: string, cycleEnd: string) => (
  date > cycleEnd ? cycleEnd : date
);

const cloneWorkflow = () => snapshotWorkflow({
  ...SHORT_VIDEO_WORKFLOW_TEMPLATE,
  steps: SHORT_VIDEO_WORKFLOW_TEMPLATE.steps.map(step => ({ ...step })),
});

const cloneItem = (item: ServiceItem): ServiceItem => ({
  ...item,
  platforms: [...item.platforms],
  workflow: item.workflow
    ? { ...item.workflow, steps: item.workflow.steps.map(step => ({ ...step })) }
    : undefined,
});

const cloneAddon = (addon: Addon): Addon => ({ ...addon, platforms: [...addon.platforms] });

const cloneTemplate = (template: ServiceWorkflowTemplate): ServiceWorkflowTemplate => ({
  ...template,
  steps: template.steps.map(step => ({ ...step })),
});

const hasDemoId = (id: string | undefined) => Boolean(id?.startsWith(LOCAL_SERVICE_DEMO_ID_PREFIX));

export const isLocalServiceDemoRecordId = hasDemoId;

export const getLocalServiceDemoFile = (attachment: AttachmentRef) => {
  if (attachment.bucket !== LOCAL_SERVICE_DEMO_BUCKET || attachment.id !== 'demo-service-file-urban-brief') return undefined;
  return {
    content: [
      'UrbanEats — September short-form content brief',
      '',
      'Goal: show the new lunch bundle in a clear, energetic 20-second vertical video.',
      'Audience: office teams around KL city centre.',
      'Required platforms: TikTok and Instagram Reels.',
      'Review notes are tracked in the client-visible approval steps.',
    ].join('\n'),
    mimeType: 'text/plain;charset=utf-8',
  };
};

export interface LocalServiceDemoFixture {
  users: User[];
  clients: ClientProfile[];
  servicePackages: ServicePackage[];
  clientPlans: ClientServicePlan[];
  serviceCycles: ServiceCycle[];
  deliverables: Deliverable[];
  tasks: Task[];
  cycleComments: CycleComment[];
  addons: Addon[];
  serviceWorkflowTemplates: ServiceWorkflowTemplate[];
  servicePricingSnapshots: ServicePricingSnapshot[];
}

export const createLocalServiceDemoFixture = (
  today = getTodayInputDate(),
  now = `${getTodayInputDate()}T08:00:00.000Z`,
): LocalServiceDemoFixture => {
  const currentStart = monthStart(today);
  const previousStart = monthStart(today, -1);
  const nextStart = monthStart(today, 1);
  const previousEnd = cyclePeriodEnd(previousStart, 1);
  const currentEnd = cyclePeriodEnd(currentStart, 1);
  // Keep the demo workflow in the final third of the active cycle. It stays
  // visibly current while leaving room for a user's own calendar entries.
  const workflowStart = addDays(currentEnd, -9);
  const nextTechCycleStart = clampBillingDate(
    new Date(`${nextStart}T00:00:00.000Z`).getUTCFullYear(),
    new Date(`${nextStart}T00:00:00.000Z`).getUTCMonth(),
    1,
  );

  const workflow = cloneWorkflow();
  const packageVideo: ServiceItem = {
    id: 'demo-service-item-package-video',
    name: 'Short Video',
    platforms: ['TikTok', 'Instagram Reels'],
    unit: 'video',
    quantity: 3,
    unitPriceMinor: 95000,
    description: 'Concept-to-posting short-form video production.',
    workflow,
  };
  const packageSocial: ServiceItem = {
    id: 'demo-service-item-package-social',
    name: 'Social Content',
    platforms: ['Instagram', 'Facebook'],
    unit: 'post',
    quantity: 4,
    unitPriceMinor: 35000,
    description: 'Monthly social content assets and publishing-ready captions.',
  };
  const growthPackage: ServicePackage = {
    id: 'demo-service-package-growth',
    name: 'Growth Plan',
    description: 'A reusable monthly content package with frozen production workflow snapshots.',
    revision: 1,
    currency: 'MYR',
    serviceItems: [cloneItem(packageVideo), cloneItem(packageSocial)],
    discountType: 'none',
    discountValue: 0,
    taxRateBps: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const urbanVideo: ServiceItem = { ...cloneItem(packageVideo), id: 'demo-service-item-urban-video' };
  const urbanSocial: ServiceItem = { ...cloneItem(packageSocial), id: 'demo-service-item-urban-social' };
  const techVideo: ServiceItem = {
    ...cloneItem(packageVideo),
    id: 'demo-service-item-tech-video',
    quantity: 5,
    platforms: ['TikTok', 'YouTube Shorts'],
    unitPriceMinor: 88000,
  };
  const techSocial: ServiceItem = {
    ...cloneItem(packageSocial),
    id: 'demo-service-item-tech-social',
    quantity: 2,
    platforms: ['LinkedIn'],
    unitPriceMinor: 42000,
  };

  const clients: ClientProfile[] = [
    {
      id: LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID,
      clientName: 'UrbanEats',
      contactPerson: 'Aisha Rahman',
      email: 'aisha@urbaneats.example',
      phone: '+60 12 555 0188',
      website: 'https://urbaneats.example',
      notes: 'Local service demo: standard package with live delivery workflow.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-service-client-technova',
      clientName: 'TechNova',
      contactPerson: 'Daniel Lim',
      email: 'daniel@technova.example',
      phone: '+60 12 555 0199',
      website: 'https://technova.example',
      notes: 'Local service demo: duplicated package with client-specific changes and a scheduled revision.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-service-client-ecolife',
      clientName: 'EcoLife',
      contactPerson: 'Mei Tan',
      email: 'mei@ecolife.example',
      phone: '+60 12 555 0200',
      website: 'https://ecolife.example',
      notes: 'Local service demo: fully custom draft awaiting scope confirmation.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const urbanPlan: ClientServicePlan = {
    id: 'demo-service-plan-urban-active',
    clientId: LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID,
    clientName: 'UrbanEats',
    name: 'Growth Plan',
    origin: 'standard',
    sourcePackageId: growthPackage.id,
    sourcePackageRevision: growthPackage.revision,
    revision: 1,
    status: 'Active',
    currency: 'MYR',
    serviceItems: [cloneItem(urbanVideo), cloneItem(urbanSocial)],
    discountType: 'none',
    discountValue: 0,
    taxRateBps: 0,
    startDate: previousStart,
    billingDay: 1,
    nextCycleStart: nextStart,
    contractEndDate: monthStart(today, 5),
    createdBy: 'u-admin',
    createdAt: now,
    updatedAt: now,
  };
  const techPlan: ClientServicePlan = {
    id: 'demo-service-plan-technova-active',
    clientId: 'demo-service-client-technova',
    clientName: 'TechNova',
    name: 'Growth Plan — TechNova',
    origin: 'customized',
    sourcePackageId: growthPackage.id,
    sourcePackageRevision: growthPackage.revision,
    revision: 1,
    status: 'Active',
    currency: 'MYR',
    serviceItems: [cloneItem(techVideo), cloneItem(techSocial)],
    discountType: 'percent',
    discountValue: 500,
    taxRateBps: 0,
    startDate: previousStart,
    billingDay: 1,
    nextCycleStart: nextTechCycleStart,
    contractEndDate: monthStart(today, 2),
    createdBy: 'u-admin',
    createdAt: now,
    updatedAt: now,
  };
  const techRevision: ClientServicePlan = {
    ...techPlan,
    id: 'demo-service-plan-technova-revision',
    name: 'Growth Plan — TechNova revision 2',
    revision: 2,
    status: 'Draft',
    serviceItems: [
      { ...cloneItem(techVideo), quantity: 6 },
      cloneItem(techSocial),
    ],
    supersedesPlanId: techPlan.id,
    effectiveFromCycleStart: nextTechCycleStart,
    nextCycleStart: undefined,
    updatedAt: now,
  };
  const ecoPlan: ClientServicePlan = {
    id: 'demo-service-plan-ecolife-draft',
    clientId: 'demo-service-client-ecolife',
    clientName: 'EcoLife',
    name: 'EcoLife Custom Scope',
    origin: 'custom',
    revision: 1,
    status: 'Draft',
    currency: 'MYR',
    serviceItems: [],
    discountType: 'none',
    discountValue: 0,
    taxRateBps: 0,
    startDate: nextStart,
    billingDay: 1,
    contractEndDate: monthStart(today, 12),
    createdBy: 'u-admin',
    createdAt: now,
    updatedAt: now,
  };

  const monthlyAddon: Addon = {
    id: 'demo-service-addon-urban-monthly',
    clientId: urbanPlan.clientId,
    clientName: urbanPlan.clientName,
    planId: urbanPlan.id,
    name: 'Community Management',
    platforms: ['Instagram'],
    quantity: 1,
    unitPriceMinor: 45000,
    description: 'Monthly community-management coverage for campaign posts.',
    billingMode: 'monthly',
    effectiveFrom: currentStart,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const oneOffAddon: Addon = {
    id: 'demo-service-addon-urban-oneoff',
    clientId: urbanPlan.clientId,
    clientName: urbanPlan.clientName,
    planId: urbanPlan.id,
    name: 'Menu Launch Cutdown',
    platforms: ['TikTok'],
    quantity: 1,
    unitPriceMinor: 28000,
    description: 'A one-off 10-second launch cutdown for this cycle only.',
    billingMode: 'one_off',
    targetCycleId: 'demo-service-cycle-urban-current',
    effectiveFrom: currentStart,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const currentUrbanCycle: ServiceCycle = {
    id: 'demo-service-cycle-urban-current',
    clientId: urbanPlan.clientId,
    clientName: urbanPlan.clientName,
    planId: urbanPlan.id,
    planRevision: urbanPlan.revision,
    periodStart: currentStart,
    periodEnd: currentEnd,
    status: 'Published',
    currency: 'MYR',
    serviceItems: urbanPlan.serviceItems.map(cloneItem),
    addonSnapshots: [cloneAddon(monthlyAddon), cloneAddon(oneOffAddon)],
    discountType: urbanPlan.discountType,
    discountValue: urbanPlan.discountValue,
    taxRateBps: urbanPlan.taxRateBps,
    publishedAt: now,
    pricingSnapshotId: 'demo-service-price-urban-cycle-current',
    createdAt: now,
    updatedAt: now,
  };
  const previousUrbanCycle: ServiceCycle = {
    ...currentUrbanCycle,
    id: 'demo-service-cycle-urban-previous',
    periodStart: previousStart,
    periodEnd: previousEnd,
    status: 'Completed',
    addonSnapshots: [],
    pricingSnapshotId: 'demo-service-price-urban-cycle-previous',
  };
  const currentTechCycle: ServiceCycle = {
    id: 'demo-service-cycle-technova-current',
    clientId: techPlan.clientId,
    clientName: techPlan.clientName,
    planId: techPlan.id,
    planRevision: techPlan.revision,
    periodStart: currentStart,
    periodEnd: currentEnd,
    status: 'Draft',
    currency: 'MYR',
    serviceItems: techPlan.serviceItems.map(cloneItem),
    addonSnapshots: [],
    discountType: techPlan.discountType,
    discountValue: techPlan.discountValue,
    taxRateBps: techPlan.taxRateBps,
    pricingSnapshotId: 'demo-service-price-technova-cycle-current',
    createdAt: now,
    updatedAt: now,
  };

  const urbanDeliverables: Deliverable[] = [
    ['demo-service-deliverable-urban-video-1', urbanVideo.id, 1, 'UrbanEats short video 1', 'In Progress'],
    ['demo-service-deliverable-urban-video-2', urbanVideo.id, 2, 'UrbanEats short video 2', 'Ready'],
    ['demo-service-deliverable-urban-video-3', urbanVideo.id, 3, 'UrbanEats short video 3', 'Planned'],
    ['demo-service-deliverable-urban-social-1', urbanSocial.id, 1, 'UrbanEats social content 1', 'Delivered'],
    ['demo-service-deliverable-urban-social-2', urbanSocial.id, 2, 'UrbanEats social content 2', 'Delivered'],
    ['demo-service-deliverable-urban-social-3', urbanSocial.id, 3, 'UrbanEats social content 3', 'Planned'],
    ['demo-service-deliverable-urban-social-4', urbanSocial.id, 4, 'UrbanEats social content 4', 'Planned'],
  ].map(([id, serviceItemId, sequence, title, status]) => ({
    id: String(id),
    clientId: urbanPlan.clientId,
    clientName: urbanPlan.clientName,
    planId: urbanPlan.id,
    cycleId: currentUrbanCycle.id,
    serviceItemId: String(serviceItemId),
    sequence: Number(sequence),
    title: String(title),
    status: status as Deliverable['status'],
    taskIds: [],
    attachments: [],
    workflowGeneratedAt: id === 'demo-service-deliverable-urban-video-1' ? now : undefined,
    workflowGenerationId: id === 'demo-service-deliverable-urban-video-1' ? 'demo-service-workflow-run-urban-video-1' : undefined,
    createdAt: now,
    updatedAt: now,
  }));
  const previousUrbanDeliverables: Deliverable[] = Array.from({ length: 7 }, (_, index) => ({
    id: `demo-service-deliverable-urban-previous-${index + 1}`,
    clientId: urbanPlan.clientId,
    clientName: urbanPlan.clientName,
    planId: urbanPlan.id,
    cycleId: previousUrbanCycle.id,
    serviceItemId: index < 3 ? urbanVideo.id : urbanSocial.id,
    sequence: index < 3 ? index + 1 : index - 2,
    title: `Completed UrbanEats deliverable ${index + 1}`,
    status: 'Delivered',
    taskIds: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }));
  const techDeliverables: Deliverable[] = [
    ['demo-service-deliverable-technova-video-1', techVideo.id, 1, 'TechNova short video 1', 'Planned'],
    ['demo-service-deliverable-technova-video-2', techVideo.id, 2, 'TechNova short video 2', 'Planned'],
    ['demo-service-deliverable-technova-social-1', techSocial.id, 1, 'TechNova LinkedIn post 1', 'Planned'],
  ].map(([id, serviceItemId, sequence, title, status]) => ({
    id: String(id),
    clientId: techPlan.clientId,
    clientName: techPlan.clientName,
    planId: techPlan.id,
    cycleId: currentTechCycle.id,
    serviceItemId: String(serviceItemId),
    sequence: Number(sequence),
    title: String(title),
    status: status as Deliverable['status'],
    taskIds: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }));

  const primaryDeliverableId = urbanDeliverables[0].id;
  const taskIds = workflow.steps.map(step => `demo-service-task-urban-video-1-step-${step.order}`);
  const tasks: Task[] = workflow.steps.map((step, index) => {
    const completed = index < 3;
    const clientApproval = step.kind === 'client_approval' && index === 3;
    const revision = step.title === 'Video Editing';
    return {
      id: taskIds[index],
      clientId: urbanPlan.clientId,
      projectId: 'p3',
      serviceCycleId: currentUrbanCycle.id,
      deliverableId: primaryDeliverableId,
      visibility: step.clientVisible ? 'client-visible' : 'internal',
      workflowTemplateId: workflow.templateId,
      workflowTemplateRevision: workflow.templateRevision,
      workflowStepId: step.id,
      workflowStepOrder: step.order,
      workflowStepRequired: step.required,
      predecessorTaskIds: index === 0 ? [] : [taskIds[index - 1]],
      generatedFromDeliverable: true,
      clientName: urbanPlan.clientName,
      customerDetails: 'UrbanEats monthly social content service.',
      website: 'https://urbaneats.example',
      projectName: 'Promo Video Campaign',
      serviceType: 'Video',
      title: `${step.order}. ${step.title}`,
      description: step.description || `Short Video Production — ${step.title}.`,
      department: step.department,
      assignedTo: ['Operation', 'Video Shooting'].includes(step.department)
        ? LOCAL_SERVICE_DEMO_USER_IDS.operation
        : 'u-staff-demo-local',
      createdBy: 'u-admin',
      startDate: workflowStart,
      dueDate: dateWithinCycle(addDays(workflowStart, Math.min(step.order + 1, 14)), currentEnd),
      priority: step.order === 4 ? 'High' : 'Medium',
      status: completed ? 'Completed' : clientApproval ? 'Waiting Approval' : revision ? 'In Progress' : 'Pending',
      completionPercentage: completed ? 100 : clientApproval ? 60 : revision ? 35 : 0,
      notes: revision ? 'Revision requested after the internal review. This remains a soft dependency demonstration.' : undefined,
      isCompleted: completed,
      completedAt: completed ? `${dateWithinCycle(addDays(workflowStart, step.order), currentEnd)}T10:00:00.000Z` : undefined,
      revisionCount: revision ? 1 : 0,
      clientApprovalStatus: 'Pending',
      isRecurring: false,
      recurrenceFrequency: 'None',
      comments: [],
      approvalHistory: [],
      updatedAt: now,
    };
  });
  urbanDeliverables[0] = { ...urbanDeliverables[0], taskIds, updatedAt: now };
  tasks.push({
    id: 'demo-service-task-urban-internal-review',
    clientId: urbanPlan.clientId,
    projectId: 'p3',
    serviceCycleId: currentUrbanCycle.id,
    deliverableId: urbanDeliverables[1].id,
    visibility: 'internal',
    clientName: urbanPlan.clientName,
    projectName: 'Promo Video Campaign',
    serviceType: 'Video',
    title: 'Internal review — UrbanEats short video 2',
    description: 'A ready deliverable awaiting final internal confirmation.',
    department: 'Operation',
    assignedTo: LOCAL_SERVICE_DEMO_USER_IDS.operation,
    createdBy: 'u-admin',
    startDate: workflowStart,
    dueDate: dateWithinCycle(today, currentEnd),
    priority: 'High',
    status: 'Waiting Approval',
    completionPercentage: 90,
    isCompleted: false,
    revisionCount: 0,
    clientApprovalStatus: 'Pending',
    isRecurring: false,
    recurrenceFrequency: 'None',
    comments: [],
    approvalHistory: [],
    updatedAt: now,
  });
  urbanDeliverables[1] = { ...urbanDeliverables[1], taskIds: ['demo-service-task-urban-internal-review'], updatedAt: now };
  tasks.push({
    id: 'demo-service-task-urban-client-approval',
    clientId: urbanPlan.clientId,
    projectId: 'p3',
    serviceCycleId: currentUrbanCycle.id,
    deliverableId: urbanDeliverables[2].id,
    visibility: 'client-visible',
    clientName: urbanPlan.clientName,
    projectName: 'Promo Video Campaign',
    serviceType: 'Video',
    title: 'Client approval — UrbanEats short video 3',
    description: 'A client-visible approval request for the next short video.',
    department: 'Operation',
    assignedTo: LOCAL_SERVICE_DEMO_USER_IDS.operation,
    createdBy: 'u-admin',
    startDate: workflowStart,
    dueDate: dateWithinCycle(addDays(workflowStart, 2), currentEnd),
    priority: 'High',
    status: 'Waiting Approval',
    completionPercentage: 80,
    isCompleted: false,
    revisionCount: 0,
    clientApprovalStatus: 'Pending',
    isRecurring: false,
    recurrenceFrequency: 'None',
    comments: [],
    approvalHistory: [],
    updatedAt: now,
  });
  urbanDeliverables[2] = { ...urbanDeliverables[2], taskIds: ['demo-service-task-urban-client-approval'], updatedAt: now };

  const briefAttachment: AttachmentRef = {
    id: 'demo-service-file-urban-brief',
    bucket: LOCAL_SERVICE_DEMO_BUCKET,
    path: 'urban-eats/monthly-content-brief.txt',
    fileName: 'UrbanEats-monthly-content-brief.txt',
    mimeType: 'text/plain',
    sizeBytes: 303,
    uploadedBy: 'u-admin',
    uploadedAt: now,
  };
  const cycleComments: CycleComment[] = [
    {
      id: 'demo-service-comment-urban-client',
      clientId: urbanPlan.clientId,
      clientName: urbanPlan.clientName,
      cycleId: currentUrbanCycle.id,
      userId: 'u-admin',
      text: 'The monthly content brief is ready. Please review the client approval steps before the campaign posts go live.',
      visibility: 'client-visible',
      attachments: [briefAttachment],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-service-comment-urban-internal',
      clientId: urbanPlan.clientId,
      clientName: urbanPlan.clientName,
      cycleId: currentUrbanCycle.id,
      userId: LOCAL_SERVICE_DEMO_USER_IDS.operation,
      text: 'Internal note: keep the lunch-bundle hook in the opening two seconds. This note is intentionally hidden from the client portal.',
      visibility: 'internal',
      attachments: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const pricing = [
    makePricingSnapshot({ id: 'demo-service-price-urban-plan', clientId: urbanPlan.clientId, parentType: 'client_plan', parentId: urbanPlan.id, items: urbanPlan.serviceItems, now }),
    makePricingSnapshot({ id: 'demo-service-price-urban-cycle-current', clientId: urbanPlan.clientId, parentType: 'service_cycle', parentId: currentUrbanCycle.id, items: currentUrbanCycle.serviceItems, addonUnitPriceMinor: monthlyAddon.unitPriceMinor + oneOffAddon.unitPriceMinor, now }),
    makePricingSnapshot({ id: 'demo-service-price-urban-cycle-previous', clientId: urbanPlan.clientId, parentType: 'service_cycle', parentId: previousUrbanCycle.id, items: previousUrbanCycle.serviceItems, now }),
    makePricingSnapshot({ id: 'demo-service-price-urban-addon-monthly', clientId: urbanPlan.clientId, parentType: 'addon', parentId: monthlyAddon.id, addonUnitPriceMinor: monthlyAddon.unitPriceMinor, addonQuantity: monthlyAddon.quantity, now }),
    makePricingSnapshot({ id: 'demo-service-price-urban-addon-oneoff', clientId: urbanPlan.clientId, parentType: 'addon', parentId: oneOffAddon.id, addonUnitPriceMinor: oneOffAddon.unitPriceMinor, addonQuantity: oneOffAddon.quantity, now }),
    makePricingSnapshot({ id: 'demo-service-price-technova-plan', clientId: techPlan.clientId, parentType: 'client_plan', parentId: techPlan.id, items: techPlan.serviceItems, discountType: techPlan.discountType, discountValue: techPlan.discountValue, now }),
    makePricingSnapshot({ id: 'demo-service-price-technova-revision', clientId: techRevision.clientId, parentType: 'client_plan', parentId: techRevision.id, items: techRevision.serviceItems, discountType: techRevision.discountType, discountValue: techRevision.discountValue, now }),
    makePricingSnapshot({ id: 'demo-service-price-technova-cycle-current', clientId: techPlan.clientId, parentType: 'service_cycle', parentId: currentTechCycle.id, items: currentTechCycle.serviceItems, discountType: currentTechCycle.discountType, discountValue: currentTechCycle.discountValue, now }),
  ];
  monthlyAddon.pricingSnapshotId = 'demo-service-price-urban-addon-monthly';
  oneOffAddon.pricingSnapshotId = 'demo-service-price-urban-addon-oneoff';

  const users: User[] = [
    {
      id: LOCAL_SERVICE_DEMO_USER_IDS.operation,
      authUserId: 'local-demo-operation',
      name: 'Operation Demo',
      role: 'Staff',
      departments: ['Operation'],
      department: 'Operation',
      workerType: 'employee',
      avatar: 'https://i.pravatar.cc/150?u=OperationDemo',
      permissions: {
        viewDashboard: true, viewTasks: true, viewCalendar: true, viewProjects: true, viewAllTasks: true, viewAllClients: true, manageAssignedClients: true, viewReports: true, viewApprovals: false, viewSettings: true, createTasks: true, editTasks: true, createProjects: false, manageUsers: false, approveRegistrations: false, deleteUsers: false, clientReview: false, manageServiceCatalog: false, manageTaskTemplates: false, manageClientPlans: false, manageServiceCycles: true, viewAllServiceClients: true, viewAssignedServiceClients: true, viewServicePrices: false, viewProductionReports: true,
      },
    },
    {
      id: LOCAL_SERVICE_DEMO_USER_IDS.account,
      authUserId: 'local-demo-account',
      name: 'Account Demo',
      role: 'Staff',
      departments: ['Account & Finance'],
      department: 'Account & Finance',
      workerType: 'employee',
      avatar: 'https://i.pravatar.cc/150?u=AccountDemo',
      permissions: {
        viewDashboard: true, viewTasks: true, viewCalendar: true, viewProjects: true, viewAllTasks: true, viewAllClients: true, manageAssignedClients: false, viewReports: true, viewApprovals: false, viewSettings: true, createTasks: false, editTasks: false, createProjects: false, manageUsers: false, approveRegistrations: false, deleteUsers: false, clientReview: false, manageServiceCatalog: false, manageTaskTemplates: false, manageClientPlans: false, manageServiceCycles: false, viewAllServiceClients: true, viewAssignedServiceClients: true, viewServicePrices: true, viewProductionReports: true,
      },
    },
  ];

  return {
    users,
    clients,
    servicePackages: [growthPackage],
    clientPlans: [urbanPlan, techPlan, techRevision, ecoPlan],
    serviceCycles: [currentUrbanCycle, previousUrbanCycle, currentTechCycle],
    deliverables: [...urbanDeliverables, ...previousUrbanDeliverables, ...techDeliverables],
    tasks,
    cycleComments,
    addons: [monthlyAddon, oneOffAddon],
    serviceWorkflowTemplates: [cloneTemplate(SHORT_VIDEO_WORKFLOW_TEMPLATE)],
    servicePricingSnapshots: pricing,
  };
};
