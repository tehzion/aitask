import React from 'react';
import { Download } from 'lucide-react';
import type { Task } from '../types';
import { useStore } from '../store';
import { getTaskOutputAttachments, getTaskReviewInputLinks } from '../lib/taskOutputEvidence';
import { captureWorkspaceSession, isWorkspaceSessionCurrent, onWorkspaceSessionInvalidated } from '../lib/workspaceSession';
import { safeHttpsUrl } from '../lib/security';
import { useI18n } from './I18nProvider';

export default function TaskOutputFiles({ task }: { task: Task }) {
  const { t } = useI18n();
  const deliverables = useStore(state => state.deliverables);
  const actorId = useStore(state => state.currentUser?.id);
  const files = getTaskOutputAttachments(task, deliverables, actorId);
  const links = getTaskReviewInputLinks(task, actorId).filter(link => safeHttpsUrl(link.url));
  const [pending, setPending] = React.useState<string | null>(null);
  const [downloadFailed, setDownloadFailed] = React.useState(false);
  const availableFiles = React.useRef(files);
  availableFiles.current = files;
  const active = React.useRef(false);
  const busy = React.useRef(false);
  const generation = React.useRef(0);
  const context = React.useRef('');
  context.current = `${task.id}:${actorId || ''}`;
  React.useEffect(() => {
    active.current = true;
    busy.current = false;
    setPending(null);
    setDownloadFailed(false);
    const unsubscribe = onWorkspaceSessionInvalidated(() => {
      generation.current += 1;
      busy.current = false;
      setPending(null);
      setDownloadFailed(false);
    });
    return () => { active.current = false; generation.current += 1; unsubscribe(); };
  }, [task.id, actorId]);

  React.useEffect(() => {
    if (pending && !files.some(file => `${file.bucket}:${file.path}` === pending)) {
      generation.current += 1;
      busy.current = false;
      setPending(null);
    }
  }, [files, pending]);

  const download = async (file: typeof files[number]) => {
    if (busy.current) return;
    busy.current = true;
    const session = captureWorkspaceSession();
    const capturedContext = context.current;
    const capturedGeneration = generation.current;
    const sameView = () => active.current && context.current === capturedContext && generation.current === capturedGeneration;
    const isCurrent = () => sameView() && isWorkspaceSessionCurrent(session)
      && availableFiles.current.some(item => item.bucket === file.bucket && item.path === file.path);
    setPending(`${file.bucket}:${file.path}`);
    setDownloadFailed(false);
    try {
      const { downloadServiceFile } = await import('../lib/serviceFiles');
      if (!isCurrent()) return;
      const result = await downloadServiceFile(file, { isCurrent });
      if (isCurrent() && !result.ok) setDownloadFailed(true);
    } catch {
      if (isCurrent()) setDownloadFailed(true);
    } finally {
      if (sameView()) { busy.current = false; setPending(null); }
    }
  };

  if (!files.length && !links.length) return null;
  return <>{files.length > 0 && <section aria-label={t('Output files')} className="space-y-2">
    <h3 className="text-sm font-semibold text-ink">{t('Output files')}</h3>
    {files.map(file => <button key={`${file.bucket}:${file.path}`} type="button" disabled={pending !== null} aria-busy={pending === `${file.bucket}:${file.path}`}
      onClick={() => void download(file)} className="flex min-h-11 w-full items-center gap-3 rounded-control border border-line bg-inset px-3 py-2 text-left text-sm text-ink hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-60">
      <Download aria-hidden="true" className="h-4 w-4 shrink-0" /><span data-i18n-skip className="min-w-0 flex-1 break-words">{file.fileName}</span><span className="shrink-0 text-xs font-semibold">{t(pending === `${file.bucket}:${file.path}` ? 'Downloading…' : 'Download')}</span>
    </button>)}
    {pending && <p role="status" className="text-sm text-muted">{t('Downloading…')}</p>}
    {downloadFailed && <p role="alert" className="text-sm text-red-700">{t('The file could not be downloaded.')}</p>}
  </section>}{links.length > 0 && <section aria-label={t('Review inputs')} className="space-y-2">
    <h3 className="text-sm font-semibold text-ink">{t('Review inputs')}</h3>
    {links.map(link => <a key={`${link.taskId}:${link.url}`} href={safeHttpsUrl(link.url)!} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-control border border-line bg-inset px-3 py-2 text-sm text-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
      <span data-i18n-skip className="min-w-0 flex-1 break-words">{link.name === 'Output' ? t('Output') : link.name}</span><span className="shrink-0 text-xs font-semibold">{t('Open output')}</span>
    </a>)}
  </section>}</>;
}
