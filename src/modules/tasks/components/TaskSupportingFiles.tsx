import { Download, Upload } from 'lucide-react';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../../app/store/workspaceStore';
import { captureWorkspaceSession, isWorkspaceSessionCurrent, onWorkspaceSessionInvalidated } from '../../../infrastructure/persistence/workspaceSession';
import { getTaskAccess } from '../../../shared/authorization/access';
import { canManageTaskReview } from '../../../shared/authorization/taskWorkflowAccess';
import { useI18n } from '../../../shared/components/I18nProvider';
import SystemMessage from '../../../shared/components/SystemMessage';
import { useSaveAction } from '../../../app/hooks/useSaveAction';
import { useUnsavedChanges } from '../../../shared/hooks/useUnsavedChanges';
import type { AttachmentRef, Task } from '../../../shared/types/index';
import { downloadServiceFile, SERVICE_FILE_ACCEPT } from '../../services/data/serviceFiles';

export default function TaskSupportingFiles({ task }: { task: Task }) {
  const { t } = useI18n();
  const state = useStore(useShallow(s => ({ currentUser: s.currentUser, users: s.users, clients: s.clients, projects: s.projects, rolePermissions: s.rolePermissions, backend: s.backend })));
  const actorId = state.currentUser?.id;
  const access = getTaskAccess(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects });
  const active = !['Waiting Approval', 'Approved', 'Completed', 'Cancelled'].includes(task.status);
  const canUpload = state.currentUser?.role !== 'Client' && access.canEdit && active
    && Boolean(actorId && (task.assignedTo === actorId || canManageTaskReview(state.currentUser, task, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects })));
  const files = state.currentUser?.role === 'Client' ? [] : task.supportingAttachments || [];
  const { busy: uploading, run } = useSaveAction(`supporting:${task.id}`);
  const input = React.useRef<HTMLInputElement>(null);
  const retained = React.useRef<{ file: File; attachment?: AttachmentRef } | null>(null);
  const [uploadError, setUploadError] = React.useState('');
  const [uploadSaved, setUploadSaved] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [downloadFailed, setDownloadFailed] = React.useState(false);
  const pendingUpload = Boolean(uploadError && retained.current);
  useUnsavedChanges(uploading || pendingUpload, uploading);
  const availableFiles = React.useRef(files);
  availableFiles.current = files;
  const view = React.useRef(false);
  const busy = React.useRef(false);
  const generation = React.useRef(0);
  const context = React.useRef('');
  context.current = `${task.id}:${actorId || ''}`;

  React.useEffect(() => {
    view.current = true;
    busy.current = false;
    setPending(null);
    setDownloadFailed(false);
    const unsubscribe = onWorkspaceSessionInvalidated(() => {
      generation.current += 1;
      busy.current = false;
      setPending(null);
      setDownloadFailed(false);
    });
    return () => { view.current = false; generation.current += 1; unsubscribe(); };
  }, [task.id, actorId]);
  React.useEffect(() => { retained.current = null; setUploadError(''); setUploadSaved(false); }, [task.id, actorId]);

  const upload = async (file: File) => {
    setUploadError('');
    setUploadSaved(false);
    retained.current = { file, attachment: retained.current?.file === file ? retained.current.attachment : undefined };
    await run(async isCurrent => {
      const { saveTaskSupportingFile } = await import('../application/taskSupportingUpload');
      const result = await saveTaskSupportingFile(task, file, isCurrent, retained.current?.attachment);
      if (isCurrent()) retained.current = result.ok ? null : { file, attachment: result.attachment };
      return result;
    }, result => {
      if (result.ok) { setUploadSaved(true); if (input.current) input.current.value = ''; }
      else setUploadError(result.error || t('The change is waiting to be saved.'));
    });
  };

  const download = async (file: AttachmentRef) => {
    if (busy.current) return;
    busy.current = true;
    const session = captureWorkspaceSession();
    const capturedContext = context.current;
    const capturedGeneration = generation.current;
    const sameView = () => view.current && context.current === capturedContext && generation.current === capturedGeneration;
    const isCurrent = () => sameView() && isWorkspaceSessionCurrent(session)
      && availableFiles.current.some(item => item.bucket === file.bucket && item.path === file.path);
    setPending(file.path);
    setDownloadFailed(false);
    try {
      if (!isCurrent()) return;
      const result = await downloadServiceFile(file, { isCurrent });
      if (isCurrent() && !result.ok) setDownloadFailed(true);
    } catch {
      if (isCurrent()) setDownloadFailed(true);
    } finally {
      if (sameView()) { busy.current = false; setPending(null); }
    }
  };

  if (state.currentUser?.role === 'Client' || (!files.length && !canUpload)) return null;
  return <section className="space-y-2" aria-label={t('Supporting files')}>
    <div><h3 className="text-sm font-semibold text-ink">{t('Supporting files')}</h3><p className="mt-0.5 text-xs text-muted">{t('Supporting files are private to the team and do not count as delivery evidence.')}</p></div>
    {canUpload && <label className="block text-sm font-medium text-ink">{t('Add supporting file')}<input ref={input} type="file" accept={SERVICE_FILE_ACCEPT} disabled={uploading || state.backend.hasLocalChanges || state.backend.upgradeRequired || state.backend.mode !== 'supabase'}
      onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="mt-2 block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-inset file:px-3 file:text-ink" /></label>}
    {canUpload && <p className="text-xs text-muted">{t(state.backend.mode === 'supabase' ? 'PDF or image, up to 100 MB. You can add supporting files while work is active.' : "Private task file uploads aren't available in this workspace.")}</p>}
    {uploading && <p role="status" className="text-sm text-muted">{t('Uploading and saving supporting file…')}</p>}
    {uploadSaved && <p role="status" className="text-sm text-emerald-700">{t('Supporting file saved.')}</p>}
    {uploadError && <div role="alert" className="space-y-2 text-sm text-red-700"><SystemMessage message={uploadError} />{retained.current && <button type="button" disabled={uploading || state.backend.isSaving || state.backend.isPulling} onClick={() => { if (retained.current) void upload(retained.current.file); }} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3"><Upload aria-hidden="true" className="h-4 w-4" />{t('Retry supporting file save')}</button>}</div>}
    {files.length > 0 && <ul className="space-y-2">{files.map(file => <li key={`${file.bucket}:${file.path}`}><button type="button" disabled={pending !== null} aria-busy={pending === file.path} onClick={() => void download(file)} className="flex min-h-11 w-full items-center gap-3 rounded-control border border-line bg-inset px-3 py-2 text-left text-sm text-ink hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-60"><Download aria-hidden="true" className="h-4 w-4 shrink-0" /><span data-i18n-skip className="min-w-0 flex-1 break-words">{file.fileName}</span><span className="shrink-0 text-xs font-semibold">{t(pending === file.path ? 'Downloading…' : 'Download')}</span></button></li>)}</ul>}
    {pending && <p role="status" className="text-sm text-muted">{t('Downloading…')}</p>}
    {downloadFailed && <p role="alert" className="text-sm text-red-700">{t('The file could not be downloaded.')}</p>}
  </section>;
}
