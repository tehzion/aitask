import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isPendingMutationResolution, useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import type { Task } from '../types';
import { getTaskAccess, getVisibleTasks } from '../lib/access';
import { getStaffGuidedAction, isStaffGuidedActionEnabled, isTaskWaitingOnEarlierSteps } from '../lib/staffWorkspace';
import { workflowTransitionError } from '../lib/workflowReview';

export interface QuickTaskAction {
  /** English label; translate at render time. */
  label: string;
  run: () => Promise<void>;
  busy: boolean;
}

export const REJECTION_CODES = ['FORBIDDEN', 'VALIDATION', 'NOT_FOUND'];

type QuickActionState = Pick<ReturnType<typeof useStore.getState>,
  'currentUser' | 'taskStatuses' | 'rolePermissions' | 'users' | 'clients' | 'projects' | 'tasks' | 'serviceCycles' | 'deliverables' | 'backend'>;

/**
 * The pure check behind useQuickTaskAction, shared with bulk approve. Pass
 * `ignoreSaveLocks` only when the caller saves items one after another itself.
 */
export const resolveQuickTaskAction = (task: Task, state: QuickActionState, options: { ignoreSaveLocks?: boolean } = {}) => {
  const { currentUser, taskStatuses, rolePermissions, users, clients, projects, tasks, serviceCycles, deliverables, backend } = state;
  if (!currentUser) return null;
  const scope = { users, clients, projects };
  const workflow = { tasks, cycles: serviceCycles, deliverables };
  if (!isStaffGuidedActionEnabled(task, taskStatuses, currentUser, rolePermissions, scope, workflow)) return null;
  const guided = getStaffGuidedAction(task, taskStatuses, currentUser, rolePermissions, scope);
  const target = guided.targetStatus;
  if (guided.kind !== 'advance' || !target || guided.disabled) return null;
  // Same relevance rule as the row's "Next" line: decisions, or your own work.
  const isDecision = target === 'Approved' || (target === 'Completed' && task.status !== 'In Progress');
  if (!isDecision && task.assignedTo !== currentUser.id) return null;
  if (target === 'In Progress' && !task.assignedTo?.trim()) return null;
  if (!getTaskAccess(currentUser, task, rolePermissions, scope).canEdit) return null;
  const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, scope);
  // Earlier steps still open, or hidden and not confirmed done: start from the task, where the warning shows.
  if (isTaskWaitingOnEarlierSteps(task, visibleTasks)) return null;
  const gateError = workflowTransitionError(task, { ...task, status: target, isCompleted: target === 'Completed' }, currentUser, visibleTasks, serviceCycles, deliverables, rolePermissions, scope);
  if (gateError) return null;
  const locked = backend.upgradeRequired === true || isPendingMutationResolution(backend) || backend.isSaving || backend.isPulling || backend.hasLocalChanges || Boolean(backend.pendingMutations);
  if (locked && !options.ignoreSaveLocks) return null;
  return { label: guided.label, target };
};

/**
 * The one-click status change a list row may offer (click reduction, item 1).
 *
 * It applies the same checks as the task drawer's primary button: the guided
 * action and its status control, the workflow gate, unfinished predecessors,
 * edit access and the save locks. Anything that needs a choice or a note
 * (predecessor confirmation, Return with a note, output upload) returns null,
 * so the row keeps opening the drawer for it.
 */
export const useQuickTaskAction = (task: Task): QuickTaskAction | null => {
  const state = useStore(useShallow(store => ({
    currentUser: store.currentUser,
    taskStatuses: store.taskStatuses,
    rolePermissions: store.rolePermissions,
    users: store.users,
    clients: store.clients,
    projects: store.projects,
    tasks: store.tasks,
    serviceCycles: store.serviceCycles,
    deliverables: store.deliverables,
    backend: store.backend,
  })));
  const [busy, setBusy] = React.useState(false);

  const action = React.useMemo(() => resolveQuickTaskAction(task, state), [state, task]);

  const run = React.useCallback(async () => {
    if (!action || busy) return;
    const toast = useToastStore.getState().addToast;
    setBusy(true);
    try {
      const store = useStore.getState();
      const local = store.updateTaskStatus(task.id, action.target);
      if (!local.ok) { toast(local.error || 'Unable to update the task status.', 'error'); return; }
      const result = await useStore.getState().commitPendingMutation('task.update');
      if (result.ok) return;
      const code = result.code || useStore.getState().backend.errorCode || '';
      if (REJECTION_CODES.includes(code)) {
        // Nothing to preserve in a one-click status change: reload the saved task.
        await useStore.getState().discardMutation();
        toast(result.error || 'This task status could not be saved.', 'error');
      }
      // Other failures stay with the workspace save recovery (automatic retry).
    } finally {
      setBusy(false);
    }
  }, [action, busy, task.id]);

  return action ? { label: action.label, run, busy } : null;
};
