import '../lib/hodReviewCopy';
import React from 'react';
import { Download, Upload } from 'lucide-react';
import type { AttachmentRef, Task } from '../types';
import { useStore } from '../store';
import { getTaskOutputAttachments, getTaskReviewInputLinks } from '../lib/taskOutputEvidence';
import { captureWorkspaceSession, isWorkspaceSessionCurrent, onWorkspaceSessionInvalidated } from '../lib/workspaceSession';
import { safeHttpsUrl } from '../lib/security';
import { useI18n } from './I18nProvider';
import { getTaskAccess } from '../lib/access';
import { canManageTaskReview } from '../lib/taskWorkflowAccess';
import { useSaveAction } from '../hooks/useSaveAction';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useShallow } from 'zustand/react/shallow';

const TaskReviewSettings = React.lazy(() => import('./TaskReviewSettings'));

export type OutputUploadState = { busy: boolean; pending: boolean };

export default function TaskOutputFiles({ task, onUploadStateChange }: { task: Task; onUploadStateChange?: (state: OutputUploadState) => void }) {
  const { t } = useI18n();
  const deliverables = useStore(state => state.deliverables);
  const actorId = useStore(state => state.currentUser?.id);
  const state = useStore(useShallow(s => ({ currentUser: s.currentUser, users: s.users, clients: s.clients, projects: s.projects, rolePermissions: s.rolePermissions, backend: s.backend })));
  const access = getTaskAccess(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
  const hasLinkedDeliverable = deliverables.some(item => (item.id === task.deliverableId || item.taskIds.includes(task.id)) && item.clientId === task.clientId && item.cycleId === task.serviceCycleId);
  const canUpload = access.canEdit && hasLinkedDeliverable && Boolean(task.clientId && task.serviceCycleId && (task.assignedTo === actorId || canManageTaskReview(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })))
    && !['Waiting Approval', 'Approved', 'Completed', 'Cancelled'].includes(task.status);
  const { busy: uploading, run } = useSaveAction(`output:${task.id}`);
  const input = React.useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = React.useState('');
  const [uploadSaved, setUploadSaved] = React.useState(false);
  const retained = React.useRef<{ file: File; attachment?: AttachmentRef } | null>(null);
  const pendingUpload = Boolean(uploadError && retained.current);
  useUnsavedChanges(uploading || pendingUpload, uploading);
  React.useLayoutEffect(() => {
    onUploadStateChange?.({ busy: uploading, pending: pendingUpload });
    return () => onUploadStateChange?.({ busy: false, pending: false });
  }, [onUploadStateChange, uploading, pendingUpload]);
  React.useEffect(() => { retained.current = null; setUploadError(''); setUploadSaved(false); }, [task.id, actorId]);
  const upload = async (file: File) => {
    setUploadError(''); setUploadSaved(false);
    retained.current = { file, attachment: retained.current?.file === file ? retained.current.attachment : undefined };
    await run(async isCurrent => {
      const { saveTaskOutputFile } = await import('../lib/taskOutputUpload');
      const result = await saveTaskOutputFile(task, file, isCurrent, retained.current?.attachment);
      if (isCurrent()) retained.current = result.ok ? null : { file, attachment: result.attachment };
      return result;
    }, result => { if (result.ok) { setUploadSaved(true); if (input.current) input.current.value = ''; } else setUploadError(result.error || t('The change is waiting to be saved.')); });
  };
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

  const canConfigure = canManageTaskReview(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
  if (!files.length && !links.length && !canUpload && !canConfigure && !task.accountableLeadId) return null;
  return <>{task.accountableLeadId && <p className="text-sm text-muted">{t('Accountable lead')}: <span data-i18n-skip>{state.users.find(user => user.id === task.accountableLeadId)?.name || t('Team member')}</span></p>}{canConfigure && <React.Suspense fallback={null}><TaskReviewSettings key={`${task.id}:${actorId}`} task={task} /></React.Suspense>}{canUpload && <section className="space-y-2" aria-label={t('Upload output')}>
    <label className="block text-sm font-semibold text-ink">{t('Upload output')}<input ref={input} type="file" accept=".pdf,image/jpeg,image/png,image/webp,image/gif" disabled={uploading || state.backend.hasLocalChanges || state.backend.upgradeRequired || state.backend.mode !== 'supabase'}
      onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="mt-2 block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-inset file:px-3 file:text-ink" /></label>
    <p className="text-xs text-muted">{t(state.backend.mode === 'supabase' ? 'PDF or image, up to 100 MB. This file becomes task output for review.' : 'Private file uploads require the Supabase backend.')}</p>
    {uploading && <p role="status" className="text-sm text-muted">{t('Uploading and saving output…')}</p>}
    {uploadSaved && <p role="status" className="text-sm text-emerald-700">{t('Output file saved for review.')}</p>}
    {uploadError && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{t(uploadError)}</p>{retained.current && <button type="button" disabled={uploading || state.backend.isSaving || state.backend.isPulling} onClick={() => { if (retained.current) void upload(retained.current.file); }} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3"><Upload aria-hidden="true" className="h-4 w-4" />{t('Retry output save')}</button>}</div>}
  </section>}{files.length > 0 && <section aria-label={t('Output files')} className="space-y-2">
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
