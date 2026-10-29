import React from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../types';
import type { MessageDescriptor } from '../lib/messages';
import { useStore, type MutationActionResult } from '../store';
import { canEditTask } from '../lib/access';
import { assignableTaskAssignees, getTaskAssignmentUnavailableReason } from '../lib/taskWorkflowAccess';
import { getStuckWork } from '../lib/opsSignals';
import { formatLocalizedDate } from '../lib/i18n';
import { parseOptionalDate } from '../lib/utils';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useI18n } from './I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import { Button, CountLabel, Surface } from './ui';
import SystemMessage from './SystemMessage';

const ROW_LIMIT = 6;

/** Saves a local task change, or puts the submitted row back if the server refuses it. */
const usePersistTaskChange = () => {
  const [error, setError] = React.useState<string | MessageDescriptor>('');
  const persist = React.useCallback(async (previous: Task, apply: () => MutationActionResult) => {
    setError('');
    const local = apply();
    if (!local.ok) { setError(local.error || 'Unable to save this change.'); return false; }
    const session = captureWorkspaceSession();
    const submitted = useStore.getState().tasks.find(task => task.id === previous.id);
    let result: MutationActionResult;
    try { result = await useStore.getState().commitPendingMutation('task.update'); }
    catch (failure) { result = { ok: false, error: failure instanceof Error ? failure.message : 'Unable to save this change.' }; }
    if (!isWorkspaceSessionCurrent(session)) return false;
    if (result.ok) return true;
    useStore.setState(state => ({ tasks: state.tasks.map(task => task === submitted ? { ...previous } : task) }));
    setError(result.error || 'The change was not saved. Try again.');
    return false;
  }, []);
  return { persist, error };
};

const StuckRow = ({ task, mode }: { task: Task; mode: 'overdue' | 'unassigned' }) => {
  const { t, locale } = useI18n();
  const today = useLocalToday();
  const { currentUser, users, rolePermissions, clients, projects, updateTaskDueDate, updateTaskAssignee } = useStore(useShallow(state => ({
    currentUser: state.currentUser, users: state.users, rolePermissions: state.rolePermissions, clients: state.clients,
    projects: state.projects, updateTaskDueDate: state.updateTaskDueDate, updateTaskAssignee: state.updateTaskAssignee,
  })));
  const { persist, error } = usePersistTaskChange();
  const [dueDate, setDueDate] = React.useState('');
  const [assignee, setAssignee] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const scope = { clients, projects, users };
  const canEdit = canEditTask(currentUser, task, rolePermissions, scope);
  const canAssign = canEdit && !getTaskAssignmentUnavailableReason(currentUser, task, rolePermissions, scope);
  const assignees = canAssign ? assignableTaskAssignees(currentUser, task.department, users, rolePermissions) : [];
  const due = parseOptionalDate(task.dueDate);
  const run = async (apply: () => MutationActionResult) => {
    setSaving(true);
    try { if (await persist(task, apply)) { setDueDate(''); setAssignee(''); } }
    finally { setSaving(false); }
  };
  const label = task.title;
  return <li className="space-y-2 px-5 py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="min-w-0 truncate text-sm font-semibold text-ink hover:text-accent"><span data-i18n-skip>{task.title}</span></Link>
      {mode === 'overdue' && due && <span className="shrink-0 text-xs font-semibold text-red-700">{t('{days} days overdue', { days: differenceInCalendarDays(today, due) })}</span>}
    </div>
    <p className="truncate text-xs text-muted"><span data-i18n-skip>{task.clientName}</span> · {due ? formatLocalizedDate(due, locale) : t('No deadline')} · <span data-i18n-skip>{users.find(user => user.id === task.assignedTo)?.name || t('Unassigned')}</span></p>
    {canEdit && <div className="flex flex-wrap items-center gap-2">
      {mode === 'overdue' && <>
        <input type="date" value={dueDate} min={task.startDate || undefined} onChange={event => setDueDate(event.target.value)} aria-label={t('New due date for {title}', { title: label })}
          className="min-h-11 rounded-control border border-line bg-surface px-3 text-sm text-ink" />
        <Button variant="secondary" disabled={!dueDate || saving} onClick={() => void run(() => updateTaskDueDate(task.id, dueDate))}>{t('Re-date')}</Button>
      </>}
      {canAssign && assignees.length > 0 && <>
        <select value={assignee} onChange={event => setAssignee(event.target.value)} aria-label={t('Assign {title}', { title: label })}
          className="min-h-11 max-w-[14rem] rounded-control border border-line bg-surface px-3 text-sm text-ink">
          <option value="">{t('Choose a person')}</option>
          {assignees.filter(user => user.id !== task.assignedTo).map(user => <option key={user.id} value={user.id} data-i18n-skip>{user.name}</option>)}
        </select>
        <Button variant="secondary" disabled={!assignee || saving} onClick={() => void run(() => updateTaskAssignee(task.id, assignee))}>{t('Assign')}</Button>
      </>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-700"><SystemMessage message={t(error)} /></p>}
  </li>;
};

const StuckList = ({ title, description, tasks, mode, empty }: { title: string; description: string; tasks: Task[]; mode: 'overdue' | 'unassigned'; empty: string }) => {
  const { t } = useI18n();
  return <Surface className="overflow-hidden" aria-label={title}>
    <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div><h3 className="font-semibold text-ink">{title}</h3><p className="mt-1 text-sm text-muted">{description}</p></div>
      <CountLabel>{tasks.length}</CountLabel>
    </div>
    {tasks.length === 0
      ? <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
      : <ul className="divide-y divide-line/60">{tasks.slice(0, ROW_LIMIT).map(task => <StuckRow key={task.id} task={task} mode={mode} />)}</ul>}
    {tasks.length > ROW_LIMIT && <div className="border-t border-line/70 px-5 py-3 text-sm"><Link to="/tasks?queue=needs_action" className="font-semibold text-accent hover:underline">{t('View all')} ({tasks.length})</Link></div>}
  </Surface>;
};

/** Long-overdue and unowned work in the PM's portfolio, with the fix one step away. */
const StuckWorkPanel = ({ tasks }: { tasks: Task[] }) => {
  const { t } = useI18n();
  const today = useLocalToday();
  const { overdueLong, unassigned } = React.useMemo(() => getStuckWork(tasks, today), [tasks, today]);
  if (overdueLong.length === 0 && unassigned.length === 0) return null;
  return <section aria-labelledby="pm-stuck-title" className="space-y-3">
    <div><h2 id="pm-stuck-title" className="text-lg font-semibold text-ink">{t('Stuck work')}</h2><p className="mt-1 text-sm text-muted">{t('Re-date or reassign work that has stalled so the team knows what is current.')}</p></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <StuckList title={t('Overdue more than 7 days')} description={t('Oldest first.')} tasks={overdueLong} mode="overdue" empty={t('Nothing is more than a week overdue.')} />
      <StuckList title={t('Unassigned')} description={t('Open work with nobody responsible yet.')} tasks={unassigned} mode="unassigned" empty={t('All open work has someone responsible.')} />
    </div>
  </section>;
};

export default StuckWorkPanel;
