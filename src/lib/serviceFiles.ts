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
  return {
    ok: true,
    attachment: {
      id,
      bucket: SERVICE_FILES_BUCKET,
      path,
      fileName: input.file.name.slice(0, 240),
      mimeType: contentType,
      sizeBytes: input.file.size,
      uploadedBy: input.userId,
      uploadedAt: new Date().toISOString(),
    },
  };
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
