import '../lib/hodReviewCopy';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../types';
import { useStore } from '../store';
import { canBeTaskReviewLead, canManageTaskReview, canReviewTaskInternally, isIndependentTaskReviewer } from '../lib/taskWorkflowAccess';
import { getTodayInputDate } from '../lib/utils';
import { useSaveAction } from '../hooks/useSaveAction';
import { useI18n } from './I18nProvider';
import SystemMessage from './SystemMessage';

export default function TaskReviewSettings({ task }: { task: Task }) {
  const { t } = useI18n();
  const state = useStore(useShallow(s => ({ currentUser: s.currentUser, users: s.users, clients: s.clients, projects: s.projects, roles: s.rolePermissions, backend: s.backend })));
  const scope = { users: state.users, clients: state.clients, projects: state.projects };
  const candidates = state.users.filter(user => canBeTaskReviewLead(user, task, state.roles, scope));
  const [lead, setLead] = React.useState(task.accountableLeadId || '');
  const [requiresApproval, setRequiresApproval] = React.useState(task.requiresInternalApproval !== false);
  const approvalHintId = React.useId();
  const [reviewer, setReviewer] = React.useState(task.reviewCover?.reviewerId || '');
  const [until, setUntil] = React.useState(task.reviewCover?.expiresAt ? getTodayInputDate(new Date(task.reviewCover.expiresAt)) : getTodayInputDate(new Date(Date.now() + 7 * 86400000)));
  const [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const { busy, run } = useSaveAction(`review-config:${task.id}`);
  const resetDefaults = React.useRef({ lead: task.accountableLeadId, cover: task.reviewCover, requiresApproval: task.requiresInternalApproval !== false });
  resetDefaults.current = { lead: task.accountableLeadId, cover: task.reviewCover, requiresApproval: task.requiresInternalApproval !== false };
  React.useEffect(() => { const { lead: savedLead, cover: savedCover, requiresApproval: savedApproval } = resetDefaults.current; setRequiresApproval(savedApproval); setLead(savedLead || ''); setReviewer(savedCover?.reviewerId || ''); setUntil(savedCover?.expiresAt ? getTodayInputDate(new Date(savedCover.expiresAt)) : getTodayInputDate(new Date(Date.now() + 7 * 86400000))); setReason(''); setMessage(''); setError(''); }, [task.id, task.requiresInternalApproval, state.currentUser?.id]);
  if (!canManageTaskReview(state.currentUser, task, state.roles, scope)) return null;
  const locked = busy || state.backend.isSaving || state.backend.isPulling || state.backend.upgradeRequired;
  const override = state.currentUser?.isSuperAdmin && task.status === 'Waiting Approval' && !canReviewTaskInternally(state.currentUser, task, state.roles, scope);
  const save = async (isOverride = false) => {
    setMessage(''); setError('');
    await run(async isCurrent => {
      const { requireReviewRemediation } = await import('../lib/taskOutputUpload');
      await requireReviewRemediation();
      if (!isCurrent()) return { ok: false };
      const result = isOverride
        ? useStore.getState().updateTask(task.id, { status: 'Approved', reviewOverrideReason: reason.trim() })
        : await useStore.getState().setTaskReviewConfig(task.id, { ...(requiresApproval === (task.requiresInternalApproval !== false) ? {} : { requiresInternalApproval: requiresApproval }), accountableLeadId: lead || undefined, cover: reviewer ? { reviewerId: reviewer, expiresAt: new Date(`${until}T23:59:59`).toISOString() } : null });
      if (!result.ok) return { ok: false, error: result.error ? t(result.error) : 'The change is waiting to be saved.' };
      const saved = await useStore.getState().commitPendingMutation('task.update');
      if (!saved.ok) return saved;
      return { ok: true };
    }, result => { if (result.ok) { setMessage(t(isOverride ? 'Review override saved with your reason.' : requiresApproval !== (task.requiresInternalApproval !== false) ? 'Review responsibility saved.' : 'Review cover and lead saved.')); setReason(''); } else setError(result.error || 'The change is waiting to be saved.'); });
  };
  return <section aria-label={t('Review responsibility')} className="space-y-3 rounded-control border border-line p-4">
    <h3 className="text-sm font-semibold text-ink">{t('Review responsibility')}</h3>
    <div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
        <input type="checkbox" checked={requiresApproval} onChange={event => setRequiresApproval(event.target.checked)} disabled={locked || task.workflowStepKind === 'internal_review' || ['Completed', 'Cancelled'].includes(task.status)} aria-describedby={approvalHintId} className="h-4 w-4 accent-accent" />
        {t('Require internal approval')}
      </label>
      <p id={approvalHintId} className="text-xs leading-5 text-muted">{t(task.workflowStepKind === 'internal_review' ? 'Internal review workflow steps always require approval.' : 'Turn off to let the responsible PM complete this task while it is waiting for review.')}</p>
    </div>
    <p className="text-xs leading-5 text-muted">{t('The accountable lead stays with the task after delegation. Temporary cover expires automatically.')}</p>
    <label className="block text-sm text-ink">{t('Accountable lead')}<select value={lead} onChange={event => setLead(event.target.value)} disabled={locked} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3"><option value="">{t('Keep the current lead')}</option>{candidates.map(user => <option key={user.id} value={user.id} data-i18n-skip>{user.name}</option>)}</select></label>
    <label className="block text-sm text-ink">{t('Temporary review cover')}<select value={reviewer} onChange={event => setReviewer(event.target.value)} disabled={locked} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3"><option value="">{t('Use the independent department reviewer')}</option>{candidates.filter(user => isIndependentTaskReviewer(user, task)).map(user => <option key={user.id} value={user.id} data-i18n-skip>{user.name}</option>)}</select></label>
    {reviewer && <label className="block text-sm text-ink">{t('Cover until')}<input type="date" value={until} min={getTodayInputDate()} max={getTodayInputDate(new Date(Date.now() + 89 * 86400000))} onChange={event => setUntil(event.target.value)} disabled={locked} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3" /></label>}
    <button type="button" disabled={locked || Boolean(reviewer && !until)} onClick={() => void save()} className="min-h-11 rounded-control border border-line px-3 text-sm font-semibold text-ink disabled:opacity-50">{t(busy ? 'Saving…' : 'Save review responsibility')}</button>
    {override && <div className="space-y-2 border-t border-line pt-3"><p className="text-sm text-muted">{t('This review requires independent cover. Boss Koo may override with an audited reason.')}</p><label className="block text-sm text-ink">{t('Review override reason')}<textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} disabled={locked} className="mt-1 w-full rounded-control border border-line bg-surface p-3" /></label><button type="button" disabled={locked || !reason.trim()} onClick={() => void save(true)} className="min-h-11 rounded-control border border-amber-300 px-3 text-sm font-semibold text-amber-800 disabled:opacity-50">{t('Approve with audited override')}</button></div>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="text-sm text-red-700"><SystemMessage message={error} /></p>}
  </section>;
}
