import React from 'react';
import { useStore } from '../../../app/store/workspaceStore';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../../../infrastructure/persistence/workspaceSession';
import ConfirmDialog from '../../../shared/components/ConfirmDialog';
import { useI18n } from '../../../shared/components/I18nProvider';
import SystemMessage from '../../../shared/components/SystemMessage';
import { Button } from '../../../shared/components/ui';
import { cardBase } from '../../../shared/components/uiTokens';
import type { UiFeedback } from '../../../shared/feedback/actionFeedback';
import '../../../shared/i18n/actionFeedbackCopy';
import { msg } from '../../../shared/i18n/messages';
import { cleanupPendingServiceFiles, listPendingServiceFiles, refreshPendingServiceFiles } from '../data/serviceFiles';

export default function UploadRecoveryPanel() {
  const account = useStore(state => state.currentUser?.id);
  const { t } = useI18n();
  const [files, setFiles] = React.useState(() => account ? listPendingServiceFiles(account) : []);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<UiFeedback | null>(null);
  const [detail, setDetail] = React.useState('');
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const confirmDiscardTitleId = React.useId();
  const owner = React.useRef(account); owner.current = account;
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => { setFiles(account ? listPendingServiceFiles(account) : []); setFeedback(null); setDetail(''); setBusy(false); }, [account]);
  const run = async (discard: boolean): Promise<boolean> => {
    if (!account || busy) return false;
    const token = captureWorkspaceSession();
    const isCurrent = () => mounted.current && isWorkspaceSessionCurrent(token) && owner.current === account;
    setBusy(true); setFeedback(null); setDetail('');
    try {
      const result = discard ? await cleanupPendingServiceFiles(account, { abandonSubmitted: true }) : await refreshPendingServiceFiles(account);
      if (!isCurrent()) return false;
      setFiles(listPendingServiceFiles(account));
      setFeedback({ tone: !result.ok ? 'error' : result.remaining > 0 ? 'warning' : 'success', message: msg(discard ? 'feedback.uploadCleanup' : 'feedback.uploadSummary', { cleared: result.cleared, remaining: result.remaining, failed: result.failed, deleted: result.deleted }) });
      if (!result.ok) setDetail(result.error || 'Upload reconciliation is unavailable. The file was retained.');
      return result.ok;
    } catch (failure) {
      if (isCurrent()) setFeedback({ tone: 'error', message: failure instanceof Error ? failure.message : 'Upload reconciliation is unavailable. The file was retained.' });
      return false;
    } finally { if (isCurrent()) setBusy(false); }
  };
  if (!files.length && !feedback) return null;
  return <>
  <section className={`${cardBase} p-5`}>
    <h2 className="font-semibold text-ink">{t('Upload recovery')}</h2>
    <p className="mt-1 text-sm text-muted">{t('Check unresolved uploads before discarding them. Saved attachments are protected.')}</p>
    <ul className="my-3 space-y-1 text-sm text-ink">{files.map(file => <li key={file.path}><span data-i18n-skip>{file.fileName}</span> · {t('Needs confirmation')}</li>)}</ul>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !files.length} onClick={() => void run(false)}>{busy ? t('Loading…') : t('Check upload status')}</Button><Button variant="secondary" disabled={busy || !files.length} onClick={() => setConfirmDiscard(true)}>{t('Discard unresolved uploads')}</Button></div>
    {feedback && <div className="mt-3 text-sm text-muted" role={feedback.tone === 'error' ? 'alert' : 'status'}><p><SystemMessage message={feedback.message} /></p>{detail && <p className="mt-1"><SystemMessage message={detail} /></p>}</div>}
  </section>
  {confirmDiscard && <ConfirmDialog
    labelledBy={confirmDiscardTitleId}
    title={t('Discard unresolved uploads')}
    description={t('Discard unresolved uploads? Saved attachments will be retained.')}
    confirmLabel={t('Discard unresolved uploads')}
    busy={busy}
    onClose={() => setConfirmDiscard(false)}
    onConfirm={async () => { if (await run(true)) setConfirmDiscard(false); }}
  />}
  </>;
}
