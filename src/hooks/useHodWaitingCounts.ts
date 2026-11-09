import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getHodWaitingCounts } from '../lib/hodWaiting';

/** HOD "waiting for me" counts for the My work badge (sidebar and mobile bar). */
export const useHodWaitingCounts = () => {
  const state = useStore(useShallow(store => ({
    currentUser: store.currentUser,
    tasks: store.tasks,
    rolePermissions: store.rolePermissions,
    users: store.users,
    clients: store.clients,
    projects: store.projects,
  })));
  return React.useMemo(
    () => getHodWaitingCounts(state.currentUser, state.tasks, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects }),
    [state],
  );
};
