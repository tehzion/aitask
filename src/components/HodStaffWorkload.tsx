import React from 'react';
import type { CustomRole, Task, User } from '../types';
import { isHodUser } from '../lib/access';
import { getMemberDepartments } from '../lib/departments';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { getTeamWorkloadSummaries } from '../lib/taskReporting';
import { getTodayInputDate } from '../lib/utils';
import { supabase } from '../lib/supabaseClient';
import { SECURE_WORKSPACE_ID } from '../lib/secureWorkspace';
import { parseWorkloadRows, type WorkloadRow } from '../lib/staffWorkload';
import { Surface } from './ui';
import { useI18n } from './I18nProvider';

type Remote = { key: string; rows: WorkloadRow[] | null };

/** The server returns totals only; task access remains governed by normal visibility rules. */
const HodStaffWorkload = ({ userId, mode, tasks, users, roles, today }: { userId: string; mode: 'local' | 'supabase'; tasks: Task[]; users: User[]; roles: CustomRole[]; today: Date }) => {
  const { t } = useI18n();
  const todayKey = getTodayInputDate(today);
  const requestKey = `${userId}:${todayKey}`;
  const [remote, setRemote] = React.useState<Remote | null>(null);
  const localRows = React.useMemo(() => getTeamWorkloadSummaries(tasks, users.filter(user => user.role === 'Staff' && !isHodUser(user, roles)), 'overall', today)
    .map(({ member, open, overdue, dueThisWeek }) => ({ id: member.id, name: member.name, departments: getMemberDepartments(member), open, overdue, dueThisWeek })), [tasks, users, roles, today]);

  React.useEffect(() => {
    if (mode !== 'supabase') return;
    let active = true;
    const session = captureWorkspaceSession();
    let sequence = 0;
    let controller: AbortController | undefined;
    const refresh = async () => {
      const attempt = ++sequence;
      controller?.abort();
      controller = new AbortController();
      try {
        const { data, error } = await supabase.rpc('aitask_hod_staff_workload', { p_workspace_id: SECURE_WORKSPACE_ID, p_today: todayKey }).abortSignal(controller.signal);
        if (active && isWorkspaceSessionCurrent(session) && attempt === sequence) setRemote({ key: requestKey, rows: error ? null : parseWorkloadRows(data) });
      } catch {
        if (active && isWorkspaceSessionCurrent(session) && attempt === sequence) setRemote({ key: requestKey, rows: null });
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [mode, requestKey, todayKey]);

  const rows = mode === 'local' ? localRows : remote?.key === requestKey ? remote.rows : undefined;
  return <section aria-labelledby="hod-all-staff-title">
    <h2 id="hod-all-staff-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">{t('Staff workload across departments')}</h2>
    <p className="mt-1 text-sm text-muted">{t('Workload totals across all departments. Task details remain limited to your access.')} {mode === 'supabase' && t('Updates about once a minute.')}</p>
    <Surface className="mt-4 divide-y divide-line/70 overflow-hidden">
      {rows === undefined ? <p role="status" className="px-5 py-6 text-sm text-muted">{t('Loading staff workload…')}</p>
        : rows === null ? <p role="status" className="px-5 py-6 text-sm text-muted">{t('Staff workload is unavailable. Try again shortly.')}</p>
          : rows.length === 0 ? <p className="px-5 py-6 text-sm text-muted">{t('No staff members available.')}</p>
            : [...rows].sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name)).map(row => <article key={row.id} className="px-5 py-4">
              <p data-i18n-skip className="font-semibold text-ink">{row.name}</p>
              <p data-i18n-skip className="mt-1 text-xs text-muted">{row.departments.join(' · ')}</p>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-muted">{t('Active tasks')}</dt><dd className="calm-number mt-1 font-semibold text-ink">{row.open}</dd></div>
                <div><dt className="text-xs text-muted">{t('Overdue')}</dt><dd className="calm-number mt-1 font-semibold text-ink">{row.overdue}</dd></div>
                <div><dt className="text-xs text-muted">{t('Due this week')}</dt><dd className="calm-number mt-1 font-semibold text-ink">{row.dueThisWeek}</dd></div>
              </dl>
            </article>)}
    </Surface>
  </section>;
};

export default HodStaffWorkload;
