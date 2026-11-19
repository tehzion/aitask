import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import '../lib/pageCopy';
import { useStore } from '../store';
import type { Task } from '../types';
import { REJECTION_CODES } from '../hooks/useQuickTaskAction';
import { commonAssignees, runBulkSave, type BulkOutcome } from '../lib/bulkManage';
import { canEditTask } from '../lib/access';
import { Button } from './ui';
import { inputBase } from './uiTokens';
import ConfirmDialog from './ConfirmDialog';
import { useI18n } from './I18nProvider';

interface BulkManageBarProps {
  /** The tasks currently shown that can be selected. */
  tasks: readonly Task[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  onDone: () => void;
}

type Pending = { kind: 'due'; value: string } | { kind: 'assign'; memberId: string; name: string };

/**
 * Bulk change of due date or assignee for several tasks at once. Each task is
 * its own save, the store checks permission and stage rules per task, and a
 * summary says how many were updated and why the rest were not.
 */
const BulkManageBar: React.FC<BulkManageBarProps> = ({ tasks, selected, onSelectedChange, onDone }) => {
  const { t } = useI18n();
  const state = useStore(useShallow(store => ({
    currentUser: store.currentUser, users: store.users, roles: store.rolePermissions, clients: store.clients, projects: store.projects, backend: store.backend,
  })));
  const [dueDate, setDueDate] = React.useState('');
  const [memberId, setMemberId] = React.useState('');
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<BulkOutcome | null>(null);
  const titleId = React.useId();

  const chosen = tasks.filter(task => selected.has(task.id));
  const editable = chosen.filter(task => canEditTask(state.currentUser, task, state.roles, { users: state.users, clients: state.clients, projects: state.projects }));
  const assignees = React.useMemo(() => commonAssignees(editable, state.currentUser, state.users, state.roles), [editable, state]);
  const locked = state.backend.upgradeRequired === true || state.backend.isSaving || Boolean(state.backend.pendingMutations) || state.backend.hasLocalChanges;
  const allSelected = tasks.length > 0 && chosen.length === tasks.length;

  const run = async () => {
    if (!pending || busy) return;
    const targets = editable.map(task => task.id);
    setBusy(true);
    setOutcome(null);
    try {
      const store = useStore.getState;
      const result = await runBulkSave(
        targets,
        id => (pending.kind === 'due' ? store().updateTaskDueDate(id, pending.value) : store().updateTaskAssignee(id, pending.memberId)),
        async () => {
          const committed = await store().commitPendingMutation('task.update');
          return committed.ok ? { ok: true } : { ok: false, error: committed.error, code: committed.code || store().backend.errorCode || '' };
        },
        () => store().discardMutation(),
        code => REJECTION_CODES.includes(code),
      );
      setOutcome(result);
    } finally {
      setBusy(false);
      setPending(null);
      onSelectedChange(new Set());
      setDueDate('');
      setMemberId('');
    }
  };

  return (
    <div className="space-y-3 rounded-panel border border-line bg-inset/60 p-4" role="group" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id={titleId} className="text-sm font-semibold text-ink">{t('Update several tasks')}</h3>
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4" checked={allSelected} disabled={busy || tasks.length === 0} onChange={() => onSelectedChange(allSelected ? new Set() : new Set(tasks.map(task => task.id)))} />
            {t('Select all')}
          </label>
          <span role="status" className="text-sm text-muted">{t('ui.selectedCount', { count: chosen.length })}</span>
        </div>
        <Button variant="quiet" onClick={onDone} disabled={busy}>{t('Done selecting')}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted">{t('New due date')}
            <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={busy} className={`${inputBase} mt-1 w-full`} />
          </label>
          <Button className="min-h-11" disabled={busy || locked || editable.length === 0 || !dueDate} onClick={() => setPending({ kind: 'due', value: dueDate })}>{t('Change due date')}</Button>
        </div>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted">{t('Assign to…')}
            <select value={memberId} onChange={event => setMemberId(event.target.value)} disabled={busy || assignees.length === 0} className={`${inputBase} mt-1 w-full`}>
              <option value="">{t('Choose a person')}</option>
              {assignees.map(user => <option key={user.id} value={user.id} data-i18n-skip>{user.name}</option>)}
            </select>
          </label>
          <Button className="min-h-11" disabled={busy || locked || editable.length === 0 || !memberId} onClick={() => setPending({ kind: 'assign', memberId, name: assignees.find(user => user.id === memberId)?.name || '' })}>{t('Reassign')}</Button>
        </div>
      </div>
      {chosen.length > 0 && assignees.length === 0 && <p className="text-xs text-muted">{t('No one can take all the selected tasks. Select tasks from one department to reassign them together.')}</p>}
      {chosen.length > editable.length && <p className="text-xs text-muted">{t('ui.cannotEditCount', { count: chosen.length - editable.length })}</p>}
      {outcome && (
        <p role={outcome.saved === outcome.total ? 'status' : 'alert'} className={`text-sm ${outcome.saved === outcome.total ? 'text-muted' : 'text-red-700 dark:text-red-300'}`}>
          {t('ui.bulkSavedOf', { saved: outcome.saved, total: outcome.total })}{outcome.firstError ? ` ${t(outcome.firstError)}` : ''}
        </p>
      )}
      {pending && <ConfirmDialog
        labelledBy={`${titleId}-confirm`}
        title={pending.kind === 'due' ? t('ui.confirmBulkDue', { count: editable.length, date: pending.value }) : t('ui.confirmBulkAssign', { count: editable.length, name: pending.name })}
        description={t('Each task is saved on its own, so one that cannot be changed will not stop the rest.')}
        confirmLabel={pending.kind === 'due' ? t('Change due date') : t('Reassign')}
        cancelLabel={t('Cancel')}
        tone="primary"
        busy={busy}
        onConfirm={() => run()}
        onClose={() => setPending(null)}
      />}
    </div>
  );
};

export default BulkManageBar;
