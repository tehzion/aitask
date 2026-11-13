import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isPendingMutationResolution, useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import type { Task, User } from '../types';
import { getTaskAccess, isDepartmentScopedUser, isHodUser } from '../lib/access';
import { eligibleHodDelegationStaff, eligibleTaskStaff, isAwaitingHodAssignment, isTaskAssignmentLocked } from '../lib/taskWorkflowAccess';
import { REJECTION_CODES } from './useQuickTaskAction';

export interface QuickAssign {
  options: User[];
  assign: (memberId: string) => Promise<void>;
  busy: boolean;
}

/**
 * "Assign to…" from the list for an HOD (role UX, 10 Nov 2026). It mirrors the
 * task drawer's delegation form: only tasks that wait on this HOD, only
 * eligible Staff, and only while nothing else saves.
 * With no Staff, it returns no options and the row keeps "Start work".
 */
export const useQuickAssign = (task: Task): QuickAssign | null => {
  const state = useStore(useShallow(store => ({
    currentUser: store.currentUser,
    rolePermissions: store.rolePermissions,
    users: store.users,
    clients: store.clients,
    projects: store.projects,
    backend: store.backend,
  })));
  const [busy, setBusy] = React.useState(false);

  const options = React.useMemo(() => {
    const { currentUser, rolePermissions, users, clients, projects, backend } = state;
    if (!currentUser || task.assignedTo !== currentUser.id) return null;
    if (!isDepartmentScopedUser(currentUser, rolePermissions) || !isAwaitingHodAssignment(task) || isTaskAssignmentLocked(task)) return null;
    if (backend.upgradeRequired === true || isPendingMutationResolution(backend) || backend.isSaving || backend.hasLocalChanges || Boolean(backend.pendingMutations)) return null;
    if (!getTaskAccess(currentUser, task, rolePermissions, { users, clients, projects }).canAssign) return null;
    const project = task.projectId ? projects.find(item => item.id === task.projectId) : undefined;
    const staff = (isHodUser(currentUser, rolePermissions) ? eligibleHodDelegationStaff(users, rolePermissions) : eligibleTaskStaff(task.department, project, users, rolePermissions)).filter(user => user.id !== currentUser.id);
    return staff.length ? staff : null;
  }, [state, task]);

  const assign = React.useCallback(async (memberId: string) => {
    if (!options || busy || !options.some(user => user.id === memberId)) return;
    const toast = useToastStore.getState().addToast;
    setBusy(true);
    try {
      const local = useStore.getState().updateTaskAssignee(task.id, memberId);
      if (!local.ok) { toast(local.error || 'Unable to update the task assignee.', 'error'); return; }
      const result = await useStore.getState().commitPendingMutation('task.update');
      if (result.ok) return;
      const code = result.code || useStore.getState().backend.errorCode || '';
      if (REJECTION_CODES.includes(code)) {
        await useStore.getState().discardMutation();
        toast(result.error || 'Unable to update the task assignee.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, options, task.id]);

  return options ? { options, assign, busy } : null;
};
