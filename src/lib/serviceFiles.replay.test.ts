import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  shouldUseSecureSupabase: () => true,
  supabase: { storage: { from: () => ({ upload: mocks.upload }) } },
}));
import { clearPendingServiceFiles, listPendingServiceFiles, uploadServiceFile } from './serviceFiles';

beforeEach(() => { mocks.upload.mockReset(); clearPendingServiceFiles(); });
afterEach(() => { clearPendingServiceFiles(); });

it('keeps an uncertain upload when storage returns a network error', async () => {
  mocks.upload.mockResolvedValueOnce({ error: { message: 'Failed to fetch', status: 0 } });
  const file = { name: 'brief.pdf', type: 'application/pdf', size: 12 } as File;
  const result = await uploadServiceFile({ file, workspaceId: 'aitask-main', clientId: 'qa-client', cycleId: 'qa-cycle', userId: 'qa-pm' });
  expect(result.ok).toBe(false);
  expect(listPendingServiceFiles('qa-pm')).toHaveLength(1);
});

it('retries an uncertain upload with its original object path', async () => {
  mocks.upload.mockResolvedValueOnce({ error: { message: 'Failed to fetch', status: 0 } });
  mocks.upload.mockResolvedValueOnce({ error: null });
  const file = { name: 'brief.pdf', type: 'application/pdf', size: 12 } as File;
  const input = { file, workspaceId: 'aitask-main', clientId: 'qa-client', cycleId: 'qa-cycle', userId: 'qa-pm' };
  expect((await uploadServiceFile(input)).ok).toBe(false);
  expect((await uploadServiceFile(input)).ok).toBe(true);
  expect(mocks.upload.mock.calls[1][0]).toBe(mocks.upload.mock.calls[0][0]);
  expect(listPendingServiceFiles('qa-pm')).toHaveLength(1);
});

it('accepts an existing object only when retrying the same uncertain upload', async () => {
  mocks.upload.mockResolvedValueOnce({ error: { message: 'Failed to fetch', status: 0 } });
  mocks.upload.mockResolvedValueOnce({ error: { message: 'Duplicate', status: 409 } });
  const file = { name: 'art.png', type: 'image/png', size: 5 } as File;
  const input = { file, workspaceId: 'aitask-main', clientId: 'qa-client', cycleId: 'qa-cycle', userId: 'qa-pm' };
  expect((await uploadServiceFile(input)).ok).toBe(false);
  expect((await uploadServiceFile(input)).ok).toBe(true);
  expect(mocks.upload.mock.calls[1][0]).toBe(mocks.upload.mock.calls[0][0]);
});
