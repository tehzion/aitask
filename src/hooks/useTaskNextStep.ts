import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import type { Task } from '../types';
import { getStaffGuidedAction, isStaffGuidedActionEnabled } from '../lib/staffWorkspace';

/** The next status change this user may make, or nothing when they cannot act. */
export const useTaskNextStep = (task: Task) => {
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
  })));
  return React.useMemo(() => {
    const scope = { users: state.users, clients: state.clients, projects: state.projects };
    const enabled = isStaffGuidedActionEnabled(task, state.taskStatuses, state.currentUser, state.rolePermissions, scope, { tasks: state.tasks, cycles: state.serviceCycles, deliverables: state.deliverables });
    if (!enabled) return null;
    // Managers may move anyone's work, but a list only prompts them for their
    // own decisions (review, completion) or for work assigned to them.
    const action = getStaffGuidedAction(task, state.taskStatuses, state.currentUser, state.rolePermissions, scope);
    const isDecision = action.targetStatus === 'Approved' || (action.targetStatus === 'Completed' && task.status !== 'In Progress');
    return isDecision || task.assignedTo === state.currentUser?.id ? action.label : null;
  }, [state, task]);
};
