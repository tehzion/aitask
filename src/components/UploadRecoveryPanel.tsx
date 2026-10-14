import '../lib/actionFeedbackCopy';
import SystemMessage from './SystemMessage';
import React from 'react';
import { useStore } from '../store';
import { cleanupPendingServiceFiles, listPendingServiceFiles, refreshPendingServiceFiles } from '../lib/serviceFiles';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { msg } from '../lib/messages';
import type { UiFeedback } from '../lib/actionFeedback';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { cardBase } from './uiTokens';

export default function UploadRecoveryPanel() {
  const account = useStore(state => state.currentUser?.id);
  const { t } = useI18n();
  const [files, setFiles] = React.useState(() => account ? listPendingServiceFiles(account) : []);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<UiFeedback | null>(null);
  const [detail, setDetail] = React.useState('');
  const owner = React.useRef(account); owner.current = account;
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => { setFiles(account ? listPendingServiceFiles(account) : []); setFeedback(null); setDetail(''); setBusy(false); }, [account]);
  const run = async (discard: boolean) => {
    if (!account || busy) return;
    if (discard && !window.confirm(t('Discard unresolved uploads? Saved attachments will be retained.'))) return;
    const token = captureWorkspaceSession();
    const isCurrent = () => mounted.current && isWorkspaceSessionCurrent(token) && owner.current === account;
    setBusy(true); setFeedback(null); setDetail('');
    try {
      const result = discard ? await cleanupPendingServiceFiles(account, { abandonSubmitted: true }) : await refreshPendingServiceFiles(account);
      if (!isCurrent()) return;
      setFiles(listPendingServiceFiles(account));
      setFeedback({ tone: !result.ok ? 'error' : result.remaining > 0 ? 'warning' : 'success', message: msg(discard ? 'feedback.uploadCleanup' : 'feedback.uploadSummary', { cleared: result.cleared, remaining: result.remaining, failed: result.failed, deleted: result.deleted }) });
      if (!result.ok) setDetail(result.error || 'Upload reconciliation is unavailable. The file was retained.');
    } catch (failure) {
      if (isCurrent()) setFeedback({ tone: 'error', message: failure instanceof Error ? failure.message : 'Upload reconciliation is unavailable. The file was retained.' });
    } finally { if (isCurrent()) setBusy(false); }
  };
  if (!files.length && !feedback) return null;
  return <section className={`${cardBase} p-5`}>
    <h2 className="font-semibold text-ink">{t('Upload recovery')}</h2>
    <p className="mt-1 text-sm text-muted">{t('Check unresolved uploads before discarding them. Saved attachments are protected.')}</p>
    <ul className="my-3 space-y-1 text-sm text-ink">{files.map(file => <li key={file.path}><span data-i18n-skip>{file.fileName}</span> · {t('Needs confirmation')}</li>)}</ul>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !files.length} onClick={() => void run(false)}>{busy ? t('Loading…') : t('Check upload status')}</Button><Button variant="secondary" disabled={busy || !files.length} onClick={() => void run(true)}>{t('Discard unresolved uploads')}</Button></div>
    {feedback && <div className="mt-3 text-sm text-muted" role={feedback.tone === 'error' ? 'alert' : 'status'}><p><SystemMessage message={feedback.message} /></p>{detail && <p className="mt-1"><SystemMessage message={detail} /></p>}</div>}
  </section>;
}
