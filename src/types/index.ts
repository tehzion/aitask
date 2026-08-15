export type Role = 'Admin' | 'Staff' | 'Client';
export type Department =
  | 'Operation'
  | 'Management'
  | 'Videoshooting'
  | 'Video Shooting'
  | 'Editor'
  | 'Video Editor'
  | 'Ads Management'
  | 'Account & Finance'
  | 'Designer'
  | 'Client';
export type PresetServiceType = 'Social Media' | 'Design' | 'Video' | 'Website' | 'SEO' | 'Ads' | 'Branding';
export type ServiceType = PresetServiceType | (string & {});
export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TaskStatus = string;
export type ClientApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
export type RecurrenceFrequency = 'None' | 'Daily' | 'Weekly' | 'Monthly';
export type RolePermissionKey =
  | 'viewDashboard'
  | 'viewTasks'
  | 'viewCalendar'
  | 'viewProjects'
  | 'viewAllTasks'
  | 'viewAllClients'
  | 'manageAssignedClients'
  | 'viewReports'
  | 'viewApprovals'
  | 'viewSettings'
  | 'createTasks'
  | 'editTasks'
  | 'createProjects'
  | 'manageUsers'
  | 'approveRegistrations'
  | 'deleteUsers'
  | 'clientReview'
  | 'manageServiceCatalog'
  | 'manageTaskTemplates'
  | 'manageClientPlans'
  | 'manageServiceCycles'
  | 'viewAllServiceClients'
  | 'viewAssignedServiceClients'
  | 'viewServicePrices'
  | 'viewProductionReports';

export type RolePermissions = Record<RolePermissionKey, boolean>;

export interface CustomRole {
  id: string;
  version?: number;
  name: string;
  description?: string;
  baseRole: Role;
  permissions: RolePermissions;
  isProtected?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  version?: number;
  authUserId?: string;
  workspaceId?: string;
  name: string;
  email?: string;
  password?: string; // Backward compatibility only; active mock passwords are local-only
  role: Role;
  departments: Department[];
  department?: Department; // Deprecated compatibility mirror; departments is authoritative
  avatar?: string;
  companyName?: string; // Used specifically for linking Clients to their projects
  isSuperAdmin?: boolean; // System-owner flag, currently reserved for Boss Koo
  mustResetPassword?: boolean;
  customRoleId?: string;
  customRoleName?: string;
  permissions?: RolePermissions;
  workerType?: 'employee' | 'supplier' | 'freelancer';
  updatedAt?: string;
  directoryOnly?: boolean; // Runtime-only Client portal contact; never persisted or mutated
}

export type User = WorkspaceMember;

export interface NotificationRoute {
  page: 'dashboard' | 'tasks' | 'calendar' | 'clients' | 'projects' | 'reports' | 'approvals' | 'settings';
  entityId?: string;
}

export type NotificationCategory =
  | 'assignment'
  | 'deadline'
  | 'review'
  | 'feedback'
  | 'account'
  | 'status'
  | 'system';

export type NotificationImportance = 'action' | 'informational';

export interface AppNotification {
  id: string;
  version?: number;
  updatedAt?: string;
  targetUserId?: string; // e.g., assignee
  targetRole?: Role;     // e.g., 'Admin'
  targetClient?: string; // e.g., 'TechNova'
  title: string;
  message: string;
  route: NotificationRoute;
  isRead: boolean;
  readByUserIds?: string[];
  createdAt: string;
  iconType: 'task' | 'status' | 'success' | 'alert';
  category?: NotificationCategory;
  importance?: NotificationImportance;
  visibleToCurrentUser?: boolean; // Runtime-only feed projection; never persisted
}

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export interface NotificationFeedPage {
  items: AppNotification[];
  unreadCount: number;
  nextCursor?: NotificationCursor;
}

export interface TaskComment {
  id: string;
  version?: number;
  updatedAt?: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface TaskApprovalEvent {
  id: string;
  version?: number;
  updatedAt?: string;
  userId: string;
  status: ClientApprovalStatus;
  note?: string;
  createdAt: string;
}

export interface Registration {
  id: string;
  version?: number;
  updatedAt?: string;
  name: string;
  email: string;
  phone: string;
  password?: string; // Registration passwords are not persisted to the shared snapshot
  jobPosition: string;
  requestedRole: Role; // What they want to apply for
  status: 'Pending' | 'Approved' | 'Rejected';
  onboardingMode?: 'self_signup' | 'legacy_invite';
  createdAt: string;
}

export interface ClientProfile {
  id: string;
  version?: number;
  clientName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  facebookPage?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanOrigin = 'standard' | 'customized' | 'custom';
export type ClientPlanStatus = 'Draft' | 'Active' | 'Paused' | 'Ended';
export type ServiceCycleStatus = 'Draft' | 'Published' | 'Completed' | 'Cancelled';
export type DeliverableStatus = 'Planned' | 'In Progress' | 'Ready' | 'Delivered';
export type CommentVisibility = 'internal' | 'client-visible';
export type AddonBillingMode = 'one_off' | 'monthly';
export type TaskVisibility = 'internal' | 'client-visible';
export type WorkflowStepKind = 'work' | 'internal_review' | 'client_approval' | 'publishing';

export interface ServiceWorkflowStep {
  id: string;
  order: number;
  title: string;
  description?: string;
  department: Department;
  dueOffsetDays?: number;
  kind: WorkflowStepKind;
  clientVisible: boolean;
  required: boolean;
}

export interface ServiceWorkflowSnapshot {
  templateId: string;
  templateRevision: number;
  templateName: string;
  /** Display alias retained in frozen operational snapshots. */
  name: string;
  steps: ServiceWorkflowStep[];
}

export interface ServiceWorkflowTemplate {
  id: string;
  version?: number;
  name: string;
  description?: string;
  serviceTypes: string[];
  revision: number;
  isActive: boolean;
  steps: ServiceWorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  platforms: string[];
  unit: string;
  quantity: number;
  unitPriceMinor: number;
  description?: string;
  workflow?: ServiceWorkflowSnapshot;
}

export interface ServicePackage {
  id: string;
  version?: number;
  name: string;
  description?: string;
  revision: number;
  currency: 'MYR';
  serviceItems: ServiceItem[];
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  taxRateBps: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientServicePlan {
  id: string;
  version?: number;
  clientId: string;
  clientName: string;
  name: string;
  origin: PlanOrigin;
  sourcePackageId?: string;
  sourcePackageRevision?: number;
  revision: number;
  status: ClientPlanStatus;
  currency: 'MYR';
  serviceItems: ServiceItem[];
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  taxRateBps: number;
  startDate: string;
  billingDay: number;
  nextCycleStart?: string;
  contractEndDate?: string;
  supersedesPlanId?: string;
  effectiveFromCycleStart?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentRef {
  id: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ServiceCycle {
  id: string;
  version?: number;
  clientId: string;
  clientName: string;
  planId: string;
  planRevision: number;
  periodStart: string;
  periodEnd: string;
  status: ServiceCycleStatus;
  currency: 'MYR';
  serviceItems: ServiceItem[];
  addonSnapshots: Addon[];
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  taxRateBps: number;
  publishedAt?: string;
  pricingSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deliverable {
  id: string;
  version?: number;
  clientId: string;
  clientName: string;
  planId: string;
  cycleId: string;
  serviceItemId: string;
  sequence: number;
  title: string;
  status: DeliverableStatus;
  taskIds: string[];
  attachments: AttachmentRef[];
  workflowGeneratedAt?: string;
  workflowGenerationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CycleComment {
  id: string;
  version?: number;
  clientId: string;
  clientName: string;
  cycleId: string;
  userId: string;
  text: string;
  visibility: CommentVisibility;
  attachments: AttachmentRef[];
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  version?: number;
  clientId: string;
  clientName: string;
  planId: string;
  name: string;
  platforms: string[];
  quantity: number;
  unitPriceMinor: number;
  description?: string;
  billingMode: AddonBillingMode;
  targetCycleId?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  isActive: boolean;
  pricingSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePricingSnapshot {
  id: string;
  version?: number;
  clientId: string;
  parentType: 'client_plan' | 'service_cycle' | 'addon';
  parentId: string;
  currency: 'MYR';
  itemPrices: { serviceItemId: string; unitPriceMinor: number }[];
  addonUnitPriceMinor?: number;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  taxRateBps: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  version?: number;
  workspaceId?: string;
  clientId?: string;
  createdBy?: string;
  clientName: string;
  projectName: string;
  services: ServiceType[];
  startDate: string; // New field for Finance to track
  deadline: string;
  totalTasks: number;
  completedTasks: number;
  updatedAt?: string;
}

export interface Task {
  id: string;
  version?: number;
  workspaceId?: string;
  clientId?: string;
  projectId?: string;
  serviceCycleId?: string;
  deliverableId?: string;
  visibility?: TaskVisibility;
  workflowTemplateId?: string;
  workflowTemplateRevision?: number;
  workflowStepId?: string;
  workflowStepOrder?: number;
  workflowStepRequired?: boolean;
  predecessorTaskIds?: string[];
  generatedFromDeliverable?: boolean;
  clientName: string;
  customerDetails?: string;
  facebookPage?: string;
  website?: string;
  projectName?: string;
  serviceType: ServiceType;
  title: string;
  description: string;
  department: Department;
  assignedTo: string; // User ID
  createdBy: string; // User ID
  startDate: string; // ISO Date String, defaults to the current date
  dueDate: string; // Optional ISO Date String, blank when unset
  priority: Priority;
  status: TaskStatus;
  completionPercentage: number;
  attachmentLink?: string;
  attachmentName?: string;
  notes?: string;
  isCompleted: boolean;
  completedAt?: string;
  revisionCount: number;
  clientApprovalStatus: ClientApprovalStatus;
  isRecurring: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  dueReminderSent?: boolean;
  comments?: TaskComment[];
  approvalHistory?: TaskApprovalEvent[];
  updatedAt?: string;
  clientProjection?: boolean; // Runtime-only marker for the redacted Client portal shape
}

export interface ClientContact {
  id: string;
  name: string;
  avatar?: string;
}

export type ClientTaskProjection = Pick<Task,
  | 'id'
  | 'version'
  | 'clientName'
  | 'projectId'
  | 'projectName'
  | 'serviceCycleId'
  | 'deliverableId'
  | 'visibility'
  | 'workflowStepOrder'
  | 'workflowStepRequired'
  | 'serviceType'
  | 'title'
  | 'description'
  | 'assignedTo'
  | 'startDate'
  | 'dueDate'
  | 'status'
  | 'completionPercentage'
  | 'attachmentLink'
  | 'attachmentName'
  | 'website'
  | 'facebookPage'
  | 'isCompleted'
  | 'completedAt'
  | 'revisionCount'
  | 'clientApprovalStatus'
  | 'updatedAt'
>;

export interface ClientPortalPayload {
  workspaceId: string;
  clientName: string;
  tasks: ClientTaskProjection[];
  projects: Project[];
  clients: ClientProfile[];
  contacts: ClientContact[];
  clientPlans: ClientServicePlan[];
  serviceCycles: ServiceCycle[];
  deliverables: Deliverable[];
  cycleComments: CycleComment[];
}
