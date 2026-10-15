import React from 'react';
import { readRecoveredDraft, removeRecoveredDraft, revisionDraftOf, writeRecoveredDraft } from '../lib/draftRecovery';
import type { ClientServicePlan } from '../types';
import { useStore } from '../store';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';

const RevisionRecoveryNotice = ({ plans, activePlan }: { plans: ClientServicePlan[]; activePlan?: ClientServicePlan }) => {
  const { t } = useI18n();
  const actor = useStore(state => state.currentUser);
  const account = actor?.authUserId || actor?.id || '';
  const [, refresh] = React.useReducer(value => value + 1, 0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    window.addEventListener('storage', refresh); window.addEventListener('aitask:draft-recovery', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('aitask:draft-recovery', refresh); };
  }, []);
  const recovered = account ? plans.filter(plan => plan.status !== 'Draft').map(plan => ({ plan, draft: readRecoveredDraft<ReturnType<typeof revisionDraftOf>>(account, `service-plan:${plan.id}`) })).find(item => item.draft) : undefined;
  if (!recovered?.draft) return null;
  const carry = async () => {
    if (!activePlan || busy) return;
    const session = captureWorkspaceSession();
    setBusy(true); setError('');
    try {
      const state = useStore.getState();
      const pending = state.clientPlans.find(plan => plan.supersedesPlanId === activePlan.id && plan.status === 'Draft');
      if (pending?.revisionScheduleStatus === 'scheduled') { setError(t('Return the scheduled plan to draft before carrying recovered edits.')); return; }
      const result = state.createClientPlanRevision(activePlan.id);
      if (!result.ok) { setError(t(result.error || 'Unable to update this revision.')); return; }
      const committed = await state.commitPendingMutation('client_plan.manage');
      if (!isWorkspaceSessionCurrent(session)) return;
      if (!committed.ok) { setError(t(committed.error || 'The revision is waiting to be saved.')); return; }
      const target = useStore.getState().clientPlans.find(plan => plan.id === result.planId);
      if (!target) return;
      // Never overwrite another unfinished draft silently.
      if (readRecoveredDraft(account, `service-plan:${target.id}`)) { setError(t('The next revision already has recovered edits. Restore or discard those edits first.')); return; }
      if (!writeRecoveredDraft(account, `service-plan:${target.id}`, revisionDraftOf(target), recovered.draft!.value)) { setError(t('Your browser could not retain these edits. Keep this page open and copy them before continuing.')); return; }
      removeRecoveredDraft(account, `service-plan:${recovered.plan.id}`, recovered.draft!.storageKey);
      refresh();
    } catch (failure) { if (isWorkspaceSessionCurrent(session)) setError(failure instanceof Error ? failure.message : t('Unable to update this revision.')); }
    finally { if (isWorkspaceSessionCurrent(session)) setBusy(false); }
  };
  return <section role="status" className="rounded-panel border border-line bg-inset p-5">
    <h2 className="font-semibold text-ink">{t('Unsaved plan edits were recovered')}</h2>
    <p className="mt-2 text-sm leading-6 text-muted">{t('The original revision is no longer editable. Your unsaved changes are still on this device and can be carried into the next month’s draft.')}</p>
    {error && <p role="alert" className="mt-2 text-sm text-ink">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy || activePlan?.status !== 'Active'} onClick={() => void carry()}>{t(busy ? 'Saving…' : 'Carry edits to next revision')}</Button><Button variant="secondary" disabled={busy} onClick={() => { if (window.confirm(t('Discard unsaved changes?'))) { removeRecoveredDraft(account, `service-plan:${recovered.plan.id}`, recovered.draft!.storageKey); refresh(); } }}>{t('Discard recovered draft')}</Button></div>
  </section>;
};
export default RevisionRecoveryNotice;
