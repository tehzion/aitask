export type Role = 'Project Manager' | 'HOD' | 'Staff' | 'Client';
export type LoginFailureCode =
  | 'invalid_credentials'
  | 'account_unapproved_or_unlinked'
  | 'session_expired'
  | 'workspace_load_failed';
export type LoginResult =
  | { ok: true }
  | { ok: false; code: LoginFailureCode; error: string };
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
  | 'viewDeliveryTracker'
  | 'viewAllTasks'
  | 'viewAllClients'
  | 'manageAssignedClients'
  | 'viewReports'
  | 'viewApprovals'
  | 'viewSettings'
  | 'createTasks'
  | 'editTasks'
  | 'manageCreatedTasks'
  | 'createProjects'
  | 'createClients'
  | 'deleteClients'
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
  departmentScoped?: boolean;
  isProtected?: boolean;
  isBuiltin?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  version?: number;
  authUserId?: string;
  hasLogin?: boolean; // Explicit false marks an unlinked directory member; demos omit it.
  workspaceId?: string;
  name: string;
  email?: string;
  phone?: string;
  jobPosition?: string;
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
  targetRole?: Role;     // e.g., 'Project Manager'
  targetClient?: string; // e.g., 'TechNova'
  title: string;
  message: string;
  route: NotificationRoute;
  isRead: boolean;
  readByUserIds?: string[];
  unreadByUserIds?: string[];
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
  createdBy?: string;
  /** Optional business date for when the client engagement started (YYYY-MM-DD). */
  clientSince?: string;
  /** Runtime-only marker for a client created from a work-record name. Never persisted. */
  discovered?: boolean;
  /** Read-only publication state returned by the customer portal projection. */
  awaitingPublication?: boolean;
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
  revisionScheduleStatus?: 'draft' | 'scheduled';
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
  deliveredAt?: string;
  taskIds: string[];
  attachments: AttachmentRef[];
  workflowGeneratedAt?: string;
  workflowGenerationId?: string;
  primaryTaskId?: string;
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
  /** Project access is explicit; Boss Koo retains workspace-wide access. */
  projectManagerIds?: string[];
  /** HODs assigned to this project can oversee matching departmental work. */
  hodMemberIds?: string[];
  /** Staff membership is independent from task assignment and may span projects. */
  staffMemberIds?: string[];
  /** Optional project-specific responsibility label for each assigned member. */
  memberResponsibilities?: Record<string, string>;
  clientName: string;
  projectName: string;
  services: ServiceType[];
  startDate: string; // New field for Finance to track
  deadline: string;
  status?: ProjectLifecycleStatus;
  completedAt?: string;
  completedBy?: string;
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  closureWarningsAcknowledged?: boolean;
  closureWarningSnapshot?: ProjectClosureWarningSnapshot;
  requireClearClosureChecklist?: boolean;
  /** Existing projects omit this so their historical task approval behaviour is preserved. */
  defaultApprovalMode?: ProjectApprovalMode;
  milestones?: ProjectMilestone[];
  updatedAt?: string;
}

export type ProjectLifecycleStatus = 'Active' | 'Completed' | 'Closed';
export type ProjectApprovalMode = 'none' | 'hod' | 'pm';
export type TaskApprovalMode = 'inherit' | ProjectApprovalMode;
export type ProjectMilestoneStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Delayed';

export interface ProjectMilestone {
  id: string;
  name: string;
  description?: string;
  targetDate: string;
  responsiblePersonId?: string;
  status: ProjectMilestoneStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectClosureWarningSnapshot {
  outstandingTasks: number;
  pendingApprovals: number;
  overdueTasks: number;
  incompleteMilestones: number;
  confirmedAt: string;
}

export interface TaskWorkState {
  acceptedBy?: string;
  acceptedAt?: string;
  reviewRequestedBy?: string;
  reviewRequestedAt?: string;
  blocker?: { reason: string; openedBy: string; openedAt: string };
}

export interface TaskWorkEvent {
  id: string;
  userId: string;
  createdAt: string;
  fields: string[];
}

export interface Task {
  id: string;
  version?: number;
  workspaceId?: string;
  clientId?: string;
  projectId?: string;
  serviceCycleId?: string;
  deliverableId?: string;
  outputAttachments?: AttachmentRef[];
  accountableLeadId?: string;
  requiresInternalApproval?: boolean; // Defaults to true; configured by the responsible PM.
  /** Missing preserves legacy behaviour; `inherit` is the only mode that reads the project default. */
  approvalMode?: TaskApprovalMode;
  milestoneId?: string;
  reviewCover?: { reviewerId: string; expiresAt: string; configuredBy?: string; configuredAt?: string } | null;
  reviewOverrideReason?: string; // Submitted once; the server replaces it with decision provenance.
  reviewDecision?: { reviewedBy: string; reviewedAt: string; overrideReason?: string };
  visibility?: TaskVisibility;
  workflowTemplateId?: string;
  workflowTemplateRevision?: number;
  workflowStepId?: string;
  workflowStepOrder?: number;
  workflowStepRequired?: boolean;
  workflowStepKind?: WorkflowStepKind;
  workflowOutputVersion?: number;
  workflowDependenciesReady?: boolean; // Read-only summary of canonical dependencies
  reviewEvidence?: { actorId: string; attachments: AttachmentRef[]; links?: { taskId: string; url: string; name: string; outputVersion: number }[] }; // Canonical read-only projection
  reviewAccess?: { actorId: string; canApprove: boolean; canReadInputs?: boolean; expiresAt?: string }; // Server-owned, actor-bound review permission
  internalReview?: {
    decisionId?: string; // Server-created decision; omitted for optimistic local drafts
    reviewedBy: string;
    reviewedAt: string;
    inputVersions: { taskId: string; outputVersion: number }[];
  };
  predecessorTaskIds?: string[];
  /** Immutable lineage for work intentionally carried into a later service cycle. */
  carriedFromTaskId?: string;
  carriedFromCycleId?: string;
  carriedForwardAt?: string;
  generatedFromDeliverable?: boolean;
  workflowGeneratedAt?: string;
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
  assignedBy?: string; // User ID of the member who last set assignedTo
  assignedAt?: string; // ISO timestamp of the last assignment change
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
  workState?: TaskWorkState;
  workHistory?: TaskWorkEvent[];
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
  | 'deliverableId'
  | 'visibility'
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
  | 'clientApprovalStatus'
  | 'updatedAt'
>;

export interface ClientTaskCommentProjection {
  id: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: string;
  version?: number;
  updatedAt?: string;
}

export interface ClientTaskApprovalProjection {
  id: string;
  taskId: string;
  userId: string;
  status: ClientApprovalStatus;
  note?: string;
  createdAt: string;
  version?: number;
  updatedAt?: string;
}

export interface ClientDeliverableProjection {
  id: string;
  version?: number;
  updatedAt?: string;
  clientId: string;
  clientName: string;
  planId: string;
  cycleId: string;
  sequence: number;
  title: string;
  status: DeliverableStatus;
  attachments: AttachmentRef[];
  primaryTaskId?: string;
}

export interface ClientPortalPayload {
  workspaceId: string;
  clientName: string;
  tasks: ClientTaskProjection[];
  projects: Project[];
  clients: ClientProfile[];
  contacts: ClientContact[];
  clientPlans: ClientServicePlan[];
  serviceCycles: ServiceCycle[];
  deliverables: ClientDeliverableProjection[];
  cycleComments: CycleComment[];
  taskComments: ClientTaskCommentProjection[];
  taskApprovals: ClientTaskApprovalProjection[];
}
