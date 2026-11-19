import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { supabase } from '../lib/supabaseClient';
import { SECURE_WORKSPACE_ID } from '../lib/secureWorkspace';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { getTeamWorkloadSummaries } from '../lib/taskReporting';
import { parseWorkloadRows } from '../lib/staffWorkload';
import { getTodayInputDate } from '../lib/utils';
import { useLocalToday } from './useLocalToday';

export type AssigneeWorkload = ReadonlyMap<string, { open: number; overdue: number }>;

/**
 * Open and overdue totals per person, for showing load beside a name when
 * choosing who gets a task. A PM or HOD gets the server's totals (task details
 * stay hidden); local mode counts from the tasks in memory. Returns undefined
 * until known, or when the viewer may not see totals, so callers show names only.
 */
export const useAssigneeWorkload = (enabled = true): AssigneeWorkload | undefined => {
  const today = useLocalToday();
  const todayKey = getTodayInputDate(today);
  const { mode, userId, role, tasks, users } = useStore(useShallow(state => ({
    mode: state.backend.mode, userId: state.currentUser?.id, role: state.currentUser?.role, tasks: state.tasks, users: state.users,
  })));
  const allowed = enabled && Boolean(userId) && (role === 'Project Manager' || role === 'HOD' || role === 'Staff');
  const [remote, setRemote] = React.useState<{ key: string; rows: AssigneeWorkload | null } | null>(null);
  const key = `${userId}:${todayKey}`;

  const local = React.useMemo<AssigneeWorkload | undefined>(() => {
    if (!allowed || mode === 'supabase') return undefined;
    return new Map(getTeamWorkloadSummaries(tasks, users.filter(user => user.role !== 'Client'), 'overall', today).map(item => [item.member.id, { open: item.open, overdue: item.overdue }]));
  }, [allowed, mode, tasks, today, users]);

  React.useEffect(() => {
    if (!allowed || mode !== 'supabase') return;
    let active = true;
    const session = captureWorkspaceSession();
    const controller = new AbortController();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('aitask_hod_staff_workload', { p_workspace_id: SECURE_WORKSPACE_ID, p_today: todayKey }).abortSignal(controller.signal);
        const rows = error ? null : parseWorkloadRows(data);
        if (active && isWorkspaceSessionCurrent(session)) setRemote({ key, rows: rows ? new Map(rows.map(row => [row.id, { open: row.open, overdue: row.overdue }])) : null });
      } catch {
        if (active && isWorkspaceSessionCurrent(session)) setRemote({ key, rows: null });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [allowed, key, mode, todayKey]);

  if (!allowed) return undefined;
  if (mode !== 'supabase') return local;
  return remote?.key === key && remote.rows ? remote.rows : undefined;
};
