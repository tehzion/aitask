import { type MutationConflict, type MutationErrorCode, type SecureCommandType } from '../../infrastructure/api/workspaceContracts';
import type { TaskWorkIntent } from './index';
import { type MessageDescriptor } from '../i18n/messages';
import {
  type Addon,
  type AppNotification,
  type AttachmentRef,
  type ClientApprovalStatus,
  type ClientProfile,
  type ClientServicePlan,
  type CommentVisibility,
  type CustomRole,
  type CycleComment,
  type Deliverable,
  type DeliverableStatus,
  type Department,
  type LoginResult,
  type PlanOrigin,
  type Priority,
  type Project,
  type ProjectLifecycleStatus,
  type ProjectMilestone,
  type Registration,
  type Role,
  type RolePermissions,
  type ServiceCycle,
  type ServiceCycleStatus,
  type ServiceItem,
  type ServicePackage,
  type ServicePricingSnapshot,
  type ServiceWorkflowTemplate,
  type Task,
  type TaskStatus,
  type User
} from './index';
export type SyncStatus = 'local' | 'loading' | 'live' | 'saving' | 'offline' | 'conflict' | 'retry_required' | 'refresh_required' | 'upgrade_required';

export interface BackendRuntimeState {
  mode: 'local' | 'supabase';
  status: SyncStatus;
  isConfigured: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isPulling: boolean;
  isRestoring?: boolean;
  lastSyncedAt?: string;
  lastSavedAt?: string;
  lastPulledAt?: string;
  remoteVersion?: number;
  workspaceVersion?: number;
  remoteUpdatedAt?: string;
  hasRemoteUpdate: boolean;
  hasLocalChanges: boolean;
  pendingMutations: number;
  pendingCommandType?: SecureCommandType;
  upgradeRequired?: boolean;
  conflict?: MutationConflict;
  errorCode?: MutationErrorCode;
  error?: string;
  message: string;
}

export type TaskUpdateInput = Partial<Pick<
  Task,
  | 'projectId'
  | 'serviceCycleId'
  | 'deliverableId'
  | 'clientId'
  | 'clientName'
  | 'customerDetails'
  | 'facebookPage'
  | 'website'
  | 'projectName'
  | 'serviceType'
  | 'title'
  | 'description'
  | 'department'
  | 'assignedTo'
  | 'startDate'
  | 'dueDate'
  | 'priority'
  | 'status'
  | 'completionPercentage'
  | 'attachmentLink'
  | 'attachmentName'
  | 'reviewOverrideReason'
  | 'notes'
  | 'isRecurring'
  | 'recurrenceFrequency'
  | 'visibility'
  | 'milestoneId'
>>;

export type ClientPlanSetupInput = {
  clientName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  facebookPage?: string;
  notes?: string;
  planName: string;
  origin: PlanOrigin;
  sourcePackageId?: string;
  sourcePackageRevision?: number;
  serviceItems: ServiceItem[];
  startDate: string;
  billingDay: number;
  discountType: ClientServicePlan['discountType'];
  discountValue: number;
  taxRateBps: number;
  contractEndDate?: string;
};

export type ProjectUpdateInput = Partial<Pick<Project,
  'clientId' | 'clientName' | 'projectName' | 'services' | 'startDate' | 'deadline'
  | 'projectManagerIds' | 'hodMemberIds' | 'staffMemberIds' | 'memberResponsibilities'
  | 'defaultApprovalMode' | 'requireClearClosureChecklist'
>>;

export type ClientProfileInput = Partial<Pick<ClientProfile, 'contactPerson' | 'email' | 'phone' | 'address' | 'website' | 'facebookPage' | 'notes' | 'clientSince'>>;

export type ClientPlanInput = Omit<ClientPlanSetupInput, 'clientName' | 'contactPerson' | 'email' | 'phone' | 'address' | 'website' | 'facebookPage' | 'notes'>;

export type AddMemberInput = Omit<User, 'id' | 'avatar' | 'isSuperAdmin'> & {
  registrationId?: string;
  memberId?: string;
  sendInvitation?: boolean;
  projectIds?: string[];
};

export type MutationActionResult = { ok: boolean; error?: string | MessageDescriptor };

export interface StoreState {
  currentUser: User | null;
  users: User[];
  clients: ClientProfile[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  notificationUnreadCount: number;
  registrations: Registration[];
  rolePermissions: CustomRole[];
  backend: BackendRuntimeState;
  taskStatuses: string[];
  deletedUserIds: string[];
  deletedRoleIds: string[];
  deletedTaskStatuses: string[];
  deletedClientIds: string[];
  servicePackages: ServicePackage[];
  clientPlans: ClientServicePlan[];
  serviceCycles: ServiceCycle[];
  deliverables: Deliverable[];
  cycleComments: CycleComment[];
  addons: Addon[];
  serviceWorkflowTemplates: ServiceWorkflowTemplate[];
  servicePricingSnapshots: ServicePricingSnapshot[];
  isCreateTaskModalOpen: boolean;
  setCreateTaskModalOpen: (open: boolean) => void;
  createTaskInitialDate?: string;
  createTaskInitialAssignee?: string;
  createTaskInitialClientId?: string;
  createTaskInitialClientName?: string;
  createTaskInitialServiceType?: string;
  createTaskInitialCycleId?: string;
  createTaskInitialDeliverableId?: string;
  openCreateTaskForDeliverable: (data: { clientId: string; clientName: string; serviceType: string; cycleId: string; deliverableId: string }) => void;

  initializeBackend: () => Promise<void>;
  syncBackendNow: (commandType?: SecureCommandType) => Promise<void>;
  pullBackendNow: (options?: { force?: boolean; silent?: boolean }) => Promise<void>;
  retryMutation: (options?: { reapplyWorkspaceConflict?: boolean }) => Promise<{ ok: boolean; error?: string; code?: MutationErrorCode }>;
  reapplyMutationOnLatestWorkspace: () => Promise<{ ok: boolean; error?: string }>;
  retryPendingSave: (commandType?: SecureCommandType) => Promise<{ ok: boolean; error?: string; code?: MutationErrorCode }>;
  discardMutation: (options?: { reload?: boolean; confirm?: boolean }) => Promise<void>;
  commitPendingMutation: (commandType?: SecureCommandType) => Promise<{ ok: boolean; error?: string; code?: MutationErrorCode }>;
  login: (name: string, password?: string) => Promise<LoginResult>;
  requestPasswordRecovery: (email: string) => Promise<{ ok: boolean; error?: string }>;
  completePasswordSetup: (data: { newPassword: string; confirmPassword: string }) => Promise<{ ok: boolean; error?: string }>;
  updateCurrentUserProfile: (data: Pick<User, 'name' | 'email' | 'avatar'>) => { ok: boolean; error?: string };
  updateCurrentUserEmail: (email: string, currentPassword: string) => Promise<{ ok: boolean; error?: string; emailConfirmationRequired?: boolean; pendingEmail?: string }>;
  updateCurrentUserPassword: (data: { currentPassword?: string; newPassword: string; confirmPassword: string }) => Promise<{ ok: boolean; error?: string }>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => MutationActionResult;
  updateTaskWork: (taskId: string, intent: TaskWorkIntent) => MutationActionResult;
  updateTaskPriority: (taskId: string, priority: Priority) => MutationActionResult;
  updateTaskAssignee: (taskId: string, assignedTo: string) => MutationActionResult;
  overrideTaskAssignee: (taskId: string, assignedTo: string, reason: string) => MutationActionResult;
  updateTaskDueDate: (taskId: string, newDueDate: string) => MutationActionResult;
  updateTaskAttachment: (taskId: string, attachmentLink: string, attachmentName?: string) => MutationActionResult;
  attachTaskOutput: (taskId: string, attachment: AttachmentRef) => Promise<MutationActionResult>;
  setTaskReviewConfig: (taskId: string, config: { cover?: Task['reviewCover'] | null; accountableLeadId?: string; requiresInternalApproval?: boolean; approvalMode?: Task['approvalMode'] }) => Promise<MutationActionResult>;
  updateTask: (taskId: string, data: TaskUpdateInput) => { ok: boolean; error?: string };
  deleteTask: (taskId: string) => { ok: boolean; error?: string };
  reviewClientApproval: (taskId: string, status: ClientApprovalStatus, note?: string) => MutationActionResult;
  requestRevision: (taskId: string, note?: string) => MutationActionResult;
  addTask: (task: Omit<Task, 'id' | 'isCompleted' | 'completedAt' | 'revisionCount' | 'clientApprovalStatus' | 'dueReminderSent' | 'approvalHistory'>) => string;
  addProject: (project: Omit<Project, 'id'>) => string;
  updateProject: (projectId: string, data: ProjectUpdateInput) => { ok: boolean; error?: string };
  setProjectStatus: (projectId: string, status: ProjectLifecycleStatus, confirmWarnings?: boolean) => { ok: boolean; error?: string };
  saveProjectMilestone: (projectId: string, milestone: Omit<ProjectMilestone, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => { ok: boolean; id?: string; error?: string };
  deleteProjectMilestone: (projectId: string, milestoneId: string) => { ok: boolean; error?: string };
  deleteProject: (projectId: string) => { ok: boolean; error?: string };
  createClientProfile: (data: { clientName: string } & ClientProfileInput) => { ok: boolean; id?: string; error?: string };
  upsertClientProfile: (clientName: string, data: ClientProfileInput) => { ok: boolean; id?: string; error?: string };
  renameClient: (oldClientName: string, newClientName: string) => { ok: boolean; error?: string };
  assignClientOwner: (clientId: string, ownerId?: string) => { ok: boolean; error?: string };
  deleteClientProfile: (clientId: string) => { ok: boolean; error?: string };
  saveServicePackage: (data: Omit<ServicePackage, 'id' | 'revision' | 'createdAt' | 'updatedAt' | 'currency'> & { id?: string }) => { ok: boolean; id?: string; error?: string };
  deleteServicePackage: (id: string) => { ok: boolean; error?: string };
  saveWorkflowTemplate: (data: Omit<ServiceWorkflowTemplate, 'id' | 'revision' | 'createdAt' | 'updatedAt'> & { id?: string }) => { ok: boolean; id?: string; error?: string };
  deleteWorkflowTemplate: (id: string) => { ok: boolean; error?: string };
  createClientWithPlan: (data: ClientPlanSetupInput) => { ok: boolean; clientId?: string; planId?: string; error?: string };
  createClientPlan: (clientId: string, data: ClientPlanInput) => { ok: boolean; planId?: string; error?: string };
  createClientPlanRevision: (planId: string) => { ok: boolean; planId?: string; error?: string };
  scheduleClientPlanRevision: (planId: string, effectiveDate: string, expectedVersion?: number) => { ok: boolean; error?: string };
  returnClientPlanRevisionToDraft: (planId: string, expectedVersion?: number) => { ok: boolean; error?: string };
  updateDraftClientPlan: (planId: string, data: Partial<Pick<ClientServicePlan, 'name' | 'serviceItems' | 'discountType' | 'discountValue' | 'taxRateBps' | 'startDate' | 'billingDay' | 'contractEndDate'>>) => { ok: boolean; error?: string };
  updateActivePlanDates: (planId: string, data: Partial<Pick<ClientServicePlan, 'billingDay' | 'contractEndDate'>>) => { ok: boolean; error?: string };
  activateClientPlan: (planId: string) => { ok: boolean; cycleId?: string; error?: string };
  generateDueLocalServiceCycles: () => void;
  setClientPlanStatus: (planId: string, status: ClientServicePlan['status']) => { ok: boolean; error?: string };
  setServiceCycleStatus: (cycleId: string, status: ServiceCycleStatus) => { ok: boolean; error?: string };
  updateDeliverableStatus: (deliverableId: string, status: DeliverableStatus) => { ok: boolean; error?: string };
  linkTaskToDeliverable: (taskId: string, cycleId?: string, deliverableId?: string) => { ok: boolean; error?: string };
  unlinkInvalidTaskDelivery: (taskId: string) => { ok: boolean; error?: string };
  generateDeliverableTaskChain: (deliverableId: string) => { ok: boolean; taskIds?: string[]; error?: string };
  carryForwardTaskToCycle: (taskId: string, targetCycleId: string, targetDeliverableId?: string) => { ok: boolean; taskId?: string; error?: string };
  addCycleComment: (cycleId: string, text: string, visibility: CommentVisibility) => { ok: boolean; id?: string; error?: string };
  addCycleCommentAttachment: (commentId: string, attachment: AttachmentRef) => { ok: boolean; error?: string };
  addAddon: (data: Omit<Addon, 'id' | 'createdAt' | 'updatedAt'>) => { ok: boolean; id?: string; error?: string };
  setAddonActive: (addonId: string, isActive: boolean, effectiveUntil?: string) => { ok: boolean; error?: string };
  addComment: (taskId: string, text: string) => { ok: boolean; id?: string; error?: string };
  markNotificationRead: (id: string) => void;
  markNotificationUnread: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendDueDateReminders: () => void;
  registerUser: (data: Omit<Registration, 'id' | 'status' | 'createdAt'>) => Promise<{ ok: boolean; error?: string }>;
  addUserBySuperAdmin: (data: AddMemberInput) => Promise<{ ok: boolean; error?: string }>;
  updateMemberDepartments: (userId: string, departments: Department[]) => Promise<{ ok: boolean; error?: string }>;
  updateMemberPermissions: (userId: string, permissions?: RolePermissions) => Promise<{ ok: boolean; error?: string }>;
  addCustomRole: (data: Omit<CustomRole, 'id' | 'createdAt' | 'updatedAt' | 'isProtected'>) => { ok: boolean; id?: string; error?: string };
  updateCustomRole: (id: string, data: Partial<Pick<CustomRole, 'name' | 'description' | 'baseRole' | 'permissions' | 'departmentScoped'>>) => { ok: boolean; error?: string };
  deleteCustomRole: (id: string) => { ok: boolean; error?: string };
  assignCustomRoleToUser: (userId: string, customRoleId?: string) => { ok: boolean; error?: string };
  changeMemberRole: (userId: string, role: Role, options?: { customRoleId?: string; companyName?: string; departments?: Department[] }) => Promise<{ ok: boolean; error?: string }>;
  approveRegistration: (id: string, role: Role, departments: Department[], companyName?: string, customRoleId?: string) => { ok: boolean; error?: string };
  rejectRegistration: (id: string) => MutationActionResult;
  requestMemberDeactivation: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  _forceSyncMockData: () => void;
  resetLocalServiceDemo: () => { ok: boolean; error?: string };
  addTaskStatus: (status: string) => { ok: boolean; error?: string };
  deleteTaskStatus: (status: string) => { ok: boolean; error?: string };
}

export type NotificationDraft = Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>;

export type WorkspaceSet = (patch: Partial<StoreState> | ((state: StoreState) => Partial<StoreState> | StoreState)) => void;
export type WorkspaceGet = () => StoreState;
