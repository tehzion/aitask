import '../lib/pageCopy';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import type { Task } from '../types';
import { REJECTION_CODES, resolveQuickTaskAction } from '../hooks/useQuickTaskAction';
import { Button, CountLabel, Surface } from './ui';
import ConfirmDialog from './ConfirmDialog';
import { useI18n } from './I18nProvider';

/**
 * Bulk approve for PMs (role UX, 10 Nov 2026). Only work the PM could approve
 * with one click is offered; Return always needs a note, so it stays in the
 * task. Each approval is its own save, so one refusal does not undo the others.
 */
const BulkApprovePanel = ({ tasks }: { tasks: readonly Task[] }) => {
  const { t } = useI18n();
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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const titleId = React.useId();

  const approvable = React.useMemo(
    () => tasks.filter(task => resolveQuickTaskAction(task, state, { ignoreSaveLocks: true })?.target === 'Approved'),
    [state, tasks],
  );
  const chosen = approvable.filter(task => selected.has(task.id));
  const locked = state.backend.upgradeRequired === true || state.backend.isSaving || Boolean(state.backend.pendingMutations) || state.backend.hasLocalChanges;

  if (approvable.length < 2 && !result) return null;

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = approvable.length > 0 && chosen.length === approvable.length;

  const approve = async () => {
    const targets = [...chosen];
    if (!targets.length || busy) return;
    setBusy(true);
    setResult(null);
    let saved = 0;
    let firstError = '';
    try {
      for (const task of targets) {
        const local = useStore.getState().updateTaskStatus(task.id, 'Approved');
        if (!local.ok) { firstError ||= t(local.error || 'Unable to update the task status.'); continue; }
        const committed = await useStore.getState().commitPendingMutation('task.update');
        if (committed.ok) { saved += 1; continue; }
        const code = committed.code || useStore.getState().backend.errorCode || '';
        firstError ||= committed.error || 'The change is waiting to be saved.';
        if (REJECTION_CODES.includes(code)) {
          // Refused for this task only: reload it and carry on with the rest.
          await useStore.getState().discardMutation();
          continue;
        }
        // Connection trouble: the workspace keeps retrying this one; stop here.
        break;
      }
    } finally {
      setBusy(false);
      setConfirming(false);
      setSelected(new Set());
    }
    setResult(firstError
      ? { tone: 'error', text: `${t('{saved} of {total} approved.', { saved, total: targets.length })} ${t(firstError)}` }
      : { tone: 'ok', text: t('{saved} of {total} approved.', { saved, total: targets.length }) });
  };

  return <Surface className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div>
        <h3 id={titleId} className="font-semibold text-ink">{t('Approve several at once')}</h3>
        <p className="mt-1 text-sm text-muted">{t('Submitted work you can approve now. To return work with a note, open the task.')}</p>
      </div>
      <CountLabel>{approvable.length}</CountLabel>
    </div>
    {approvable.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-5 py-3">
      <label className="inline-flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="h-4 w-4" checked={allSelected} disabled={busy} onChange={() => setSelected(allSelected ? new Set() : new Set(approvable.map(task => task.id)))} />
        {t('Select all')}
      </label>
      <Button className="min-h-9 px-3 py-1.5" disabled={busy || locked || chosen.length === 0} onClick={() => setConfirming(true)}>
        {t('Approve selected')}{chosen.length > 0 ? ` (${chosen.length})` : ''}
      </Button>
    </div>}
    {result && <p role={result.tone === 'error' ? 'alert' : 'status'} className={`px-5 pt-3 text-sm ${result.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-muted'}`}>{result.text}</p>}
    <ul className="divide-y divide-line/70" aria-labelledby={titleId}>
      {approvable.map(task => <li key={task.id} className="flex items-center gap-3 px-5 py-3">
        <input type="checkbox" className="h-4 w-4" checked={selected.has(task.id)} disabled={busy} aria-label={`${t('Select')}: ${task.title}`} onChange={() => toggle(task.id)} />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span data-i18n-skip className="font-medium text-ink">{task.title}</span>
          <span data-i18n-skip className="text-muted"> · {task.clientName}{task.projectName ? ` · ${task.projectName}` : ''}</span>
        </span>
      </li>)}
    </ul>
    {confirming && <ConfirmDialog
      labelledBy={`${titleId}-confirm`}
      title={t('Approve {count} tasks?', { count: chosen.length })}
      description={t('Each task is approved and saved on its own. Tasks that cannot be approved are left as they are.')}
      confirmLabel={t('Approve')}
      cancelLabel={t('Cancel')}
      tone="primary"
      busy={busy}
      onConfirm={() => approve()}
      onClose={() => setConfirming(false)}
    />}
  </Surface>;
};

export default BulkApprovePanel;
