import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { onboardingAction, type OnboardingOperation } from '../lib/secureOnboarding';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import ConfirmDialog from './ConfirmDialog';
import ModalShell from './ModalShell';

export default function PendingInvitations({ authUserId, refreshKey }: { authUserId: string; refreshKey: boolean }) {
  const { t } = useI18n();
  const [operations, setOperations] = useState<OnboardingOperation[]>([]);
  const [selected, setSelected] = useState<OnboardingOperation | null>(null);
  const [cancellation, setCancellation] = useState<OnboardingOperation | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestSequence = useRef(0);
  const current = useCallback(() => useStore.getState().currentUser?.authUserId === authUserId, [authUserId]);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const result = await onboardingAction(authUserId, 'list_onboarding');
      if (current() && sequence === requestSequence.current) { setOperations(result.operations || []); setError(''); }
    } catch (reason) { if (current() && sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : t('onboarding.unavailable')); }
  }, [authUserId, current, t]);
  useEffect(() => { if (!refreshKey) void load(); }, [load, refreshKey]);
  useEffect(() => { setSelected(null); setCancellation(null); setPassword(''); setNotice(''); setOperations([]); setBusy(false); setError(''); }, [authUserId]);
  const requiresPassword = selected && !selected.payload.sendInvitation && (!selected.payload.registrationId
    || useStore.getState().registrations.find(item => item.id === selected.payload.registrationId)?.onboardingMode === 'legacy_invite');
  const resume = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = selected.payload;
      const result = await useStore.getState().addUserBySuperAdmin({ ...payload,
        commandId: selected.commandId, companyName: payload.companyName || undefined,
        customRoleId: payload.customRoleId || undefined, registrationId: payload.registrationId || undefined,
        memberId: payload.memberId || undefined, password: requiresPassword ? password : undefined });
      if (!current()) return;
      if (!result.ok) setError(result.error || t('onboarding.unavailable'));
      else { setSelected(null); setPassword(''); setNotice(t(result.notice ? 'onboarding.replayed' : 'onboarding.completed')); await load(); }
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : t('onboarding.unavailable')); }
    finally { if (current()) setBusy(false); }
  };
  const cancel = async () => {
    if (!cancellation || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await onboardingAction(authUserId, 'cancel_onboarding', cancellation.commandId);
      if (current()) { setCancellation(null); setNotice(t(result.state === 'completed' ? 'onboarding.replayed' : 'onboarding.cancelled')); await load(); }
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : t('onboarding.unavailable')); }
    finally { if (current()) setBusy(false); }
  };
  return <section className={`${cardBase} p-4 sm:p-5`} aria-label={t('onboarding.pending')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{t('onboarding.pending')}</h2>
      <Button variant="secondary" disabled={busy} onClick={() => void load()}>{t('onboarding.refresh')}</Button>
    </div>
    <p className="mt-2 text-sm text-muted">{t('onboarding.guidance')}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{t(error)}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {operations.map(operation => <div key={operation.commandId} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <div className="min-w-0"><p className="break-words font-medium">{operation.payload.name}</p><p className="break-all text-sm text-muted">{operation.payload.email}</p></div>
      <div className="flex flex-wrap gap-2">
        {operation.state === 'pending' && <Button variant="secondary" disabled={busy} onClick={() => { setSelected(operation); setPassword(''); setError(''); }}>{t('onboarding.resume')}</Button>}
        <Button variant="danger" disabled={busy} onClick={() => { setCancellation(operation); setError(''); }}>{t(operation.state === 'cancelling' ? 'onboarding.retryCancel' : 'onboarding.cancel')}</Button>
      </div>
    </div>)}
    {selected && <ModalShell labelledBy="resume-invitation-title" onClose={() => { if (!busy) { setSelected(null); setPassword(''); } }} panelClassName="max-w-md">
      <form className="space-y-4 p-5" onSubmit={event => { event.preventDefault(); void resume(); }}>
        <h2 id="resume-invitation-title" className="text-lg font-semibold">{t('onboarding.resume')}</h2>
        <p className="break-words text-sm">{selected.payload.name} · {selected.payload.email}</p>
        <p className="text-sm text-muted">{t('onboarding.savedRequest')}</p>
        {requiresPassword && <label className="block text-sm">{t('onboarding.originalPassword')}<input className={`${inputBase} mt-2 w-full p-3`} type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} minLength={12} required disabled={busy}/></label>}
        {error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>{t(busy ? 'onboarding.working' : 'onboarding.resume')}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setSelected(null); setPassword(''); }}>{t('common.close')}</Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => { setCancellation(selected); setSelected(null); setPassword(''); setError(''); }}>{t('onboarding.cancel')}</Button>
        </div>
      </form>
    </ModalShell>}
    {cancellation && <ConfirmDialog labelledBy="cancel-invitation-title" title={t('onboarding.cancel')} description={t('onboarding.cancelDescription')}
      confirmLabel={t('onboarding.cancel')} error={t(error)} busy={busy} onClose={() => setCancellation(null)} onConfirm={cancel}/>}
  </section>;
}
