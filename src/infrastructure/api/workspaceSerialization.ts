import { stripServiceItemPrices } from '../../modules/services/domain/serviceManagement';
import {
  getLegacyDepartmentMirror,
  normalizeMemberDepartments,
} from '../../shared/authorization/departments';
import type {
  Task,
  WorkspaceMember
} from '../../shared/types/index';
import type { PersistedWorkspaceState } from '../persistence/supabaseSnapshot';
import { type BaselineRow, type MemberRow } from './workspaceContracts';
export const entityKey = (type: string, id: string) => `${type}:${id}`;

export const stable = (value: unknown) => JSON.stringify(value);

export const commandId = () => crypto.randomUUID();

export const stripRuntimeFields = <T extends Record<string, unknown>>(value: T) => {
  const copy = { ...value };
  delete copy.version;
  delete copy.updatedAt;
  delete copy.directoryOnly;
  delete copy.clientProjection;
  delete copy.visibleToCurrentUser;
  delete copy.unreadByUserIds;
  delete copy.discovered;
  return copy;
};

export const CLIENT_TASK_PROJECTION_KEYS = [
  'id',
  'clientName',
  'projectId',
  'deliverableId',
  'projectName',
  'serviceType',
  'title',
  'description',
  'startDate',
  'dueDate',
  'status',
  'completionPercentage',
  'attachmentLink',
  'attachmentName',
  'website',
  'facebookPage',
  'isCompleted',
  'completedAt',
  'clientApprovalStatus',
  'visibility',
] as const;

export const serializeClientProjectedTask = (task: Task): Record<string, unknown> => {
  const source = task as unknown as Record<string, unknown>;
  return Object.fromEntries(
    CLIENT_TASK_PROJECTION_KEYS
      .filter(key => source[key] !== undefined)
      .map(key => [key, source[key]])
  );
};

export const memberToUser = (row: MemberRow): WorkspaceMember => {
  const departments = normalizeMemberDepartments(row.role, row.departments, row.department);
  return {
    id: row.id,
    authUserId: row.auth_user_id || undefined,
    hasLogin: Boolean(row.auth_user_id),
    workspaceId: row.workspace_id,
    name: row.name,
    email: row.email || undefined,
    role: row.role,
    departments,
    department: getLegacyDepartmentMirror(row.role, departments),
    avatar: row.avatar || undefined,
    companyName: row.client_name || undefined,
    isSuperAdmin: row.is_super_admin,
    mustResetPassword: row.must_reset_password,
    customRoleId: row.custom_role_id || undefined,
    customRoleName: row.custom_role_name || undefined,
    permissions: row.permissions && Object.keys(row.permissions).length > 0 ? row.permissions : undefined,
    workerType: row.worker_type || 'employee',
    version: Number(row.version) || 1,
    updatedAt: row.updated_at,
  };
};

export const memberData = (user: WorkspaceMember): Record<string, unknown> => {
  const departments = normalizeMemberDepartments(user.role, user.departments, user.department);
  return {
    auth_user_id: user.authUserId || null,
    name: user.name,
    email: user.email || null,
    role: user.role,
    departments,
    department: getLegacyDepartmentMirror(user.role, departments),
    avatar: user.avatar || null,
    client_name: user.companyName || null,
    is_super_admin: Boolean(user.isSuperAdmin),
    must_reset_password: Boolean(user.mustResetPassword),
    custom_role_id: user.customRoleId || null,
    custom_role_name: user.customRoleName || null,
    permissions: user.permissions || {},
    worker_type: user.workerType || 'employee',
  };
};

export const stateToRows = (state: PersistedWorkspaceState, baseline: ReadonlyMap<string, BaselineRow>) => {
  const rows: BaselineRow[] = [];
  const push = (
    kind: BaselineRow['kind'],
    entityType: string,
    entityId: string,
    data: Record<string, unknown>,
    version?: number,
    parentId?: string,
  ) => {
    const normalized = stripRuntimeFields(data);
    rows.push({
      kind,
      entityType,
      entityId,
      parentId,
      version: Number(version) || 0,
      data: normalized,
      serialized: stable({ parentId: parentId || null, data: normalized }),
    });
  };

  state.users.filter(user => !user.directoryOnly).forEach(user => (
    push('member', 'member', user.id, memberData(user), user.version)
  ));
  // Clients discovered from work records exist only in the local view. Skipping
  // them here keeps them out of the command diff so a save never tries to insert
  // a placeholder that collides with a company another member owns.
  state.clients?.filter(item => !item.discovered).forEach(item => {
    const data = { ...item };
    delete data.awaitingPublication;
    push('entity', 'client', item.id, data as unknown as Record<string, unknown>, item.version);
  });
  state.projects.forEach(item => push('entity', 'project', item.id, item as unknown as Record<string, unknown>, item.version));
  state.tasks.forEach(item => {
    const { comments = [], approvalHistory = [], ...task } = item;
    delete task.reviewAccess;
    delete task.reviewEvidence;
    delete task.reviewDecision;
    delete task.workflowStepKind;
    delete task.workflowOutputVersion;
    delete task.workflowDependenciesReady;
    delete task.internalReview;
    push(
      'entity',
      'task',
      item.id,
      item.clientProjection
        ? serializeClientProjectedTask(item)
        : task as unknown as Record<string, unknown>,
      item.version,
      item.projectId,
    );
    comments.forEach(comment => push(
      'entity',
      'comment',
      comment.id,
      { ...comment, taskId: item.id } as unknown as Record<string, unknown>,
      comment.version,
      item.id,
    ));
    approvalHistory.forEach(event => push(
      'entity',
      'approval',
      event.id,
      { ...event, taskId: item.id } as unknown as Record<string, unknown>,
      event.version,
      item.id,
    ));
  });
  state.notifications.forEach(item => push('entity', 'notification', item.id, stripRuntimeFields(item as unknown as Record<string, unknown>), item.version));
  state.registrations.forEach(item => push('entity', 'registration', item.id, item as unknown as Record<string, unknown>, item.version));
  state.rolePermissions?.forEach(item => push('entity', 'custom_role', item.id, item as unknown as Record<string, unknown>, item.version));
  state.taskStatuses?.forEach(status => {
    const existing = baseline.get(entityKey('task_status', status));
    push('entity', 'task_status', status, { status }, existing?.version);
  });
  state.servicePackages?.forEach(item => push('entity', 'service_package', item.id, item as unknown as Record<string, unknown>, item.version));
  state.clientPlans?.forEach(item => push('entity', 'client_plan', item.id, {
    ...item,
    serviceItems: stripServiceItemPrices(item.serviceItems),
    discountValue: 0,
    taxRateBps: 0,
  } as unknown as Record<string, unknown>, item.version, item.clientId));
  state.serviceCycles?.forEach(item => push('entity', 'service_cycle', item.id, {
    ...item,
    serviceItems: stripServiceItemPrices(item.serviceItems),
    addonSnapshots: (item.addonSnapshots || []).map(addon => ({ ...addon, unitPriceMinor: 0 })),
    discountValue: 0,
    taxRateBps: 0,
  } as unknown as Record<string, unknown>, item.version, item.planId));
  state.deliverables?.forEach(item => push('entity', 'deliverable', item.id, item as unknown as Record<string, unknown>, item.version, item.cycleId));
  state.cycleComments?.forEach(item => push('entity', 'cycle_comment', item.id, item as unknown as Record<string, unknown>, item.version, item.cycleId));
  state.addons?.forEach(item => push('entity', 'addon', item.id, { ...item, unitPriceMinor: 0 } as unknown as Record<string, unknown>, item.version, item.planId));
  state.serviceWorkflowTemplates?.forEach(item => push('entity', 'service_workflow_template', item.id, item as unknown as Record<string, unknown>, item.version));
  state.servicePricingSnapshots?.forEach(item => push('entity', 'service_pricing_snapshot', item.id, item as unknown as Record<string, unknown>, item.version, item.parentId));
  return rows;
};
