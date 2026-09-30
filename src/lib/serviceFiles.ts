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

const PENDING_SERVICE_FILES_KEY = 'aitask:pending-service-files:v1';
const pendingServiceFiles = new Map<string, AttachmentRef>();

const pendingServiceFileKey = (attachment: Pick<AttachmentRef, 'bucket' | 'path'>) => `${attachment.bucket}:${attachment.path}`;

const hydratePendingServiceFiles = () => {
  if (pendingServiceFiles.size > 0 || typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(PENDING_SERVICE_FILES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    parsed.forEach((item) => {
      if (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.bucket === 'string' &&
        typeof item.path === 'string' &&
        typeof item.fileName === 'string'
      ) {
        pendingServiceFiles.set(pendingServiceFileKey(item), item as AttachmentRef);
      }
    });
  } catch {
    // Session storage is best-effort. The in-memory registry still protects
    // uploads made during the current page session.
  }
};

const persistPendingServiceFiles = () => {
  if (typeof window === 'undefined') return;
  try {
    if (pendingServiceFiles.size === 0) {
      window.sessionStorage.removeItem(PENDING_SERVICE_FILES_KEY);
      return;
    }
    window.sessionStorage.setItem(PENDING_SERVICE_FILES_KEY, JSON.stringify(Array.from(pendingServiceFiles.values())));
  } catch {
    // Storage can be unavailable or full; cleanup still works in-memory.
  }
};

export const trackPendingServiceFile = (attachment: AttachmentRef) => {
  hydratePendingServiceFiles();
  pendingServiceFiles.set(pendingServiceFileKey(attachment), attachment);
  persistPendingServiceFiles();
};

export const forgetPendingServiceFile = (attachment: Pick<AttachmentRef, 'bucket' | 'path'>) => {
  hydratePendingServiceFiles();
  pendingServiceFiles.delete(pendingServiceFileKey(attachment));
  persistPendingServiceFiles();
};

export const clearPendingServiceFiles = () => {
  pendingServiceFiles.clear();
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(PENDING_SERVICE_FILES_KEY); } catch { /* best effort */ }
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
  const id = crypto.randomUUID();
  const path = `${input.workspaceId}/${input.clientId}/${input.cycleId}/${id}-${safeName(input.file.name)}`;
  try {
    const { error } = await supabase.storage.from(SERVICE_FILES_BUCKET).upload(path, input.file, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message || 'The file could not be uploaded.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The file could not be uploaded.',
    };
  }
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
  trackPendingServiceFile(attachment);
  return {
    ok: true,
    attachment,
  };
};

export const removeServiceFile = async (attachment: AttachmentRef) => {
  if (!shouldUseSecureSupabase()) {
    return { ok: false as const, error: 'Private file cleanup requires the Supabase backend.' };
  }
  try {
    const { error } = await supabase.storage.from(attachment.bucket).remove([attachment.path]);
    if (error) return { ok: false as const, error: error.message || 'The uploaded file could not be removed.' };
    forgetPendingServiceFile(attachment);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'The uploaded file could not be removed.',
    };
  }
};

export const cleanupPendingServiceFiles = async () => {
  hydratePendingServiceFiles();
  const attachments = Array.from(pendingServiceFiles.values());
  if (attachments.length === 0) return { ok: true as const, removed: 0 };
  if (!shouldUseSecureSupabase()) {
    return { ok: false as const, removed: 0, error: 'Private file cleanup requires the Supabase backend.' };
  }

  let removed = 0;
  let firstError: string | undefined;
  const byBucket = new Map<string, AttachmentRef[]>();
  attachments.forEach((attachment) => {
    const bucket = byBucket.get(attachment.bucket) || [];
    bucket.push(attachment);
    byBucket.set(attachment.bucket, bucket);
  });
  for (const [bucket, bucketAttachments] of byBucket) {
    try {
      const { error } = await supabase.storage.from(bucket).remove(bucketAttachments.map(attachment => attachment.path));
      if (error) {
        firstError ||= error.message || 'The uploaded files could not be removed.';
        continue;
      }
      bucketAttachments.forEach(attachment => {
        pendingServiceFiles.delete(pendingServiceFileKey(attachment));
        removed += 1;
      });
    } catch (error) {
      firstError ||= error instanceof Error ? error.message : 'The uploaded files could not be removed.';
    }
  }
  persistPendingServiceFiles();
  return firstError
    ? { ok: false as const, removed, error: firstError }
    : { ok: true as const, removed };
};

export const downloadServiceFile = async (attachment: AttachmentRef) => {
  try {
    if (!shouldUseSecureSupabase()) {
      const localDemoFile = getLocalServiceDemoFile(attachment);
      if (!localDemoFile) return { ok: false as const, error: 'Private file downloads require the Supabase backend.' };
      triggerBrowserDownload(new Blob([localDemoFile.content], { type: localDemoFile.mimeType }), attachment.fileName);
      return { ok: true as const };
    }
    const { data, error } = await supabase.storage.from(attachment.bucket).download(attachment.path);
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
