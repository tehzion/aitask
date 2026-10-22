import SystemMessage from './SystemMessage';
import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { useLocalToday } from '../hooks/useLocalToday';
import { useSaveAction } from '../hooks/useSaveAction';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { canEditTask, canManageServiceCycles, canOpenServiceClient, getVisibleTasks } from '../lib/access';
import { getDeliveryReviewRecords, isTaskLinkedToDeliverable, hasInvalidDeliveryLink } from '../lib/dashboardData';
import { isTaskCompleted } from '../lib/taskCompletion';
import { formatLocalizedDate } from '../lib/i18n';
import { parseOptionalDate } from '../lib/utils';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { inputBase } from './uiTokens';
import ConfirmDialog from './ConfirmDialog';
import { sameSavedValue } from '../lib/saveConfirmation';

type PendingReview = { command: 'service_cycle.manage' | 'task.update'; taskId?: string; deliverableId?: string; cycleId?: string;
  expected?: { id: string; serviceCycleId?: string; deliverableId?: string; status?: string } };

const DeliveryReviewPanel = ({ clientId, includeOpenTasks = false }: { clientId?: string; includeOpenTasks?: boolean }) => {
  const store = useStore();
  const { t, locale } = useI18n();
  const today = useLocalToday();
  const { busy, run } = useSaveAction(clientId);
  const [selections, setSelections] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState('');
  const [pending, setPending] = React.useState<PendingReview | null>(null);
  const [unlinkTask, setUnlinkTask] = React.useState<{ id: string; title: string } | null>(null);
  const unlinkTitleId = React.useId();
  const [showOlderDrafts, setShowOlderDrafts] = React.useState(false);
  React.useEffect(() => { setSelections({}); setMessage(''); setPending(null); }, [clientId, store.currentUser?.id]);
  // A selected link is an in-memory choice that remains mounted while the
  // client workspace switches tabs. Only an in-flight save must block route
  // navigation; otherwise a harmless tab switch is mistaken for discarding
  // the review selections.
  useUnsavedChanges(Boolean(pending));
  const visibleTasks = getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions, { clients: store.clients, projects: store.projects })
    .filter(task => !clientId || task.clientId === clientId);
  const cycles = store.serviceCycles.filter(cycle => (!clientId || cycle.clientId === clientId)
    && canOpenServiceClient(store.currentUser, cycle.clientName, visibleTasks, store.rolePermissions, store.clients, store.projects));
  const records = getDeliveryReviewRecords(visibleTasks, cycles, store.deliverables, today);
  const reviewTasks = [...records.invalidLinkedTasks, ...(includeOpenTasks ? visibleTasks.filter(task => task.clientId && !isTaskLinkedToDeliverable(task, store.deliverables) && task.status !== 'Cancelled') : records.unlinkedTasks)];
  const canPublish = canManageServiceCycles(store.currentUser, store.rolePermissions);
  const canLink = reviewTasks.some(task => canEditTask(store.currentUser, task, store.rolePermissions, { clients: store.clients, projects: store.projects }));
  const date = (value: string) => { const parsed = parseOptionalDate(value); return parsed ? formatLocalizedDate(parsed, locale) : t('Date to be confirmed'); };
  const save = (operation: () => { ok: boolean; error?: string }, command: PendingReview['command'], submitted?: { taskId?: string; deliverableId?: string; cycleId?: string }) => {
    const receipt = pending || { command, ...submitted };
    return run(async isCurrent => {
      if (!pending) {
        const result = operation();
        if (!result.ok) return result;
        const state = useStore.getState();
        const task = state.tasks.find(item => item.id === receipt.taskId);
        const cycle = state.serviceCycles.find(item => item.id === receipt.cycleId);
        receipt.expected = structuredClone(task ? { id: task.id, serviceCycleId: task.serviceCycleId, deliverableId: task.deliverableId }
          : cycle ? { id: cycle.id, status: cycle.status } : undefined);
        setPending(receipt);
      }
      const result = pending ? await useStore.getState().retryPendingSave(pending.command) : await useStore.getState().commitPendingMutation(command);
      if (!isCurrent() || !result.ok) return result;
      const state = useStore.getState();
      const task = state.tasks.find(item => item.id === receipt.taskId);
      const cycle = state.serviceCycles.find(item => item.id === receipt.cycleId);
      const actual = task ? { id: task.id, serviceCycleId: task.serviceCycleId, deliverableId: task.deliverableId } : cycle ? { id: cycle.id, status: cycle.status } : undefined;
      if (!receipt.expected || !sameSavedValue(actual, receipt.expected)) {
        setPending(null);
        return { ok: false, error: 'The pending delivery change is no longer available. Review and save again.' };
      }
      return result;
    }, result => {
      setMessage(result.ok ? t('Saved.') : t(result.error || 'The change is waiting to be saved.'));
      if (result.ok) {
        setPending(null);
        if (receipt.taskId) setSelections(current => {
          if (current[receipt.taskId!] !== receipt.deliverableId) return current;
          const next = { ...current }; delete next[receipt.taskId!]; return next;
        });
      }
    });
  };
  if (!store.currentUser || store.currentUser.role === 'Client') return null;
  if (!reviewTasks.length && !records.draftCycles.length && !records.expiredDraftCycles.length && !pending && !message) return null;
  return <section className="mt-5 rounded-control border border-line p-4" aria-label={t('Delivery records need review')}>
    <h3 className="font-semibold text-ink">{t('Delivery records need review')}</h3>
    <p className="mt-1 text-xs text-muted">{t('Review links and publication before confirming delivery.')}</p>
    {!canLink && <p className="mt-1 text-xs text-muted">{t('Relinking tasks is restricted for your role; task links are read-only on this list.')}</p>}
    {message && <p className="mt-3 text-sm" role="status"><SystemMessage message={message} /></p>}
    {pending && <Button className="mt-3" disabled={busy} onClick={() => save(() => ({ ok: true }), pending.command)}>{t('Retry pending save')}</Button>}
    <div className="mt-3 space-y-4">
      {records.draftCycles.map(cycle => <div key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div><Link className="font-medium text-accent" to={`/clients/${encodeURIComponent(cycle.clientId)}?tab=cycles&cycleId=${encodeURIComponent(cycle.id)}#cycle-${encodeURIComponent(cycle.id)}`}><span data-i18n-skip>{cycle.clientName}</span></Link>
          <p className="text-xs text-muted">{t('Awaiting publication')} · {date(cycle.periodStart)} – {date(cycle.periodEnd)}</p></div>
        {canPublish && <Button disabled={busy || Boolean(pending)} onClick={() => save(() => useStore.getState().setServiceCycleStatus(cycle.id, 'Published'), 'service_cycle.manage', { cycleId: cycle.id })}>{t('Publish')}</Button>}
      </div>)}
      {records.expiredDraftCycles.length > 0 && <div>
        <Button variant="secondary" aria-expanded={showOlderDrafts} onClick={() => setShowOlderDrafts(value => !value)}>{t('Older unpublished cycles')} ({records.expiredDraftCycles.length})</Button>
        {showOlderDrafts && <div className="mt-3 space-y-3">{records.expiredDraftCycles.map(cycle => <div key={cycle.id} className="text-sm">
          <Link className="font-medium text-accent" to={`/clients/${encodeURIComponent(cycle.clientId)}?tab=cycles&cycleId=${encodeURIComponent(cycle.id)}#cycle-${encodeURIComponent(cycle.id)}`}><span data-i18n-skip>{cycle.clientName}</span></Link>
          <p className="text-xs text-muted">{t('Expired unpublished cycle')} · {date(cycle.periodStart)} – {date(cycle.periodEnd)}</p>
        </div>)}</div>}
      </div>}
      {reviewTasks.map(task => {
        const editable = canLink && canEditTask(store.currentUser, task, store.rolePermissions, { clients: store.clients, projects: store.projects });
        const invalidLink = hasInvalidDeliveryLink(task, store.deliverables);
        const eligible = store.deliverables.filter(item => item.clientId === task.clientId && item.status !== 'Delivered' && cycles.some(cycle => cycle.id === item.cycleId && ['Draft', 'Published'].includes(cycle.status)));
        return <div key={task.id} className="space-y-2 text-sm">
          <Link className="font-medium text-accent" to={`/tasks?taskId=${encodeURIComponent(task.id)}`}><span data-i18n-skip>{task.title}</span></Link>
          <p className="text-xs text-muted">{t(invalidLink ? 'Invalid delivery link. Review before linking again.' : isTaskCompleted(task) ? 'Completed task without a deliverable link' : 'Task without a deliverable link')}</p>
          {editable && invalidLink && <Button variant="secondary" disabled={busy || Boolean(pending)} onClick={() => setUnlinkTask({ id: task.id, title: task.title })}>{t('Remove invalid link')}</Button>}
          {editable && !invalidLink && eligible.length > 0 && <div className="flex flex-wrap gap-2">
            <select aria-label={t('Choose a deliverable')} className={`${inputBase} min-w-0 flex-1`} disabled={busy || Boolean(pending)} value={selections[task.id] || ''} onChange={event => setSelections(current => ({ ...current, [task.id]: event.target.value }))}>
              <option value="">{t('Choose a deliverable')}</option>
              {eligible.map(item => { const cycle = cycles.find(c => c.id === item.cycleId)!; const plan = store.clientPlans.find(p => p.id === cycle.planId); return <option key={item.id} value={item.id} data-i18n-skip>{item.title} · {plan?.name || cycle.clientName} · {date(cycle.periodStart)} – {date(cycle.periodEnd)}</option>; })}
            </select>
            <Button disabled={busy || Boolean(pending) || !selections[task.id]} onClick={() => {
              const item = eligible.find(d => d.id === selections[task.id]);
              if (item) save(() => useStore.getState().linkTaskToDeliverable(task.id, item.cycleId, item.id), 'task.update', { taskId: task.id, deliverableId: item.id });
            }}>{t('Link task')}</Button>
          </div>}
          {editable && !invalidLink && eligible.length === 0 && <p className="text-xs text-muted">{t('No eligible deliverable. Review the company service cycle.')}</p>}
        </div>;
      })}
    </div>
    {unlinkTask && <ConfirmDialog
      labelledBy={unlinkTitleId}
      title={t('Remove invalid delivery link')}
      description={t('Remove the invalid delivery link from "{title}"? The task will remain and require an explicit new link.', { title: unlinkTask.title })}
      confirmLabel={t('Remove invalid link')}
      busy={busy}
      onClose={() => { if (!busy) setUnlinkTask(null); }}
      onConfirm={async () => {
        const result = await save(() => useStore.getState().unlinkInvalidTaskDelivery(unlinkTask.id), 'task.update', { taskId: unlinkTask.id });
        if (result?.ok) setUnlinkTask(null);
      }}
    />}
  </section>;
};
export default DeliveryReviewPanel;
