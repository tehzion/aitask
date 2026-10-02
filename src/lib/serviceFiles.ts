import { assertWorkspaceSession, captureWorkspaceSession, isWorkspaceSessionCurrent } from './workspaceSession';
import type { AttachmentRef } from '../types';
import { shouldUseSecureSupabase, supabase } from './supabaseClient';
import { getLocalServiceDemoFile } from '../mock/localServiceDemo';

export const SERVICE_FILES_BUCKET = 'client-service-files';
export const SERVICE_FILE_MAX_BYTES = 100 * 1024 * 1024;
export const SERVICE_FILE_ACCEPT = '.pdf,image/jpeg,image/png,image/webp,image/gif';
export const SERVICE_FILE_TYPE_ERROR = 'Only PDF or image files are allowed.';
export const SERVICE_FILE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

type ServiceFileMimeType = typeof SERVICE_FILE_ALLOWED_MIME_TYPES[number];

const serviceFileMimeTypes = new Set<string>(SERVICE_FILE_ALLOWED_MIME_TYPES);
const serviceFileMimeByExtension: Record<string, ServiceFileMimeType> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const PENDING_SERVICE_FILES_KEY = 'aitask:pending-service-files:v2';
const DURABLE_FILE_PREFIX = 'aitask:pending-service-file:v3:';
const durableKey = (attachment: Pick<AttachmentRef, 'bucket' | 'path'>) => `${DURABLE_FILE_PREFIX}${encodeURIComponent(attachment.bucket)}:${encodeURIComponent(attachment.path)}`;
const submissions = new Map<string, string>();
const pendingServiceFiles = new Map<string, AttachmentRef>();
const durableFiles = new Set<string>();
let legacyHydrated = false;

const pendingServiceFileKey = (attachment: Pick<AttachmentRef, 'bucket' | 'path'>) => `${attachment.bucket}:${attachment.path}`;

const hydratePendingServiceFiles = () => {
  if (typeof window === 'undefined') return;
  try {
    const restore = (item: unknown, legacy = false, storageKey?: string) => {
      if (
        item &&
        typeof item === 'object' &&
        'id' in item && typeof item.id === 'string' &&
        'bucket' in item && typeof item.bucket === 'string' &&
        'path' in item && typeof item.path === 'string' &&
        'fileName' in item && typeof item.fileName === 'string' &&
        'uploadedBy' in item && typeof item.uploadedBy === 'string'
      ) {
        const attachment = item as AttachmentRef;
        if (storageKey && durableKey(attachment) !== storageKey) return null;
        const key = pendingServiceFileKey(attachment);
        pendingServiceFiles.set(key, attachment);
        if ('pendingCommandId' in item && typeof item.pendingCommandId === 'string') submissions.set(key, item.pendingCommandId);
        else if (legacy) submissions.set(key, 'legacy-unresolved');
        else submissions.delete(key);
        return attachment;
      }
      return null;
    };
    // Migrate the old tab cache once. New writes use individual durable records,
    // so a stale tab cannot rewrite another tab's command ownership or uploads.
    if (!legacyHydrated) {
      legacyHydrated = true;
      try {
        const currentRaw = window.sessionStorage.getItem(PENDING_SERVICE_FILES_KEY);
        const legacyRaw = currentRaw ? null : window.sessionStorage.getItem('aitask:pending-service-files:v1');
        const parsed = JSON.parse(currentRaw || legacyRaw || '[]');
        if (Array.isArray(parsed)) parsed.forEach(item => {
          const attachment = restore(item, Boolean(legacyRaw));
          if (attachment && !window.localStorage.getItem(durableKey(attachment))) {
            window.localStorage.setItem(durableKey(attachment), JSON.stringify({ ...attachment, pendingCommandId: submissions.get(pendingServiceFileKey(attachment)) }));
          }
        });
        window.sessionStorage.removeItem(PENDING_SERVICE_FILES_KEY);
        window.sessionStorage.removeItem('aitask:pending-service-files:v1');
      } catch { /* An unavailable or malformed tab cache must not hide durable recovery. */ }
    }
    const present = new Set<string>();
    Object.keys(window.localStorage).filter(key => key.startsWith(DURABLE_FILE_PREFIX)).forEach(storageKey => {
      try {
        const attachment = restore(JSON.parse(window.localStorage.getItem(storageKey) || 'null'), false, storageKey);
        if (attachment) present.add(pendingServiceFileKey(attachment));
      } catch { /* Ignore malformed recovery records. */ }
    });
    durableFiles.forEach(key => {
      if (!present.has(key)) { pendingServiceFiles.delete(key); submissions.delete(key); }
    });
    durableFiles.clear();
    present.forEach(key => durableFiles.add(key));
  } catch {
    // Session storage is best-effort. The in-memory registry still protects
    // uploads made during the current page session.
  }
};

const persistPendingServiceFiles = (changed: AttachmentRef[]) => {
  if (typeof window === 'undefined') return;
  try {
    changed.forEach(attachment => {
      window.localStorage.setItem(durableKey(attachment), JSON.stringify({ ...attachment, pendingCommandId: submissions.get(pendingServiceFileKey(attachment)) }));
      durableFiles.add(pendingServiceFileKey(attachment));
    });
    window.sessionStorage.removeItem(PENDING_SERVICE_FILES_KEY);
  } catch {
    // Fall back to this tab's cache if durable storage is unavailable.
    try { window.sessionStorage.setItem(PENDING_SERVICE_FILES_KEY, JSON.stringify(Array.from(pendingServiceFiles.values()).map(attachment => ({ ...attachment, pendingCommandId: submissions.get(pendingServiceFileKey(attachment)) })))); } catch { /* In-memory recovery remains available. */ }
  }
};

export const trackPendingServiceFile = (attachment: AttachmentRef) => {
  hydratePendingServiceFiles();
  pendingServiceFiles.set(pendingServiceFileKey(attachment), attachment);
  persistPendingServiceFiles([attachment]);
};

export const forgetPendingServiceFile = (attachment: Pick<AttachmentRef, 'bucket' | 'path'>) => {
  hydratePendingServiceFiles();
  if (typeof window !== 'undefined') { try { window.localStorage.removeItem(durableKey(attachment)); } catch { /* best effort */ } }
  pendingServiceFiles.delete(pendingServiceFileKey(attachment));
  submissions.delete(pendingServiceFileKey(attachment));
  durableFiles.delete(pendingServiceFileKey(attachment));
  persistPendingServiceFiles([]);
};

export const clearPendingServiceFiles = () => {
  pendingServiceFiles.clear();
  submissions.clear();
  durableFiles.clear();
  legacyHydrated = false;
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(PENDING_SERVICE_FILES_KEY); } catch { /* best effort */ }
};

// Bind only attachments actually submitted by this command. An unrelated save
// must never clear an upload belonging to another form or another member.
const attachmentKeys = (value: unknown): Set<string> => {
  const keys = new Set<string>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    const row = item as Record<string, unknown>;
    if (typeof row.bucket === 'string' && typeof row.path === 'string') keys.add(`${row.bucket}:${row.path}`);
    Object.values(row).forEach(visit);
  };
  visit(value);
  return keys;
};
export const bindPendingServiceFiles = (commandId: string, operations: unknown) => {
  hydratePendingServiceFiles();
  const keys = attachmentKeys(operations);
  const changed: AttachmentRef[] = [];
  pendingServiceFiles.forEach((attachment, key) => { if (keys.has(key)) { submissions.set(key, commandId); changed.push(attachment); } });
  persistPendingServiceFiles(changed);
};
export const acknowledgePendingServiceFiles = (commandId: string) => {
  hydratePendingServiceFiles();
  Array.from(pendingServiceFiles.entries()).forEach(([key, attachment]) => {
    if (submissions.get(key) === commandId) forgetPendingServiceFile(attachment);
  });
};
export const reconcilePendingServiceFiles = (actorId: string, canonical: unknown) => {
  hydratePendingServiceFiles();
  const referenced = attachmentKeys(canonical);
  Array.from(pendingServiceFiles.entries()).forEach(([key, attachment]) => {
    if (attachment.uploadedBy === actorId && referenced.has(key)) forgetPendingServiceFile(attachment);
  });
};

export const getServiceFileMimeType = (file: Pick<File, 'name' | 'type'>): ServiceFileMimeType | null => {
  const mimeType = file.type.trim().toLowerCase().split(';', 1)[0] || '';
  if (serviceFileMimeTypes.has(mimeType)) return mimeType as ServiceFileMimeType;

  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  if ((!mimeType || mimeType === 'application/octet-stream') && serviceFileMimeByExtension[extension]) {
    return serviceFileMimeByExtension[extension];
  }
  return null;
};

const safeName = (value: string) => value.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-160) || 'file';

const triggerBrowserDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
};

export const uploadServiceFile = async (input: {
  file: File;
  workspaceId: string;
  clientId: string;
  cycleId: string;
  userId: string;
}): Promise<{ ok: true; attachment: AttachmentRef } | { ok: false; error: string }> => {
  if (!shouldUseSecureSupabase()) return { ok: false, error: 'Private file uploads require the Supabase backend.' };
  if (input.file.size > SERVICE_FILE_MAX_BYTES) return { ok: false, error: 'Files must be 100 MB or smaller.' };
  const contentType = getServiceFileMimeType(input.file);
  if (!contentType) return { ok: false, error: SERVICE_FILE_TYPE_ERROR };
  const sessionToken = captureWorkspaceSession();
  const id = crypto.randomUUID();
  const path = `${input.workspaceId}/${input.clientId}/${input.cycleId}/${id}-${safeName(input.file.name)}`;
  const attachment: AttachmentRef = {
    id,
    bucket: SERVICE_FILES_BUCKET,
    path,
    fileName: input.file.name.slice(0, 240),
    mimeType: contentType,
    sizeBytes: input.file.size,
    uploadedBy: input.userId,
    uploadedAt: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.storage.from(SERVICE_FILES_BUCKET).upload(path, input.file, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message || 'The file could not be uploaded.' };
    trackPendingServiceFile(attachment);
    assertWorkspaceSession(sessionToken);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The file could not be uploaded.',
    };
  }
  return {
    ok: true,
    attachment,
  };
};

export const listPendingServiceFiles = (actorId: string) => {
  hydratePendingServiceFiles();
  return Array.from(pendingServiceFiles.values()).filter(file => file.uploadedBy === actorId).map(file => ({ ...file, commandId: submissions.get(pendingServiceFileKey(file)) }));
};

export const reconcileServiceUpload = async (attachment: AttachmentRef, abandon = false): Promise<{ ok: true; status: string; error?: undefined } | { ok: false; error: string; status?: undefined }> => {
  const token = captureWorkspaceSession();
  const commandId = submissions.get(pendingServiceFileKey(attachment));
  // Legacy entries have no trustworthy command ID, so never abandon them.
  if (commandId === 'legacy-unresolved') return { ok: false as const, error: 'Upload confirmation is unresolved. The file was retained to protect saved activity.' };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  token.signal.addEventListener('abort', abort, { once: true });
  try {
    assertWorkspaceSession(token);
    const request = supabase.rpc('aitask_reconcile_service_upload', {
      p_workspace_id: attachment.path.split('/')[0], p_command_id: commandId || null,
      p_path: attachment.path, p_abandon: abandon,
    }).abortSignal(controller.signal);
    const { data, error } = await Promise.race([
      request,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Upload reconciliation timed out. The file was retained.')); }, 20000); }),
    ]);
    assertWorkspaceSession(token);
    if (error || !data?.ok) return { ok: false as const, error: error?.message || data?.error || 'Upload reconciliation is unavailable. The file was retained.' };
    if (!['referenced', 'missing', 'abandoned', 'unresolved', 'committed-unreferenced'].includes(data.status)) return { ok: false as const, error: 'Upload confirmation is unresolved. The file was retained to protect saved activity.' };
    return { ok: true as const, status: data.status as string };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Upload reconciliation is unavailable. The file was retained.' }; }
  finally { if (timeout) clearTimeout(timeout); token.signal.removeEventListener('abort', abort); }
};

export const removeServiceFile = async (attachment: AttachmentRef, options: { abandonSubmitted?: boolean } = {}): Promise<{ ok: true; error?: undefined } | { ok: false; error: string }> => {
  hydratePendingServiceFiles();
  const token = captureWorkspaceSession();
  const key = pendingServiceFileKey(attachment);
  if (!pendingServiceFiles.has(key)) return { ok: false as const, error: 'This file is not an unsubmitted upload and cannot be removed here.' };
  if (submissions.has(key) && !options.abandonSubmitted) return { ok: false as const, error: 'Upload confirmation is unresolved. The file was retained to protect saved activity.' };
  if (!shouldUseSecureSupabase()) return { ok: false as const, error: 'Private file cleanup requires the Supabase backend.' };
  const status = await reconcileServiceUpload(attachment, true);
  if (!status.ok) return status;
  if (!isWorkspaceSessionCurrent(token)) return { ok: false as const, error: 'Your session changed. Sign in again.' };
  if (status.status === 'referenced' || status.status === 'missing') { forgetPendingServiceFile(attachment); return { ok: true as const }; }
  if (status.status !== 'abandoned') return { ok: false as const, error: 'Upload confirmation is unresolved. The file was retained to protect saved activity.' };
  try {
    const { error } = await supabase.storage.from(attachment.bucket).remove([attachment.path]);
    assertWorkspaceSession(token);
    if (error) return { ok: false as const, error: error.message || 'The uploaded file could not be removed.' };
    forgetPendingServiceFile(attachment); return { ok: true as const };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'The uploaded file could not be removed.' }; }
};

export const cleanupPendingServiceFiles = async (actorId?: string, options: { abandonSubmitted?: boolean; commandIds?: string[]; includeUnsubmitted?: boolean } = {}) => {
  const token = captureWorkspaceSession();
  const owned = (actorId ? listPendingServiceFiles(actorId) : []).filter(file => options.commandIds ? Boolean(file.commandId && options.commandIds.includes(file.commandId)) : options.includeUnsubmitted === false ? Boolean(file.commandId) : true);
  let removed = 0;
  let error: string | undefined;
  for (const file of owned) {
    if (!isWorkspaceSessionCurrent(token)) return { ok: false as const, removed, error: 'Your session changed. Sign in again.' };
    const result = await removeServiceFile(file, options);
    if (result.ok) removed += 1; else error ||= result.error;
  }
  return error ? { ok: false as const, removed, error } : { ok: true as const, removed };
};

export const refreshPendingServiceFiles = async (actorId: string) => {
  const token = captureWorkspaceSession();
  let error: string | undefined;
  for (const file of listPendingServiceFiles(actorId)) {
    if (!isWorkspaceSessionCurrent(token)) return { ok: false as const, error: 'Your session changed. Sign in again.' };
    const result = await reconcileServiceUpload(file);
    if (result.ok && (result.status === 'referenced' || result.status === 'missing')) forgetPendingServiceFile(file);
    else if (!result.ok) error ||= result.error;
  }
  return error ? { ok: false as const, error } : { ok: true as const };
};

export const downloadServiceFile = async (attachment: AttachmentRef) => {
  const token = captureWorkspaceSession();
  try {
    if (!shouldUseSecureSupabase()) {
      const localDemoFile = getLocalServiceDemoFile(attachment);
      if (!localDemoFile) return { ok: false as const, error: 'Private file downloads require the Supabase backend.' };
      triggerBrowserDownload(new Blob([localDemoFile.content], { type: localDemoFile.mimeType }), attachment.fileName);
      return { ok: true as const };
    }
    const { data, error } = await supabase.storage.from(attachment.bucket).download(attachment.path);
    assertWorkspaceSession(token);
    if (error || !data) return { ok: false as const, error: error?.message || 'The file could not be downloaded.' };
    triggerBrowserDownload(data, attachment.fileName);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'The file could not be downloaded.',
    };
  }
};
