import type { Addon, AppNotification, ClientProfile, ClientServicePlan, CustomRole, CycleComment, Deliverable, Project, Registration, ServiceCycle, ServicePackage, ServicePricingSnapshot, ServiceWorkflowTemplate, Task, User } from '../types';

// Canonical persisted workspace shape shared by the secure load/save path. The
// legacy REST JSON-snapshot bridge that used to live here was removed once the
// secure command RPCs fully replaced it (see docs/SYSTEM_AUDIT_REPORT-2026-10-16.md).
export interface PersistedWorkspaceState {
  users: User[];
  clients?: ClientProfile[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  registrations: Registration[];
  rolePermissions?: CustomRole[];
  taskStatuses?: string[];
  deletedUserIds?: string[];
  deletedRoleIds?: string[];
  deletedTaskStatuses?: string[];
  deletedClientIds?: string[];
  servicePackages?: ServicePackage[];
  clientPlans?: ClientServicePlan[];
  serviceCycles?: ServiceCycle[];
  deliverables?: Deliverable[];
  cycleComments?: CycleComment[];
  addons?: Addon[];
  serviceWorkflowTemplates?: ServiceWorkflowTemplate[];
  servicePricingSnapshots?: ServicePricingSnapshot[];
}

export interface SnapshotResult {
  state: PersistedWorkspaceState;
  source: 'local' | 'supabase';
  message: string;
  version: number;
  updatedAt?: string;
}
