import { BACKEND_UPGRADE_REQUIRED_MESSAGE } from '../../../infrastructure/api/workspaceContracts';
import { loadSecureBackendCapabilities } from '../../../infrastructure/api/secureWorkspace';
import { isWorkspaceMutationLocked, pendingMutationMessage } from '../../../infrastructure/commands/mutationGuard';
import {
  shouldUseSecureSupabase
} from '../../../infrastructure/database/supabaseClient';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../../../infrastructure/persistence/workspaceSession';
import { safeHttpsUrl } from '../../../infrastructure/serialization/security';
import {
  canAssignTasksToOthers,
  canCommentOnTask,
  canCreateTasks,
  canDeleteTask,
  canEditTask,
  canOpenServiceClient,
  canReviewTaskAsClient,
  getAssignableProjects,
  isBossKoo,
  isHodUser
} from '../../../shared/authorization/access';
import {
  isEligibleTaskAssignee,
  isMemberInDepartment
} from '../../../shared/authorization/departments';
import { canRequestTaskRevision, eligibleTaskHods, eligibleTaskStaff, getDepartmentReviewers, resolveTaskAssignmentState, TASK_HOD_REQUIRED, taskAssignmentStageError, taskTransitionError } from '../../../shared/authorization/taskWorkflowAccess';
import { queueActionFeedback, taskStatusMessage } from '../../../shared/feedback/actionFeedback';
import { useToastStore } from '../../../shared/feedback/useToastStore';
import { msg } from '../../../shared/i18n/messages';
import { getEffectiveTaskApprovalMode, isClosedProject } from '../../../shared/rules/projectManagement';
import { isTaskCompleted, isTaskOpen, resolveTaskCompletedAt } from '../../../shared/rules/taskCompletion';
import { getTaskProgress } from '../../../shared/rules/taskProgress';
import { isWorkflowTask, workflowTransitionError } from '../../../shared/rules/workflowReview';
import {
  type AppNotification,
  type Task,
  type TaskApprovalEvent,
  type TaskComment,
  type TaskStatus
} from '../../../shared/types/index';
import { type MutationActionResult, type StoreState, type WorkspaceGet, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { isValidIsoDate, normalizeOptionalIsoDate, normalizeRequiredStartDate, nowId } from '../../../shared/validation/workspaceInput';
import { normalizeClientKey, taskCompanyScopeError } from '../../clients/application/clientScope';
import { appendNotification, localHodReviewNotifications, makeNotification, resolveTaskUpdateRecipientIds, shouldNotifyClientForTask, taskUpdateNotifications } from '../../notifications/application/notificationRules';
import { deriveServiceProgress } from '../../services/application/serviceProgress';
import { deliverableLinkError } from '../../services/domain/deliveryLinks';
import { applyTaskWorkIntent, recordTaskWorkTransition, taskEvidenceError } from '../domain/staffWorkflow';
import { allowedDepartments, allowedPriorities, HOD_RESTRICTED_TASK_FIELDS, resolveTaskStatus } from './taskRules';
export const createTasksActions = (set: WorkspaceSet, get: WorkspaceGet): Pick<StoreState, "setCreateTaskModalOpen" | "openCreateTaskForDeliverable" | "updateTaskWork" | "updateTaskStatus" | "updateTaskPriority" | "updateTaskAssignee" | "overrideTaskAssignee" | "updateTaskAttachment" | "updateTaskDueDate" | "attachTaskOutput" | "attachTaskSupportingFile" | "setTaskReviewConfig" | "updateTask" | "deleteTask" | "reviewClientApproval" | "requestRevision" | "addTask" | "addComment" | "addTaskStatus" | "deleteTaskStatus"> => ({
  setCreateTaskModalOpen: (open) => set((state) => ({
    isCreateTaskModalOpen: open,
    createTaskInitialDate: open ? state.createTaskInitialDate : undefined,
    createTaskInitialAssignee: open ? state.createTaskInitialAssignee : undefined,
    createTaskInitialClientId: open ? state.createTaskInitialClientId : undefined,
    createTaskInitialClientName: open ? state.createTaskInitialClientName : undefined,
    createTaskInitialServiceType: open ? state.createTaskInitialServiceType : undefined,
    createTaskInitialCycleId: open ? state.createTaskInitialCycleId : undefined,
    createTaskInitialDeliverableId: open ? state.createTaskInitialDeliverableId : undefined,
  })),
  openCreateTaskForDeliverable: (data) => set({
    isCreateTaskModalOpen: true,
    createTaskInitialClientId: data.clientId,
    createTaskInitialClientName: data.clientName,
    createTaskInitialServiceType: data.serviceType,
    createTaskInitialCycleId: data.cycleId,
    createTaskInitialDeliverableId: data.deliverableId,
  }),
  updateTaskWork: (taskId, intent) => {
    const state = get();
    const task = state.tasks.find(item => item.id === taskId);
    const actor = state.currentUser;
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    if (!actor || actor.role === 'Client' || !task || !canEditTask(actor, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) return { ok: false, error: 'You do not have permission to edit this task.' };
    if (!isTaskOpen(task)) return { ok: false, error: 'Only open tasks can accept work or request help.' };
    if (intent.kind === 'accept' && task.assignedTo !== actor.id) return { ok: false, error: 'Only the current assignee can accept this task.' };
    if (intent.kind === 'block' && (!intent.reason?.trim() || intent.reason.trim().length > 2000)) return { ok: false, error: 'Describe the blocker in 1–2000 characters.' };
    if (!['accept', 'block', 'unblock'].includes(intent.kind)) return { ok: false, error: 'Choose a valid work action.' };
    if (intent.kind === 'accept' && task.workState?.acceptedBy === actor.id) return { ok: true };
    if (intent.kind === 'unblock' && !task.workState?.blocker) return { ok: true };
    const updated = applyTaskWorkIntent(task, intent, actor.id);
    updated.completionPercentage = getTaskProgress(updated, state.users);
    const notices = taskUpdateNotifications(resolveTaskUpdateRecipientIds(state.users, task, state.clients, state.projects, state.rolePermissions), {
      title: 'Task Status Updated', message: `"${task.title}": ${intent.kind === 'accept' ? 'assignment accepted' : intent.kind === 'block' ? 'help requested' : 'blocker cleared'} by ${actor.name}.`,
      route: { page: 'tasks', entityId: taskId }, iconType: intent.kind === 'block' ? 'alert' : 'success',
      category: intent.kind === 'block' ? 'feedback' : 'status', importance: intent.kind === 'block' ? 'action' : 'informational',
    }, actor.id);
    queueActionFeedback(actor.id, `task:${taskId}:work`, msg(intent.kind === 'accept' ? 'feedback.assignmentAccepted' : intent.kind === 'block' ? 'feedback.helpRequested' : 'feedback.blockerCleared'), saved => saved.tasks.some(item => item.id === taskId && (intent.kind === 'accept' ? item.workState?.acceptedBy === actor.id : intent.kind === 'block' ? item.workState?.blocker?.reason === intent.reason?.trim() : !item.workState?.blocker)));
    const newTasks = state.tasks.map(item => item.id === taskId ? updated : item);
    set({ tasks: newTasks, notifications: [...notices, ...state.notifications], ...deriveServiceProgress(get(), newTasks, state.deliverables, state.serviceCycles) });
    return { ok: true };
  },
  updateTaskStatus: (taskId, status) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to update the task status.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const task = state.tasks.find(t => t.id === taskId);
      const currentUser = state.currentUser;
      if (!task || !canEditTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to edit this task.' };
        return state;
      }

      const nextStatus = resolveTaskStatus(status, state.taskStatuses);
      if (!nextStatus) {
        useToastStore.getState().addToast(msg('task.statusRequired'), 'warning');
        result = { ok: false, error: 'Choose a valid task status.' };
        return state;
      }

      if (nextStatus === task.status && task.isCompleted === (nextStatus === 'Completed')) { result = { ok: true }; return state; }

      const isCompleted = nextStatus === 'Completed';
      const transitionError = taskTransitionError(currentUser, task, { ...task, status: nextStatus, isCompleted }, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
      if (transitionError) { result = { ok: false, error: transitionError }; return state; }
      const evidenceError = taskEvidenceError(task, { ...task, status: nextStatus, isCompleted }, state.deliverables, state.tasks);
      if (evidenceError) { result = { ok: false, error: evidenceError }; return state; }
      const workflowError = workflowTransitionError(task, { ...task, status: nextStatus, isCompleted }, currentUser, state.tasks, state.serviceCycles, state.deliverables, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
      if (workflowError) { result = { ok: false, error: workflowError }; return state; }
      const isWaitingApproval = nextStatus === 'Waiting Approval';
      if (state.backend.mode === 'local' && isWaitingApproval && task.status !== nextStatus && !getDepartmentReviewers(state.users, { ...task, workState: { ...task.workState, reviewRequestedBy: currentUser!.id } }, state.rolePermissions, { clients: state.clients, projects: state.projects }).length) { result = { ok: false, error: TASK_HOD_REQUIRED }; return state; }
      const isReadyForClientReview = isCompleted || isWaitingApproval;
      const wasCompleted = isTaskCompleted(task);
      const now = new Date().toISOString();

      const newTasks = state.tasks.map(t => {
        if (t.id !== taskId) return t;

        const completionPercentage = isReadyForClientReview
          ? 100
          : wasCompleted || t.completionPercentage === 100
            ? 90
            : t.completionPercentage;

        const returningForRevision = ['In Progress', 'Revision'].includes(nextStatus) && ['Waiting Approval', 'Approved', 'Completed'].includes(t.status);

        const updated = recordTaskWorkTransition(t, {
          ...t,
          status: nextStatus,
          isCompleted,
          completedAt: resolveTaskCompletedAt(t, isCompleted, now),
          completionPercentage,
          // Internal work transitions never record or clear the Client's
          // separate delivery decision.
          clientApprovalStatus: t.clientApprovalStatus,
          revisionCount: returningForRevision ? t.revisionCount + 1 : t.revisionCount,
          updatedAt: now,
        }, currentUser!.id, now);
        return { ...updated, completionPercentage: getTaskProgress(updated, state.users) };
      });

      // Initial review submission already has its canonical reviewer handoff,
      // so reviewers are notified there and filtered from the generic notice.
      const submittedForReview = isWaitingApproval && task.status !== nextStatus;
      const reviewerIds = new Set(
        getDepartmentReviewers(
          state.users,
          { ...task, workState: { ...task.workState, reviewRequestedBy: currentUser!.id } },
          state.rolePermissions,
          { clients: state.clients, projects: state.projects },
        ).map(reviewer => reviewer.id),
      );
      const newNotifs: AppNotification[] = taskUpdateNotifications(
        resolveTaskUpdateRecipientIds(state.users, task, state.clients, state.projects, state.rolePermissions)
          .filter(id => !(submittedForReview && reviewerIds.has(id))),
        {
          title: 'Task Status Updated',
          message: `"${task.title}" was moved to ${nextStatus} by ${currentUser?.name}.`,
          route: { page: 'tasks', entityId: taskId },
          iconType: 'status',
        },
        currentUser?.id,
      );

      // Returning submitted work to the assignee must reach them even though
      // they are excluded from the accountability broadcast above.
      const returningWork = ['Waiting Approval', 'Approved', 'Completed'].includes(task.status)
        && ['Pending', 'In Progress', 'Revision'].includes(nextStatus);
      if (returningWork && task.assignedTo && task.assignedTo !== currentUser?.id
        && !newNotifs.some(notification => notification.targetUserId === task.assignedTo)) {
        appendNotification(newNotifs, {
          targetUserId: task.assignedTo,
          title: 'Task Status Updated',
          message: `"${task.title}" was returned to you by ${currentUser?.name}.`,
          route: { page: 'tasks', entityId: taskId },
          iconType: 'status',
        });
      }

      if (state.backend.mode === 'local') newNotifs.push(...localHodReviewNotifications(
        state.users, state.rolePermissions, task, newTasks.find(item => item.id === taskId)!, currentUser!.id, { clients: state.clients, projects: state.projects },
      ));

      if (shouldNotifyClientForTask(task, nextStatus)) {
        appendNotification(newNotifs, {
          targetClient: task.clientName,
          title: isCompleted ? 'Task Completed' : 'Task Ready for Approval',
          message: `"${task.title}" is ready for client review.`,
          route: { page: 'tasks', entityId: taskId },
          iconType: 'success'
        });
      }

      queueActionFeedback(currentUser!.id, `task:${taskId}:status`, taskStatusMessage(nextStatus), saved => saved.tasks.some(item => item.id === taskId && item.status === nextStatus));

      result = { ok: true };
      return {
        tasks: newTasks,
        notifications: [...newNotifs, ...(state.notifications || [])],
        ...deriveServiceProgress(get(), newTasks, state.deliverables, state.serviceCycles),
      };
    });
    return result;
  },
  updateTaskPriority: (taskId, priority) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to update the task priority.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const task = state.tasks.find(t => t.id === taskId);
      const currentUser = state.currentUser;
      if (!task || !canEditTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to edit this task.' };
        return state;
      }
      if (!allowedPriorities.has(priority)) {
        useToastStore.getState().addToast(msg('task.priorityRequired'), 'warning');
        result = { ok: false, error: 'Choose a valid priority.' };
        return state;
      }

      const newTasks = state.tasks.map(t => {
        if (t.id !== taskId) return t;
        return recordTaskWorkTransition(t, { ...t, priority, updatedAt: new Date().toISOString() }, currentUser!.id);
      });

      queueActionFeedback(state.currentUser!.id, `task:${taskId}:priority`, msg('task.priorityUpdated', { priority }), saved => saved.tasks.some(item => item.id === taskId && item.priority === priority));

      result = { ok: true };
      return { tasks: newTasks };
    });
    return result;
  },
  updateTaskAssignee: (taskId, assignedTo) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to update the task assignee.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const task = state.tasks.find(t => t.id === taskId);
      const currentUser = state.currentUser;
      if (!task || !canEditTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to edit this task.' };
        return state;
      }
      if (assignedTo === task.assignedTo) {
        result = { ok: true };
        return state;
      }
      if (!canAssignTasksToOthers(currentUser, state.rolePermissions, task, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to reassign this task.' };
        return state;
      }

      const assigneeUser = assignedTo ? state.users.find(u => u.id === assignedTo && u.role !== 'Client') : undefined;
      if (assignedTo && !assigneeUser) {
        result = { ok: false, error: 'Choose a valid internal assignee.' };
        return state;
      }
      if (assigneeUser?.hasLogin === false) {
        result = { ok: false, error: 'Choose an active internal assignee.' };
        return state;
      }
      const project = task.projectId ? state.projects.find(item => item.id === task.projectId) : undefined;
      const responsibleHodId = task.responsibleHodId
        || (task.assignedTo && isHodUser(state.users.find(user => user.id === task.assignedTo), state.rolePermissions)
          ? task.assignedTo
          : isHodUser(currentUser, state.rolePermissions) && isMemberInDepartment(currentUser, task.department)
            ? currentUser.id
            : undefined);
      const eligibleHods = eligibleTaskHods(task.department, project, state.users, state.rolePermissions);
      if (assigneeUser && isHodUser(assigneeUser, state.rolePermissions)
        && currentUser.role === 'Project Manager'
        && !eligibleHods.some(user => user.id === assigneeUser.id)) {
        result = { ok: false, error: 'Choose an HOD assigned to this project and department.' };
        return state;
      }
      if (assigneeUser && assigneeUser.role === 'Staff' && !isHodUser(assigneeUser, state.rolePermissions)
        && isHodUser(currentUser, state.rolePermissions)) {
        const eligibleStaff = eligibleTaskStaff(task.department, project, state.users, state.rolePermissions);
        if (!eligibleStaff.some(user => user.id === assigneeUser.id)
          || (responsibleHodId && responsibleHodId !== currentUser.id)) {
          result = { ok: false, error: 'Choose Staff assigned to this project and department.' };
          return state;
        }
      }
      if (assigneeUser && project && !isBossKoo(currentUser)) {
        const eligibleProjectAssignee = isHodUser(assigneeUser, state.rolePermissions)
          ? eligibleHods.some(user => user.id === assigneeUser.id)
          : assigneeUser.role === 'Staff'
            ? eligibleTaskStaff(task.department, project, state.users, state.rolePermissions).some(user => user.id === assigneeUser.id)
            : assigneeUser.role === 'Project Manager'
              ? (project.projectManagerIds !== undefined
                ? project.projectManagerIds.includes(assigneeUser.id)
                : project.createdBy === assigneeUser.id)
              : false;
        if (!eligibleProjectAssignee) {
          result = { ok: false, error: 'Choose a member assigned to this project and department.' };
          return state;
        }
      }
      if (!assignedTo && isHodUser(currentUser, state.rolePermissions) && responsibleHodId) {
        assignedTo = responsibleHodId;
      }
      if (!assignedTo && task.assignmentState === 'pending_hod' && responsibleHodId) {
        assignedTo = responsibleHodId;
      }
      if (assigneeUser && !isEligibleTaskAssignee(assigneeUser, task.department)) {
        useToastStore.getState().addToast(msg('errors.assigneeDepartment', { name: assigneeUser.name, department: task.department }), 'warning');
        result = { ok: false, error: `${assigneeUser.name} is not in the ${task.department} department.` };
        return state;
      }
      const stageError = taskAssignmentStageError(currentUser, task, assignedTo, state.users, state.rolePermissions, { project });
      if (stageError) {
        useToastStore.getState().addToast(stageError, 'warning');
        result = { ok: false, error: stageError };
        return state;
      }
      // Submitted, approved, finished or cancelled work cannot change hands;
      // otherwise a Completed task silently transfers ownership, an Approved
      // task is reopened without the protected-output contract, a submitted
      // task is reset to Pending, or cancelled work pings a new assignee.
      if (['Waiting Approval', 'Approved', 'Completed', 'Cancelled'].includes(task.status) || task.isCompleted) {
        result = { ok: false, error: 'Return this work for revision before reassigning it.' };
        return state;
      }

      const nextAssigneeUser = assignedTo ? state.users.find(user => user.id === assignedTo) : undefined;
      const nextResponsibleHodId = nextAssigneeUser && isHodUser(nextAssigneeUser, state.rolePermissions)
        ? nextAssigneeUser.id
        : responsibleHodId;
      const shouldPersistAssignmentRouting = Boolean(task.assignmentState || task.responsibleHodId || nextResponsibleHodId);
      const nextAssignmentState = shouldPersistAssignmentRouting
        ? resolveTaskAssignmentState(assignedTo, nextResponsibleHodId, nextAssigneeUser)
        : task.assignmentState;
      const newTasks = state.tasks.map(t => {
        if (t.id !== taskId) return t;
        const now = new Date().toISOString();
        const updated = recordTaskWorkTransition(t, {
          ...t,
          assignedTo,
          responsibleHodId: nextResponsibleHodId,
          assignmentState: nextAssignmentState,
          status: ['Completed', 'Cancelled'].includes(t.status) ? t.status : 'Pending',
          clientApprovalStatus: t.clientApprovalStatus,
          // The database trigger stamps the authoritative assignment actor
          // and time. HOD route updates must not send a client-controlled
          // timestamp through the HOD permission boundary; keep the local
          // timestamp stable until the server response is pulled.
          assignedBy: currentUser?.id || t.assignedBy,
          assignedAt: isHodUser(currentUser, state.rolePermissions) ? t.assignedAt : now,
          updatedAt: now,
        }, currentUser!.id, now);
        return { ...updated, completionPercentage: getTaskProgress(updated, state.users) };
      });

      const newNotifs: AppNotification[] = [];
      if (assignedTo && assignedTo !== task.assignedTo) {
        appendNotification(newNotifs, {
          targetUserId: assignedTo,
          title: 'Task Assigned To You',
          message: `"${task.title}" has been assigned to you by ${currentUser?.name}.`,
          route: { page: 'tasks', entityId: taskId },
          iconType: 'task'
        });
      }

      queueActionFeedback(currentUser!.id, `task:${taskId}:assignee`, nextAssigneeUser ? msg('task.assignedTo', { name: nextAssigneeUser.name }) : msg('task.unassigned'), saved => saved.tasks.some(item => item.id === taskId && item.assignedTo === assignedTo));

      result = { ok: true };
      return {
        tasks: newTasks,
        notifications: [...newNotifs, ...(state.notifications || [])],
        ...deriveServiceProgress(get(), newTasks, state.deliverables, state.serviceCycles),
      };
    });
    return result;
  },
  overrideTaskAssignee: (taskId, assignedTo, reason) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to override the task assignee.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const currentUser = state.currentUser;
      const task = state.tasks.find(item => item.id === taskId);
      const trimmedReason = reason.trim().slice(0, 2000);
      if (!currentUser || currentUser.role !== 'Project Manager' || !task || !trimmedReason) {
        result = { ok: false, error: 'A Project Manager override reason is required.' };
        return state;
      }
      if (!canEditTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })
        || !canAssignTasksToOthers(currentUser, state.rolePermissions, task, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to override this task assignment.' };
        return state;
      }
      const target = state.users.find(user => user.id === assignedTo && user.role === 'Staff' && !isHodUser(user, state.rolePermissions));
      const project = task.projectId ? state.projects.find(item => item.id === task.projectId) : undefined;
      if (!target || !eligibleTaskStaff(task.department, project, state.users, state.rolePermissions).some(user => user.id === target.id)) {
        result = { ok: false, error: 'Choose Staff assigned to this project and department.' };
        return state;
      }
      if (['Waiting Approval', 'Approved', 'Completed', 'Cancelled'].includes(task.status) || task.isCompleted) {
        result = { ok: false, error: 'Return this work for revision before reassigning it.' };
        return state;
      }
      const now = new Date().toISOString();
      const updatedTask = recordTaskWorkTransition(task, {
        ...task,
        assignedTo: target.id,
        assignmentState: 'assigned_staff',
        assignedBy: currentUser.id,
        assignedAt: now,
        assignmentOverride: { actorId: currentUser.id, reason: trimmedReason, createdAt: now },
        status: 'Pending',
        clientApprovalStatus: task.clientApprovalStatus,
        updatedAt: now,
      }, currentUser.id, now);
      const newTasks = state.tasks.map(item => item.id === taskId
        ? { ...updatedTask, completionPercentage: getTaskProgress(updatedTask, state.users) }
        : item);
      const notices: AppNotification[] = [];
      appendNotification(notices, {
        targetUserId: target.id,
        title: 'Task Assigned To You',
        message: `"${task.title}" was assigned to you by ${currentUser.name}.`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'task',
      });
      queueActionFeedback(currentUser.id, `task:${taskId}:assignee-override`, msg('task.assignedTo', { name: target.name }), saved => saved.tasks.some(item => item.id === taskId && item.assignedTo === target.id));
      result = { ok: true };
      return {
        tasks: newTasks,
        notifications: [...notices, ...(state.notifications || [])],
        ...deriveServiceProgress(get(), newTasks, state.deliverables, state.serviceCycles),
      };
    });
    return result;
  },
  updateTaskAttachment: (taskId, attachmentLink, attachmentName) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to update the task attachment.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const task = state.tasks.find(t => t.id === taskId);
      if (!task || !canEditTask(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to edit this task.' };
        return state;
      }

      // Validate that the attachment link is a safe http(s) URL
      const trimmedLink = attachmentLink.trim();
      const validatedLink = trimmedLink ? safeHttpsUrl(trimmedLink) : null;
      if (trimmedLink && !validatedLink) {
        result = { ok: false, error: 'Enter a valid https:// link for the attachment.' };
        return state;
      }

      const transitionError = taskTransitionError(state.currentUser, task, { ...task, attachmentLink: validatedLink || undefined, attachmentName: attachmentName?.trim().slice(0, 200) || undefined }, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
      if (transitionError) { result = { ok: false, error: transitionError }; return state; }
      queueActionFeedback(state.currentUser!.id, `task:${taskId}:attachment`, msg('task.attachmentUpdated'), saved => saved.tasks.some(item => item.id === taskId && (item.attachmentLink || '') === (validatedLink || '') && (item.attachmentName || '') === (attachmentName?.trim().slice(0, 200) || '')));

      result = { ok: true };
      const tasks = state.tasks.map(task =>
        task.id === taskId
          ? recordTaskWorkTransition(task, {
            ...task,
            attachmentLink: validatedLink || undefined,
            attachmentName: attachmentName?.trim().slice(0, 200) || undefined,
            updatedAt: new Date().toISOString()
          }, state.currentUser!.id)
          : task
      );
      return deriveServiceProgress(get(), tasks, state.deliverables, state.serviceCycles);
    });
    return result;
  },
  updateTaskDueDate: (taskId, newDueDate) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to update the due date.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const task = state.tasks.find(t => t.id === taskId);
      if (!task || !canEditTask(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
        result = { ok: false, error: 'You do not have permission to edit this task.' };
        return state;
      }
      const nextDueDate = normalizeOptionalIsoDate(newDueDate);

      if (nextDueDate && !isValidIsoDate(nextDueDate)) {
        useToastStore.getState().addToast(msg('task.dueDateRequired'), 'warning');
        result = { ok: false, error: 'Enter a valid due date.' };
        return state;
      }

      if (nextDueDate && isValidIsoDate(task.startDate) && new Date(nextDueDate) < new Date(task.startDate)) {
        useToastStore.getState().addToast(msg('task.dueDateOrder'), 'warning');
        result = { ok: false, error: 'The due date cannot be earlier than the start date.' };
        return state;
      }

      queueActionFeedback(state.currentUser!.id, `task:${taskId}:dates`, msg('feedback.datesSaved'), saved => saved.tasks.some(item => item.id === taskId && (item.dueDate || '') === (nextDueDate || '')));

      result = { ok: true };
      return {
        tasks: state.tasks.map(t =>
          t.id === taskId ? recordTaskWorkTransition(t, { ...t, dueDate: nextDueDate, dueReminderSent: false, updatedAt: new Date().toISOString() }, state.currentUser!.id) : t
        ),
      };
    });
    return result;
  },
  attachTaskOutput: async (taskId, attachment) => {
    const session = captureWorkspaceSession();
    const actions = await import('./taskReviewActions');
    if (!isWorkspaceSessionCurrent(session)) return { ok: false, error: 'Your session changed. Sign in again.' };
    return actions.attachTaskOutput(get(), set, pendingMutationMessage, taskId, attachment);
  },
  attachTaskSupportingFile: async (taskId, attachment) => {
    const session = captureWorkspaceSession();
    const actions = await import('./taskReviewActions');
    if (!isWorkspaceSessionCurrent(session)) return { ok: false, error: 'Your session changed. Sign in again.' };
    return actions.attachTaskSupportingFile(get(), set, pendingMutationMessage, taskId, attachment);
  },
  setTaskReviewConfig: async (taskId, config) => {
    const session = captureWorkspaceSession();
    if (get().backend.mode === 'supabase' && config.requiresInternalApproval !== undefined) {
      const capability = await loadSecureBackendCapabilities();
      if (!capability.compatible || !capability.capabilities.optionalTaskApproval) return { ok: false, error: BACKEND_UPGRADE_REQUIRED_MESSAGE };
    }
    const actions = await import('./taskReviewActions');
    if (!isWorkspaceSessionCurrent(session)) return { ok: false, error: 'Your session changed. Sign in again.' };
    return actions.setTaskReviewConfig(get(), set, pendingMutationMessage, taskUpdateNotifications, taskId, config);
  },
  updateTask: (taskId, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const task = state.tasks.find(t => t.id === taskId);
    if (!currentUser || !task || !canEditTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
      return { ok: false, error: 'You do not have permission to edit this task.' };
    }

    const requestedCreatorId = (data as Partial<Task>).createdBy;
    if (requestedCreatorId !== undefined && requestedCreatorId !== task.createdBy) {
      return { ok: false, error: 'Task ownership cannot be changed.' };
    }
    const workflowKeys = ['reviewEvidence', 'reviewAccess', 'reviewDecision', 'reviewCover', 'accountableLeadId', 'requiresInternalApproval', 'approvalMode', 'outputAttachments', 'workflowStepKind', 'workflowStepId', 'workflowStepOrder', 'workflowStepRequired', 'workflowTemplateId', 'workflowTemplateRevision', 'generatedFromDeliverable', 'predecessorTaskIds', 'workflowOutputVersion', 'workflowDependenciesReady', 'internalReview'];
    if (workflowKeys.some(key => Object.prototype.hasOwnProperty.call(data, key))) return { ok: false, error: 'Workflow identity and review records cannot be edited directly.' };
    if (isWorkflowTask(task) && (['deliverableId', 'serviceCycleId', 'clientId', 'department', 'visibility'] as const).some(key => data[key] !== undefined && data[key] !== task[key])) return { ok: false, error: 'Workflow identity and review records cannot be edited directly.' };

    const canAssignOthers = canAssignTasksToOthers(currentUser, state.rolePermissions, task, { users: state.users, clients: state.clients, projects: state.projects });
    if (isHodUser(currentUser, state.rolePermissions)) {
      const requested = data as Record<string, unknown>;
      const restrictedFieldChanged = HOD_RESTRICTED_TASK_FIELDS.some(field => (
        Object.prototype.hasOwnProperty.call(requested, field)
        && JSON.stringify(requested[field] ?? null) !== JSON.stringify((task as unknown as Record<string, unknown>)[field] ?? null)
      ));
      if (restrictedFieldChanged) {
        return { ok: false, error: 'HODs can edit task execution details, but not project, company, service, or department ownership.' };
      }
    }
    const nextAssigneeId = data.assignedTo ?? task.assignedTo;
    if (!canAssignOthers && nextAssigneeId !== task.assignedTo) {
      return { ok: false, error: 'You do not have permission to reassign this task.' };
    }

    const nextDepartment = data.department ?? task.department;
    if (!canAssignOthers && nextDepartment !== task.department) {
      return { ok: false, error: 'You do not have permission to change the task department.' };
    }
    if (canAssignOthers && ['Staff', 'HOD'].includes(currentUser.role) && !isBossKoo(currentUser) && !isMemberInDepartment(currentUser, nextDepartment)) {
      return { ok: false, error: 'You can only manage tasks within your departments.' };
    }
    const requestedClientName = data.clientName !== undefined ? data.clientName.trim() : task.clientName;
    if (!canAssignOthers && requestedClientName.toLowerCase() !== task.clientName.toLowerCase()) {
      return { ok: false, error: 'You do not have permission to change the client.' };
    }
    const requestedServiceType = data.serviceType !== undefined ? data.serviceType.trim() : task.serviceType;
    if (!canAssignOthers && requestedServiceType.toLowerCase() !== task.serviceType.toLowerCase()) {
      return { ok: false, error: 'You do not have permission to change the service.' };
    }

    const assignee = nextAssigneeId ? state.users.find(user => user.id === nextAssigneeId && user.role !== 'Client') : undefined;
    if (nextAssigneeId && !assignee) return { ok: false, error: 'Choose a valid internal assignee.' };
    const assignmentChanged = nextAssigneeId !== task.assignedTo || nextDepartment !== task.department;
    if (assignmentChanged && assignee?.hasLogin === false) return { ok: false, error: 'Choose an active internal assignee.' };
    if (assignmentChanged && assignee && !isEligibleTaskAssignee(assignee, nextDepartment)) {
      return { ok: false, error: `${assignee.name} is not assigned to ${nextDepartment}.` };
    }
    const nextProjectForAssignment = (data.projectId ?? task.projectId)
      ? state.projects.find(item => item.id === (data.projectId ?? task.projectId))
      : undefined;
    if (assignmentChanged && assignee && nextProjectForAssignment && !isBossKoo(currentUser)) {
      const eligibleProjectAssignee = isHodUser(assignee, state.rolePermissions)
        ? eligibleTaskHods(nextDepartment, nextProjectForAssignment, state.users, state.rolePermissions).some(user => user.id === assignee.id)
        : assignee.role === 'Staff'
          ? eligibleTaskStaff(nextDepartment, nextProjectForAssignment, state.users, state.rolePermissions).some(user => user.id === assignee.id)
          : assignee.role === 'Project Manager'
            ? (nextProjectForAssignment.projectManagerIds !== undefined
              ? nextProjectForAssignment.projectManagerIds.includes(assignee.id)
              : nextProjectForAssignment.createdBy === assignee.id)
            : false;
      if (!eligibleProjectAssignee) return { ok: false, error: 'Choose a member assigned to this project and department.' };
    }
    const nextEligibleHods = eligibleTaskHods(nextDepartment, nextProjectForAssignment, state.users, state.rolePermissions);
    const currentResponsibleHodId = task.responsibleHodId
      || (task.assignedTo && isHodUser(state.users.find(user => user.id === task.assignedTo), state.rolePermissions) ? task.assignedTo : undefined)
      || (assignmentChanged && isHodUser(currentUser, state.rolePermissions) && isMemberInDepartment(currentUser, task.department) ? currentUser.id : undefined);
    const nextResponsibleHodId = assignee && isHodUser(assignee, state.rolePermissions)
      ? assignee.id
      : currentResponsibleHodId;
    const shouldPersistAssignmentRouting = Boolean(task.assignmentState || task.responsibleHodId || nextResponsibleHodId);
    if (nextResponsibleHodId && !nextEligibleHods.some(user => user.id === nextResponsibleHodId)) {
      return { ok: false, error: 'Choose an HOD assigned to this project and department.' };
    }
    if (assignmentChanged && assignee && assignee.role === 'Staff' && !isHodUser(assignee, state.rolePermissions)
      && isHodUser(currentUser, state.rolePermissions)
      && !eligibleTaskStaff(nextDepartment, nextProjectForAssignment, state.users, state.rolePermissions).some(user => user.id === assignee.id)) {
      return { ok: false, error: 'Choose Staff assigned to this project and department.' };
    }
    if (assignmentChanged && currentUser.role === 'Project Manager' && assignee && isHodUser(assignee, state.rolePermissions)
      && !nextEligibleHods.some(user => user.id === assignee.id)) {
      return { ok: false, error: 'Choose an HOD assigned to this project and department.' };
    }
    if (assignmentChanged) {
      // Submitted, approved, finished or cancelled work cannot change hands,
      // matching updateTaskAssignee.
      if (['Waiting Approval', 'Approved', 'Completed', 'Cancelled'].includes(task.status) || task.isCompleted) {
        return { ok: false, error: 'Return this work for revision before reassigning it.' };
      }
      // Stage 1 must also hold when the department changes into one with an
      // HOD while the current assignee stays a staff member; otherwise a PM
      // could route work around the HOD checkpoint by editing the department.
      const stageError = taskAssignmentStageError(currentUser, { department: nextDepartment }, nextAssigneeId, state.users, state.rolePermissions, { project: nextProjectForAssignment });
      if (stageError) return { ok: false, error: stageError };
    }

    const hasProjectInput = Object.prototype.hasOwnProperty.call(data, 'projectId');
    const requestedProjectId = hasProjectInput ? data.projectId?.trim() || undefined : task.projectId;
    const project = requestedProjectId
      ? state.projects.find(item => item.id === requestedProjectId)
      : undefined;

    if (requestedProjectId && !project) {
      return { ok: false, error: 'Selected company or project was not found.' };
    }

    if (requestedProjectId) {
      const assignableProjectIds = new Set(
        getAssignableProjects(currentUser, state.projects, state.tasks, state.rolePermissions, state.users, { clients: state.clients, projects: state.projects }).map(item => item.id)
      );
      if (!assignableProjectIds.has(requestedProjectId)) {
        return { ok: false, error: 'You can only link tasks to projects you can access.' };
      }
      if (data.milestoneId && !(project?.milestones || []).some(milestone => milestone.id === data.milestoneId)) {
        return { ok: false, error: 'Choose a milestone from the selected project.' };
      }
    } else if (data.milestoneId) {
      return { ok: false, error: 'Choose a project before linking a milestone.' };
    }

    const title = data.title !== undefined ? data.title.trim() : task.title;
    const clientName = project
      ? project.clientName
      : data.clientName !== undefined
        ? data.clientName.trim()
        : task.clientName;
    const companyChanged = normalizeClientKey(clientName) !== normalizeClientKey(task.clientName)
      || requestedProjectId !== task.projectId;
    const clientId = data.clientId ?? (companyChanged
      ? project?.clientId || state.clients.find(client => normalizeClientKey(client.clientName) === normalizeClientKey(clientName))?.id
      : task.clientId);
    if (companyChanged || clientId !== task.clientId) {
      const companyError = taskCompanyScopeError(state, clientName, clientId);
      if (companyError) return { ok: false, error: companyError };
      if (project?.clientId && clientId !== project.clientId) return { ok: false, error: 'Choose a company from the Companies database.' };
      if (isWorkflowTask(task) && clientId !== task.clientId) return { ok: false, error: 'Workflow identity and review records cannot be edited directly.' };
    }
    // Ordinary-task link changes must satisfy the same rules as
    // linkTaskToDeliverable instead of bypassing the explicit validator.
    if (!isWorkflowTask(task) && data.deliverableId) {
      const nextCycleId = data.serviceCycleId ?? task.serviceCycleId;
      const deliverableError = deliverableLinkError(
        { id: taskId, clientId, deliverableId: data.deliverableId, serviceCycleId: nextCycleId },
        state.deliverables.find(item => item.id === data.deliverableId),
        state.deliverables,
      );
      if (deliverableError) return { ok: false, error: deliverableError };
    }
    if (!isWorkflowTask(task) && data.visibility !== undefined && data.visibility !== task.visibility
      && (task.status !== 'Pending' || task.isCompleted)) return { ok: false, error: 'Task visibility cannot change after work has started.' };
    const serviceType = data.serviceType !== undefined ? data.serviceType.trim() : task.serviceType;
    const startDate = data.startDate !== undefined ? normalizeRequiredStartDate(data.startDate) : normalizeRequiredStartDate(task.startDate);
    const dueDate = data.dueDate !== undefined ? normalizeOptionalIsoDate(data.dueDate) : task.dueDate;
    const status = data.status !== undefined
      ? resolveTaskStatus(data.status, state.taskStatuses)
      : task.status;

    if (!title) return { ok: false, error: 'Task title is required.' };
    if (!clientName) return { ok: false, error: 'Client or brand name is required.' };
    if (!serviceType) return { ok: false, error: 'Service type is required.' };
    if (!isValidIsoDate(startDate) || (dueDate && !isValidIsoDate(dueDate))) {
      return { ok: false, error: 'Start date must be valid. Due date must be valid when provided.' };
    }
    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      return { ok: false, error: 'Due date cannot be earlier than the start date.' };
    }
    if (data.status !== undefined && !status) return { ok: false, error: 'Choose a valid task status.' };
    if (data.priority !== undefined && !allowedPriorities.has(data.priority)) {
      return { ok: false, error: 'Choose a valid priority.' };
    }

    const safeFacebookPage = data.facebookPage !== undefined
      ? (data.facebookPage.trim() ? safeHttpsUrl(data.facebookPage) : undefined)
      : task.facebookPage;
    const safeWebsite = data.website !== undefined
      ? (data.website.trim() ? safeHttpsUrl(data.website) : undefined)
      : task.website;
    const safeAttachmentLink = data.attachmentLink !== undefined
      ? (data.attachmentLink.trim() ? safeHttpsUrl(data.attachmentLink) : undefined)
      : task.attachmentLink;

    if ((data.facebookPage?.trim() && !safeFacebookPage) || (data.website?.trim() && !safeWebsite) || (data.attachmentLink?.trim() && !safeAttachmentLink)) {
      return { ok: false, error: 'Links must be valid HTTPS URLs.' };
    }

    const statusChanged = data.status !== undefined && status !== task.status;
    const wasCompleted = isTaskCompleted(task);
    const isCompleted = statusChanged ? status === 'Completed' : task.isCompleted;
    const isReadyForClientReview = status === 'Completed' || status === 'Waiting Approval';
    const now = new Date().toISOString();
    let updatedTask: Task = {
      ...task,
      ...data,
      projectId: requestedProjectId,
      projectName: project
        ? project.projectName
        : data.projectName !== undefined
          ? data.projectName.trim() || undefined
          : task.projectName,
      clientName,
      clientId,
      serviceType,
      title,
      description: data.description !== undefined ? data.description.trim() : task.description,
      customerDetails: data.customerDetails !== undefined ? data.customerDetails.trim() : task.customerDetails,
      facebookPage: safeFacebookPage || undefined,
      website: safeWebsite || undefined,
      assignedTo: nextAssigneeId,
      responsibleHodId: nextResponsibleHodId,
      assignmentState: shouldPersistAssignmentRouting
        ? resolveTaskAssignmentState(nextAssigneeId, nextResponsibleHodId, assignee)
        : task.assignmentState,
      assignedBy: assignmentChanged ? currentUser.id : task.assignedBy,
      assignedAt: assignmentChanged && !isHodUser(currentUser, state.rolePermissions) ? now : task.assignedAt,
      startDate,
      dueDate,
      status,
      isCompleted,
      completedAt: statusChanged
        ? resolveTaskCompletedAt(task, isCompleted, now)
        : task.completedAt,
      completionPercentage: statusChanged && isReadyForClientReview
        ? 100
        : data.completionPercentage !== undefined
          ? Math.max(0, Math.min(statusChanged && wasCompleted ? 90 : 100, Number(data.completionPercentage) || 0))
          : statusChanged && (wasCompleted || task.completionPercentage === 100)
            ? 90
            : task.completionPercentage,
      // Status/revision history is internal workflow state. Client acceptance
      // is written only by reviewClientApproval.
      clientApprovalStatus: task.clientApprovalStatus,
      attachmentLink: safeAttachmentLink || undefined,
      attachmentName: data.attachmentName !== undefined ? data.attachmentName.trim() || undefined : task.attachmentName,
      notes: data.notes !== undefined ? data.notes.trim() || undefined : task.notes,
      updatedAt: now,
    };

    if (assignmentChanged && !['Completed', 'Cancelled'].includes(task.status) && (data.status === undefined || data.status === task.status)) {
      updatedTask.status = 'Pending';
    }
    if (['In Progress', 'Revision'].includes(updatedTask.status) && ['Waiting Approval', 'Approved', 'Completed'].includes(task.status)) {
      updatedTask.revisionCount = task.revisionCount + 1;
    }
    if (state.backend.mode === 'local' && updatedTask.status === 'Waiting Approval' && task.status !== updatedTask.status && !getDepartmentReviewers(state.users, { ...updatedTask, workState: { ...updatedTask.workState, reviewRequestedBy: currentUser.id } }, state.rolePermissions, { clients: state.clients, projects: state.projects }).length) return { ok: false, error: TASK_HOD_REQUIRED };
    const evidenceError = taskEvidenceError(task, updatedTask, state.deliverables, state.tasks);
    if (evidenceError) return { ok: false, error: evidenceError };
    const transitionError = taskTransitionError(currentUser, task, updatedTask, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
    if (transitionError) return { ok: false, error: transitionError };
    updatedTask = recordTaskWorkTransition(task, updatedTask, currentUser.id, now);
    updatedTask.completionPercentage = getTaskProgress(updatedTask, state.users);
    const workflowError = workflowTransitionError(task, updatedTask, currentUser, state.tasks, state.serviceCycles, state.deliverables, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
    if (workflowError) return { ok: false, error: workflowError };
    if (state.backend.mode === 'local') delete updatedTask.reviewOverrideReason;
    // A department change invalidates any review configuration scoped to the
    // previous department (accountable lead / temporary cover).
    if (nextDepartment !== task.department) {
      updatedTask.accountableLeadId = undefined;
      updatedTask.reviewCover = undefined;
    }

    const notifications: AppNotification[] = [];
    if (state.backend.mode === 'local') notifications.push(...localHodReviewNotifications(
      state.users, state.rolePermissions, task, updatedTask, currentUser.id, { clients: state.clients, projects: state.projects },
    ));
    const datesChanged = task.startDate !== updatedTask.startDate || task.dueDate !== updatedTask.dueDate;
    const instructionsChanged = ['title', 'description', 'notes', 'priority'].some(field => (
      JSON.stringify(task[field as keyof Task] ?? null) !== JSON.stringify(updatedTask[field as keyof Task] ?? null)
    ));
    if (datesChanged || instructionsChanged) {
      const accountableRecipients = [...new Set([
        ...resolveTaskUpdateRecipientIds(state.users, updatedTask, state.clients, state.projects, state.rolePermissions),
        updatedTask.assignedTo,
      ].filter((id): id is string => Boolean(id)))];
      if (datesChanged) notifications.push(...taskUpdateNotifications(accountableRecipients, {
        title: 'Task Dates Updated',
        message: `The start date or due date for "${updatedTask.title}" was updated by ${currentUser.name}.`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'status',
        category: 'deadline',
        importance: 'action',
      }, currentUser.id));
      if (instructionsChanged && !statusChanged && task.status !== 'Waiting Approval') notifications.push(...taskUpdateNotifications(accountableRecipients, {
        title: 'Task Instructions Updated',
        message: `The brief or execution details for "${updatedTask.title}" were updated by ${currentUser.name}.`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'task',
        category: 'feedback',
        importance: 'action',
      }, currentUser.id));
    }
    if (task.status !== updatedTask.status && updatedTask.status === 'Approved') notifications.push(...taskUpdateNotifications(
      resolveTaskUpdateRecipientIds(state.users, updatedTask, state.clients, state.projects, state.rolePermissions), {
      title: 'Task Status Updated', message: `"${updatedTask.title}" was approved by ${currentUser.name}.`,
      route: { page: 'tasks', entityId: taskId }, iconType: 'status',
    }, currentUser.id,
    ));
    if (updatedTask.assignedTo && updatedTask.assignedTo !== task.assignedTo) {
      appendNotification(notifications, {
        targetUserId: updatedTask.assignedTo,
        title: 'Task Assigned To You',
        message: `"${updatedTask.title}" has been assigned to you by ${currentUser.name}.`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'task'
      });
    }
    if (statusChanged && shouldNotifyClientForTask(updatedTask, status)) {
      appendNotification(notifications, {
        targetClient: updatedTask.clientName,
        title: status === 'Completed' ? 'Task Completed' : 'Task Ready for Approval',
        message: `"${updatedTask.title}" is ready for client review.`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'success',
      });
    }

    set(current => {
      const tasks = current.tasks.map(item => item.id === taskId ? updatedTask : item);
      return {
        tasks,
        notifications: [...notifications, ...(current.notifications || [])],
        ...deriveServiceProgress(get(), tasks, current.deliverables, current.serviceCycles),
      };
    });

    queueActionFeedback(currentUser!.id, `task:${taskId}:details`, msg('task.updated', { title: updatedTask.title }), saved => saved.tasks.some(item => item.id === taskId && Object.keys(data).every(key => JSON.stringify(item[key as keyof Task] ?? '') === JSON.stringify(updatedTask[key as keyof Task] ?? ''))));
    return { ok: true };
  },
  deleteTask: (taskId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const task = state.tasks.find(item => item.id === taskId);
    if (!currentUser || !task || !canDeleteTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
      return { ok: false, error: 'You do not have permission to delete this task.' };
    }

    const serverGeneratesStaffDeleteNotification = shouldUseSecureSupabase() && ['Staff', 'HOD'].includes(currentUser.role);
    const notifications = serverGeneratesStaffDeleteNotification
      ? []
      : taskUpdateNotifications(
        resolveTaskUpdateRecipientIds(state.users, task, state.clients, state.projects, state.rolePermissions),
        {
          title: 'Task Deleted',
          message: `${currentUser.name} deleted "${task.title}".`,
          route: { page: 'tasks', entityId: taskId },
          iconType: 'alert',
        },
        currentUser.id,
      );

    set(current => {
      const tasks = current.tasks.filter(item => item.id !== taskId);
      const now = new Date().toISOString();
      const deliverables = current.deliverables.map(item => {
        const removedFromLinks = item.taskIds.includes(taskId);
        const clearsPrimary = item.primaryTaskId === taskId;
        if (!removedFromLinks && !clearsPrimary) return item;
        return {
          ...item,
          taskIds: removedFromLinks ? item.taskIds.filter(id => id !== taskId) : item.taskIds,
          primaryTaskId: clearsPrimary ? undefined : item.primaryTaskId,
          updatedAt: now,
        };
      });
      return {
        tasks,
        notifications: [
          ...notifications,
          ...(current.notifications || []).filter(item => item.route?.entityId !== taskId),
        ],
        ...deriveServiceProgress(get(), tasks, deliverables, current.serviceCycles),
      };
    });
    return { ok: true };
  },
  reviewClientApproval: (taskId, status, note) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to review this task.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      if (status !== 'Approved' && status !== 'Rejected') {
        result = { ok: false, error: 'Choose an approval decision.' };
        return state;
      }
      const currentUser = state.currentUser;
      const task = state.tasks.find(t => t.id === taskId);
      if (!currentUser || !task || !canReviewTaskAsClient(currentUser, task, state.rolePermissions)) {
        result = { ok: false, error: 'You do not have permission to review this task.' };
        return state;
      }

      const reviewNote = note?.trim() || '';
      if ([...reviewNote].length > 2000 || (status === 'Rejected' && !reviewNote)) {
        result = { ok: false, error: reviewNote ? 'Decision notes must be 2,000 characters or less.' : 'Tell the team what needs to change before sending the request.' };
        return state;
      }
      const now = new Date().toISOString();
      const event: TaskApprovalEvent = {
        id: nowId('A'),
        userId: currentUser.id,
        status,
        note: reviewNote || undefined,
        createdAt: now,
      };

      const newTasks = state.tasks.map(t => {
        if (t.id !== taskId) return t;

        const preserveCompletion = status === 'Approved' && (t.status === 'Completed' || t.isCompleted);
        const nextStatus: TaskStatus = preserveCompletion ? 'Completed' : status === 'Approved' ? 'Approved' : 'In Progress';
        // Record the decision through the canonical transition helper so review
        // metadata (reviewRequestedBy/acceptedBy/blocker) and history stay in
        // step with every other status change. The client's decision is stored
        // in approvalHistory; the internal reviewDecision is preserved because
        // recordTaskWorkTransition would otherwise stamp the client as reviewer.
        const transitioned = recordTaskWorkTransition(t, {
          ...t,
          clientApprovalStatus: status,
          status: nextStatus,
          reviewDecision: status === 'Approved' ? t.reviewDecision : undefined,
          isCompleted: preserveCompletion,
          completedAt: preserveCompletion ? t.completedAt : undefined,
          revisionCount: status === 'Rejected' ? t.revisionCount + 1 : t.revisionCount,
          approvalHistory: [...(t.approvalHistory || []), event],
          updatedAt: now,
        }, currentUser.id, now);
        return {
          ...transitioned,
          reviewDecision: status === 'Approved' ? t.reviewDecision : undefined,
          completionPercentage: preserveCompletion ? 100 : status === 'Approved' ? 80 : getTaskProgress(transitioned, state.users),
        };
      });

      const notifications: AppNotification[] = [];
      if (!shouldUseSecureSupabase()) {
        const recipients = new Set([
          ...resolveTaskUpdateRecipientIds(state.users, task, state.clients, state.projects, state.rolePermissions),
          task.assignedTo,
        ]);
        notifications.push(...taskUpdateNotifications(
          [...recipients],
          {
            title: status === 'Approved' ? 'Client Approved Task' : 'Client Requested Revision',
            message: `${currentUser.name} ${status === 'Approved' ? 'approved' : 'rejected'} "${task.title}"${reviewNote ? `: ${reviewNote}` : '.'}`,
            route: { page: 'tasks', entityId: taskId },
            iconType: status === 'Approved' ? 'success' : 'alert',
          },
          currentUser.id,
        ));
      }


      result = { ok: true };
      return {
        tasks: newTasks,
        notifications: [...notifications, ...(state.notifications || [])],
        // Hosted clients receive projected tasks; the server derives progress
        // from the complete task chain. Local workspaces derive it here.
        ...(currentUser.role === 'Client' && shouldUseSecureSupabase() ? {} : deriveServiceProgress(get(), newTasks, state.deliverables, state.serviceCycles)),
      };
    });
    return result;
  },
  requestRevision: (taskId, note) => {
    let result: MutationActionResult = { ok: false, error: 'Unable to request a revision.' };
    set((state) => {
      if (isWorkspaceMutationLocked(state)) {
        useToastStore.getState().addToast(pendingMutationMessage, 'warning');
        result = { ok: false, error: pendingMutationMessage };
        return state;
      }
      const currentUser = state.currentUser;
      const task = state.tasks.find(t => t.id === taskId);
      const scope = { users: state.users, clients: state.clients, projects: state.projects };
      if (!currentUser || !task || !canRequestTaskRevision(currentUser, task, state.rolePermissions, scope) || !canEditTask(currentUser, task, state.rolePermissions, scope)) {
        result = { ok: false, error: 'You do not have permission to request a revision.' };
        return state;
      }
      // A revision may only withdraw work that was actually submitted for review.
      // Without this guard an unguarded call could revive a Cancelled task or push
      // a never-reviewed task into revision and corrupt its client acceptance.
      if (!['Waiting Approval', 'Approved', 'Completed'].includes(task.status)) {
        result = { ok: false, error: 'Request a revision only after work has been submitted for review.' };
        return state;
      }
      if (!task.assignedTo?.trim()) {
        result = { ok: false, error: 'Assign a responsible person before requesting a revision.' };
        return state;
      }

      const revisionComment: TaskComment | null = note?.trim()
        ? {
          id: nowId('C'),
          userId: currentUser.id,
          text: `Revision requested: ${note.trim()}`,
          createdAt: new Date().toISOString(),
        }
        : null;

      const now = new Date().toISOString();
      const newTasks = state.tasks.map(t => {
        if (t.id !== taskId) return t;

        const updated = recordTaskWorkTransition(t, {
          ...t,
          revisionCount: t.revisionCount + 1,
          // Internal revision requests do not create a Client rejection.
          clientApprovalStatus: t.clientApprovalStatus,
          status: 'In Progress' as TaskStatus,
          isCompleted: false,
          completedAt: undefined,
          reviewDecision: undefined,
          reviewOverrideReason: undefined,
          comments: revisionComment ? [...(t.comments || []), revisionComment] : t.comments,
          updatedAt: now,
        }, currentUser.id, now);
        return { ...updated, completionPercentage: getTaskProgress(updated, state.users) };
      });

      queueActionFeedback(currentUser.id, `task:${taskId}:revision`, msg('task.revisionRequested'), saved => saved.tasks.some(item => item.id === taskId && item.revisionCount === task.revisionCount + 1 && item.status === 'In Progress'));

      const revisionNotification = makeNotification({
        targetUserId: task.assignedTo,
        title: 'Revision Requested',
        message: `${currentUser.name} requested a revision on "${task.title}".`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'alert'
      });

      result = { ok: true };
      return {
        tasks: newTasks,
        notifications: [
          ...(revisionNotification ? [revisionNotification] : []),
          ...(state.notifications || [])
        ],
        ...deriveServiceProgress(get(), newTasks, state.deliverables, state.serviceCycles),
      };
    });
    return result;
  },
  addTask: (taskData) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) {
      useToastStore.getState().addToast(pendingMutationMessage, 'warning');
      return '';
    }
    const currentUser = state.currentUser;
    if (!currentUser || !canCreateTasks(currentUser, state.rolePermissions)) return '';
    if (taskData.createdBy !== undefined && taskData.createdBy !== currentUser.id) return '';
    if (['Staff', 'HOD'].includes(currentUser.role) && !isMemberInDepartment(currentUser, taskData.department)) return '';
    const project = taskData.projectId
      ? state.projects.find(item => item.id === taskData.projectId)
      : undefined;
    if (taskData.projectId && !project) return '';
    const projectHods = eligibleTaskHods(taskData.department, project, state.users, state.rolePermissions);
    const requestedHodId = taskData.responsibleHodId || (taskData.assignedTo && isHodUser(state.users.find(user => user.id === taskData.assignedTo), state.rolePermissions) ? taskData.assignedTo : undefined);
    let resolvedAssigneeId = taskData.assignedTo;
    let resolvedResponsibleHodId = requestedHodId;
    let resolvedAssignmentState = taskData.assignmentState;
    if (currentUser.role === 'Project Manager' && resolveTaskStatus(taskData.status, state.taskStatuses) !== 'Waiting Approval') {
      // UI-created tasks carry the explicit pending_hod marker and must
      // resolve a HOD. Older programmatic/import paths without that marker
      // remain compatible when no HOD has ever been configured.
      if (!projectHods.length && (taskData.assignmentState !== undefined || taskData.responsibleHodId !== undefined)) return '';
      if (!projectHods.length) {
        // No project HOD means the legacy direct-to-Staff route remains valid.
        // Do not label an assigned task needs_hod: that route requires an
        // empty assignee and would contradict the actual owner.
        resolvedAssignmentState = resolvedAssigneeId ? undefined : taskData.assignmentState;
      } else {
        if (projectHods.length > 1 && !requestedHodId) return '';
        if (requestedHodId && !projectHods.some(user => user.id === requestedHodId)) return '';
        resolvedResponsibleHodId = requestedHodId || projectHods[0].id;
        resolvedAssigneeId = resolvedResponsibleHodId;
        resolvedAssignmentState = 'pending_hod';
      }
    }
    const assignee = resolvedAssigneeId ? state.users.find(user => user.id === resolvedAssigneeId && user.role !== 'Client') : undefined;
    if (resolvedAssigneeId && !assignee) return '';
    if (assignee?.hasLogin === false) return '';
    if (assignee && !canAssignTasksToOthers(currentUser, state.rolePermissions, undefined, { users: state.users, clients: state.clients, projects: state.projects }) && assignee.id !== currentUser.id) return '';
    if (assignee && !isEligibleTaskAssignee(assignee, taskData.department)) return '';
    if (assignee && project && !isBossKoo(currentUser)) {
      const eligibleProjectAssignee = isHodUser(assignee, state.rolePermissions)
        ? projectHods.some(user => user.id === assignee.id)
        : assignee.role === 'Staff'
          ? eligibleTaskStaff(taskData.department, project, state.users, state.rolePermissions).some(user => user.id === assignee.id)
          : assignee.role === 'Project Manager'
            ? (project.projectManagerIds !== undefined
              ? project.projectManagerIds.includes(assignee.id)
              : project.createdBy === assignee.id)
            : false;
      if (!eligibleProjectAssignee) return '';
    }
    // Creating a task already submitted for review is the PM handing work to
    // the reviewer directly, so the HOD-first assignment rule does not apply.
    const stageError = taskAssignmentStageError(currentUser, taskData, resolvedAssigneeId, state.users, state.rolePermissions, { allowDirectStaff: resolveTaskStatus(taskData.status, state.taskStatuses) === 'Waiting Approval', project });
    if (stageError) { useToastStore.getState().addToast(stageError, 'warning'); return ''; }

    if (taskData.projectId) {
      if (isClosedProject(project)) return '';
      if (taskData.milestoneId && !(project.milestones || []).some(milestone => milestone.id === taskData.milestoneId)) return '';
      const assignableProjectIds = new Set(
        getAssignableProjects(currentUser, state.projects, state.tasks, state.rolePermissions, state.users, { clients: state.clients, projects: state.projects }).map(item => item.id)
      );
      if (!assignableProjectIds.has(taskData.projectId)) return '';
    }
    // Deliverable links are validated for every role, not only Staff/HOD.
    // Otherwise a Project Manager could attach work to another portfolio's
    // deliverable and mutate its derived status.
    if (taskData.deliverableId) {
      const serviceDeliverable = state.deliverables.find(item => item.id === taskData.deliverableId);
      const deliverableClientId = project?.clientId || taskData.clientId;
      if (deliverableLinkError(
        { id: '', clientId: deliverableClientId, deliverableId: taskData.deliverableId, serviceCycleId: taskData.serviceCycleId },
        serviceDeliverable,
        state.deliverables,
      )) return '';
      if (!canOpenServiceClient(currentUser, serviceDeliverable!.clientName, state.tasks, state.rolePermissions, state.clients, state.projects)) return '';
    }

    const title = taskData.title.trim();
    const clientName = project ? project.clientName : taskData.clientName.trim();
    const clientId = project?.clientId || taskData.clientId || state.clients.find(client => normalizeClientKey(client.clientName) === normalizeClientKey(clientName))?.id;
    if (taskCompanyScopeError(state, clientName, taskData.clientId || clientId)) return '';
    if (project?.clientId && taskData.clientId && project.clientId !== taskData.clientId) return '';
    const serviceType = taskData.serviceType.trim();
    const startDate = normalizeRequiredStartDate(taskData.startDate);
    const dueDate = normalizeOptionalIsoDate(taskData.dueDate);
    const status = resolveTaskStatus(taskData.status, state.taskStatuses);

    if (!title || !clientName || !serviceType) return '';
    if (!allowedDepartments.has(taskData.department) || taskData.department === 'Client') return '';
    if (!allowedPriorities.has(taskData.priority)) return '';
    if (!status) return '';
    if (!isValidIsoDate(startDate) || (dueDate && !isValidIsoDate(dueDate))) return '';
    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) return '';

    if (state.backend.mode === 'local' && status === 'Waiting Approval' && !getDepartmentReviewers(state.users, taskData, state.rolePermissions, { clients: state.clients, projects: state.projects }).length) { useToastStore.getState().addToast(TASK_HOD_REQUIRED, 'warning'); return ''; }
    const taskId = nowId('T');
    const transitionError = taskTransitionError(currentUser, undefined, { ...taskData, assignedTo: resolvedAssigneeId || '', status, isCompleted: status === 'Completed' }, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
    if (transitionError) { useToastStore.getState().addToast(transitionError, 'warning'); return ''; }
    if (taskEvidenceError(undefined, { ...taskData, id: taskId, status, isCompleted: status === 'Completed', revisionCount: 0, clientApprovalStatus: 'Pending' }, state.deliverables)) {
      useToastStore.getState().addToast(msg('staff.evidenceRequired'), 'warning');
      return '';
    }
    set((state) => {
      if (!canCreateTasks(state.currentUser, state.rolePermissions)) return state;

      const now = new Date().toISOString();
      const isCompleted = status === 'Completed';
      const newTask: Task = {
        ...taskData,
        id: taskId,
        createdBy: currentUser.id,
        assignedTo: resolvedAssigneeId || '',
        responsibleHodId: resolvedResponsibleHodId,
        assignmentState: resolvedAssignmentState || resolveTaskAssignmentState(resolvedAssigneeId, resolvedResponsibleHodId, assignee),
        assignedBy: currentUser.id,
        assignedAt: now,
        clientId,
        title,
        clientName,
        projectName: project ? project.projectName : taskData.projectName,
        serviceType,
        startDate,
        dueDate,
        status,
        isCompleted,
        completedAt: isCompleted ? now : undefined,
        revisionCount: 0,
        clientApprovalStatus: 'Pending',
        visibility: taskData.visibility || 'client-visible',
        requiresInternalApproval: getEffectiveTaskApprovalMode(taskData, state.projects) !== 'none',
        dueReminderSent: false,
        approvalHistory: [],
        workHistory: [],
        workState: status === 'Waiting Approval' ? { reviewRequestedBy: currentUser.id, reviewRequestedAt: now } : {},
        updatedAt: now,
      };
      newTask.completionPercentage = getTaskProgress(newTask, state.users);

      const tasks = [...state.tasks, newTask];
      const deliverables = taskData.deliverableId
        ? state.deliverables.map(item => item.id === taskData.deliverableId
          ? { ...item, taskIds: Array.from(new Set([...item.taskIds, taskId])), updatedAt: now }
          : item)
        : state.deliverables;
      return {
        tasks,
        ...deriveServiceProgress(get(), tasks, deliverables, state.serviceCycles),
        notifications: [
          ...(state.backend.mode === 'local' ? localHodReviewNotifications(state.users, state.rolePermissions, undefined, newTask, currentUser.id, { clients: state.clients, projects: state.projects }) : []),
          ...(['Staff', 'HOD'].includes(currentUser.role)
            ? taskUpdateNotifications(
              resolveTaskUpdateRecipientIds(state.users, newTask, state.clients, state.projects, state.rolePermissions)
                .filter(id => id !== taskData.assignedTo),
              {
                title: 'Task Created by Staff',
                message: `${currentUser.name} created a new task: "${title}".`,
                route: { page: 'tasks', entityId: taskId },
                iconType: 'task',
              },
              currentUser.id,
            )
            : []),
          ...(resolvedAssigneeId
            ? (() => {
              const assignmentNotification = makeNotification({
                targetUserId: resolvedAssigneeId,
                title: 'New Task Assigned',
                message: `You have been assigned a new task: "${title}".`,
                route: { page: 'tasks', entityId: taskId },
                iconType: 'task'
              });
              return assignmentNotification ? [assignmentNotification] : [];
            })()
            : []),
          ...(state.notifications || [])
        ]
      };
    });

    queueActionFeedback(currentUser!.id, `task:${taskId}:create`, msg('task.created', { title: taskData.title }), saved => saved.tasks.some(item => item.id === taskId && item.title === title && item.assignedTo === (resolvedAssigneeId || '')));
    return taskId;
  },
  addComment: (taskId, text) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const task = state.tasks.find(t => t.id === taskId);
    if (!currentUser || !task || !canCommentOnTask(currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })) {
      return { ok: false, error: 'You do not have permission to comment on this task.' };
    }

    // Client feedback must match the server limit without losing text.
    if (currentUser.role === 'Client' && [...text.trim()].length > 2000) {
      return { ok: false, error: 'Feedback must be 2,000 characters or less.' };
    }
    const safeText = currentUser.role === 'Client' ? text.trim() : text.trim().slice(0, 2000);
    if (!safeText) return { ok: false, error: 'Comment cannot be empty.' };

    const newComment: TaskComment = {
      id: nowId('C'),
      userId: currentUser.id,
      text: safeText,
      createdAt: new Date().toISOString(),
    };

    const newTasks = state.tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, comments: [...(t.comments || []), newComment], updatedAt: new Date().toISOString() };
      }
      return t;
    });

    const newNotifs: AppNotification[] = [];
    const serverGeneratesClientNotifications = shouldUseSecureSupabase() && currentUser.role === 'Client';
    if (!serverGeneratesClientNotifications) {
      newNotifs.push(...taskUpdateNotifications(
        resolveTaskUpdateRecipientIds(state.users, task, state.clients, state.projects, state.rolePermissions)
          .filter(id => id !== task.assignedTo),
        {
          title: currentUser.role === 'Client' ? 'Client Feedback' : 'New Comment',
          message: `${currentUser.name} commented on "${task.title}".`,
          route: { page: 'tasks', entityId: taskId },
          iconType: 'status',
        },
        currentUser.id,
      ));
    }

    if (!serverGeneratesClientNotifications && task.assignedTo && task.assignedTo !== currentUser.id) {
      appendNotification(newNotifs, {
        targetUserId: task.assignedTo,
        title: currentUser.role === 'Client' ? 'Client Feedback' : 'New Comment',
        message: `${currentUser.name} commented on your task "${task.title}".`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'status'
      });
    }

    if (currentUser.role !== 'Client' && task.visibility !== 'internal' && task.clientName) {
      appendNotification(newNotifs, {
        targetClient: task.clientName,
        title: 'Team Update',
        message: `${currentUser.name} posted an update on "${task.title}".`,
        route: { page: 'tasks', entityId: taskId },
        iconType: 'status'
      });
    }

    set({
      tasks: newTasks,
      notifications: [...newNotifs, ...(state.notifications || [])]
    });
    if (currentUser.role !== 'Client') queueActionFeedback(currentUser.id, `task:${taskId}:comment:${newComment.id}`, msg('feedback.workUpdateAdded'), saved => saved.tasks.some(item => item.id === taskId && item.comments?.some(comment => comment.id === newComment.id)));
    return { ok: true, id: newComment.id };
  },
  addTaskStatus: (status) => {
    if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };
    if (!isBossKoo(get().currentUser)) return { ok: false, error: 'Only Boss Koo can manage task statuses.' };
    const trimmed = status.trim();
    if (!trimmed) {
      return { ok: false, error: 'Status name cannot be empty.' };
    }
    if (trimmed.length > 50) {
      return { ok: false, error: 'Status name must be 50 characters or less.' };
    }
    const exists = get().taskStatuses.some(
      (s) => s.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      return { ok: false, error: 'A status with this name already exists.' };
    }
    set((state) => ({
      taskStatuses: [...state.taskStatuses, trimmed],
      deletedTaskStatuses: (state.deletedTaskStatuses || []).filter(s => s.toLowerCase() !== trimmed.toLowerCase())
    }));
    return { ok: true };
  },
  deleteTaskStatus: (status) => {
    if (isWorkspaceMutationLocked(get())) return { ok: false, error: pendingMutationMessage };
    if (!isBossKoo(get().currentUser)) return { ok: false, error: 'Only Boss Koo can manage task statuses.' };
    const DEFAULTS = ['Pending', 'In Progress', 'Waiting Approval', 'Completed', 'Cancelled'];
    if (DEFAULTS.some(d => d.toLowerCase() === status.toLowerCase())) {
      return { ok: false, error: 'Cannot delete default system status.' };
    }
    const inUse = get().tasks.some(task => task.status.toLowerCase() === status.toLowerCase());
    if (inUse) {
      return { ok: false, error: 'Cannot delete status because it is currently assigned to tasks.' };
    }
    set((state) => ({
      taskStatuses: state.taskStatuses.filter(s => s.toLowerCase() !== status.toLowerCase()),
      deletedTaskStatuses: Array.from(new Set([...(state.deletedTaskStatuses || []), status.toLowerCase()]))
    }));
    return { ok: true };
  }
});
