import type { AttachmentRef } from '../types';
import { shouldUseSecureSupabase, supabase } from './supabaseClient';

export const SERVICE_FILES_BUCKET = 'client-service-files';
export const SERVICE_FILE_MAX_BYTES = 100 * 1024 * 1024;

const safeName = (value: string) => value.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-160) || 'file';

export const uploadServiceFile = async (input: {
  file: File;
  workspaceId: string;
  clientId: string;
  cycleId: string;
  userId: string;
}): Promise<{ ok: true; attachment: AttachmentRef } | { ok: false; error: string }> => {
  if (!shouldUseSecureSupabase()) return { ok: false, error: 'Private file uploads require the Supabase backend.' };
  if (input.file.size > SERVICE_FILE_MAX_BYTES) return { ok: false, error: 'Files must be 100 MB or smaller.' };
  const id = crypto.randomUUID();
  const path = `${input.workspaceId}/${input.clientId}/${input.cycleId}/${id}-${safeName(input.file.name)}`;
  const { error } = await supabase.storage.from(SERVICE_FILES_BUCKET).upload(path, input.file, {
    cacheControl: '3600',
    contentType: input.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) return { ok: false, error: error.message || 'The file could not be uploaded.' };
  return {
    ok: true,
    attachment: {
      id,
      bucket: SERVICE_FILES_BUCKET,
      path,
      fileName: input.file.name.slice(0, 240),
      mimeType: input.file.type || 'application/octet-stream',
      sizeBytes: input.file.size,
      uploadedBy: input.userId,
      uploadedAt: new Date().toISOString(),
    },
  };
};

export const downloadServiceFile = async (attachment: AttachmentRef) => {
  const { data, error } = await supabase.storage.from(attachment.bucket).download(attachment.path);
  if (error || !data) return { ok: false as const, error: error?.message || 'The file could not be downloaded.' };
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return { ok: true as const };
};
