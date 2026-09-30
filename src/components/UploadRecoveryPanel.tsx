import React from 'react';
import { useStore } from '../store';
import { cleanupPendingServiceFiles, listPendingServiceFiles, refreshPendingServiceFiles } from '../lib/serviceFiles';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { cardBase } from './uiTokens';

export default function UploadRecoveryPanel() {
  const account = useStore(state => state.currentUser?.id);
  const { t } = useI18n();
  const [files, setFiles] = React.useState(() => account ? listPendingServiceFiles(account) : []);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  React.useEffect(() => { setFiles(account ? listPendingServiceFiles(account) : []); setMessage(''); setBusy(false); }, [account]);
  const run = async (discard: boolean) => {
    if (!account || busy) return;
    if (discard && !window.confirm(t('Discard unresolved uploads? Saved attachments will be retained.'))) return;
    const token = captureWorkspaceSession();
    setBusy(true);
    try {
      const result = discard ? await cleanupPendingServiceFiles(account, { abandonSubmitted: true }) : await refreshPendingServiceFiles(account);
      if (!isWorkspaceSessionCurrent(token)) return;
      setFiles(listPendingServiceFiles(account));
      setMessage(result.ok ? t('Upload references checked.') : result.error || t('Upload reconciliation is unavailable. The file was retained.'));
    } finally { if (isWorkspaceSessionCurrent(token)) setBusy(false); }
  };
  if (!files.length && !message) return null;
  return <section className={`${cardBase} p-5`}>
    <h2 className="font-semibold text-ink">{t('Upload recovery')}</h2>
    <p className="mt-1 text-sm text-muted">{t('Check unresolved uploads before discarding them. Saved attachments are protected.')}</p>
    <ul className="my-3 space-y-1 text-sm text-ink">{files.map(file => <li key={file.path} data-i18n-skip>{file.fileName}</li>)}</ul>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !files.length} onClick={() => void run(false)}>{busy ? t('Loading…') : t('Check upload status')}</Button><Button variant="secondary" disabled={busy || !files.length} onClick={() => void run(true)}>{t('Discard unresolved uploads')}</Button></div>
    {message && <p className="mt-3 text-sm text-muted" role="status">{message}</p>}
  </section>;
}
