import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentRef } from '../types';
const { remove, rpc, download } = vi.hoisted(() => ({ remove: vi.fn(), rpc: vi.fn(), download: vi.fn() }));
vi.mock('./supabaseClient', () => ({ shouldUseSecureSupabase: () => true, supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }), storage: { from: () => ({ remove, download }) } } }));
import { acknowledgePendingServiceFiles, bindPendingServiceFiles, cleanupPendingServiceFiles, clearPendingServiceFiles, downloadServiceFile, refreshPendingServiceFiles, listPendingServiceFiles, reconcilePendingServiceFiles, removeServiceFile, trackPendingServiceFile } from './serviceFiles';
import { invalidateWorkspaceSession } from './workspaceSession';
const attachment = (id: string, actor = 'actor-a'): AttachmentRef => ({ id, bucket: 'client-service-files', path: `workspace/client/cycle/${id}.pdf`, uploadedBy: actor, fileName: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 10, uploadedAt: '2026-09-30T00:00:00Z' });
beforeEach(() => { clearPendingServiceFiles(); remove.mockReset(); remove.mockResolvedValue({ error: null }); download.mockReset(); rpc.mockReset(); rpc.mockResolvedValue({ data: { ok: true, status: 'abandoned' }, error: null }); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('upload ownership and uncertain saves', () => {
  it('does not deliver a former account download after its session changes', async () => {
    const createElement = vi.fn(() => { throw new Error('Download triggered after sign-out'); });
    vi.stubGlobal('document', { createElement });
    let finish!: (value: unknown) => void;
    download.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const request = downloadServiceFile(attachment('old-account-download'));
    invalidateWorkspaceSession();
    finish({ data: new Blob(['private content']), error: null });
    expect(await request).toEqual({ ok: false, error: 'Workspace session changed.' });
    expect(createElement).not.toHaveBeenCalled();
  });
  it('an unrelated command acknowledgement never loses an unsubmitted upload', async () => {
    const first = attachment('first'); const other = attachment('other');
    trackPendingServiceFile(first); trackPendingServiceFile(other);
    bindPendingServiceFiles('first-command', [{ data: { attachments: [first] } }]);
    acknowledgePendingServiceFiles('unrelated-command');
    acknowledgePendingServiceFiles('first-command');
    expect((await removeServiceFile(first)).ok).toBe(false);
    await cleanupPendingServiceFiles('actor-a');
    expect(remove).toHaveBeenCalledExactlyOnceWith([other.path]);
  });
  it('retains files from uncertain commands even if currently absent from canonical state', async () => {
    const file = attachment('uncertain'); trackPendingServiceFile(file);
    bindPendingServiceFiles('uncertain-command', [{ data: { attachments: [file] } }]);
    reconcilePendingServiceFiles('actor-a', { cycleComments: [] });
    expect((await cleanupPendingServiceFiles('actor-a')).ok).toBe(false);
    expect((await removeServiceFile(file)).ok).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    acknowledgePendingServiceFiles('uncertain-command');
    expect(await cleanupPendingServiceFiles('actor-a')).toEqual({ ok: true, removed: 0, cleared: 0, deleted: 0, failed: 0, remaining: 0 });
  });
  it('never deletes another account uploads or canonically referenced files', async () => {
    const first = attachment('referenced'); const other = attachment('other-account', 'actor-b');
    trackPendingServiceFile(first); trackPendingServiceFile(other);
    reconcilePendingServiceFiles('actor-a', { cycleComments: [{ attachments: [first] }] });
    await cleanupPendingServiceFiles('actor-a');
    expect(remove).not.toHaveBeenCalled();
    await cleanupPendingServiceFiles('actor-b');
    expect(remove).toHaveBeenCalledExactlyOnceWith([other.path]);
  });
  it('resolves a timeout after server commit without deleting referenced storage', async () => {
    const file = attachment('committed'); trackPendingServiceFile(file);
    bindPendingServiceFiles('550e8400-e29b-41d4-a716-446655440000', [{ attachments: [file] }]);
    rpc.mockResolvedValueOnce({ data: { ok: true, status: 'referenced' }, error: null });
    expect(await cleanupPendingServiceFiles('actor-a', { abandonSubmitted: true })).toEqual({ ok: true, removed: 1, cleared: 1, deleted: 0, failed: 0, remaining: 0 });
    expect(remove).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_abandon: true, p_command_id: '550e8400-e29b-41d4-a716-446655440000' });
  });
  it('retains unresolved files when the authoritative endpoint is missing', async () => {
    const file = attachment('unavailable'); trackPendingServiceFile(file);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC unavailable' } });
    expect(await cleanupPendingServiceFiles('actor-a', { abandonSubmitted: true })).toMatchObject({ ok: false, error: 'RPC unavailable' });
    expect(remove).not.toHaveBeenCalled();
    expect(await cleanupPendingServiceFiles('actor-a', { abandonSubmitted: true })).toEqual({ ok: true, removed: 1, cleared: 1, deleted: 1, failed: 0, remaining: 0 });
  });
  it('surfaces cleanup failure and retains the file for retry', async () => {
    const file = attachment('cleanup-retry'); trackPendingServiceFile(file);
    remove.mockResolvedValueOnce({ error: { message: 'Storage unavailable' } });
    expect(await cleanupPendingServiceFiles('actor-a')).toMatchObject({ ok: false, removed: 0, error: 'Storage unavailable' });
    expect(await cleanupPendingServiceFiles('actor-a')).toEqual({ ok: true, removed: 1, cleared: 1, deleted: 1, failed: 0, remaining: 0 });
  });
});

describe('upload recovery summaries', () => {
  it('reports a partial check without deleting protected files or hiding unresolved uploads', async () => {
    for (const id of ['saved', 'missing', 'unknown', 'failed']) trackPendingServiceFile(attachment(id));
    rpc.mockResolvedValueOnce({ data: { ok: true, status: 'referenced' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 'missing' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 'unresolved' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Connection lost' } });
    expect(await refreshPendingServiceFiles('actor-a')).toMatchObject({ ok: false, cleared: 2, remaining: 2, failed: 1, deleted: 0 });
    expect(listPendingServiceFiles('actor-a').map(file => file.id)).toEqual(['unknown', 'failed']);
    expect(remove).not.toHaveBeenCalled();
  });
  it('does not confuse clearing protected references with deleting files', async () => {
    for (const id of ['saved', 'missing', 'abandoned']) trackPendingServiceFile(attachment(id));
    rpc.mockResolvedValueOnce({ data: { ok: true, status: 'referenced' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 'missing' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 'abandoned' }, error: null });
    expect(await cleanupPendingServiceFiles('actor-a', { abandonSubmitted: true })).toMatchObject({ ok: true, cleared: 3, deleted: 1, remaining: 0, failed: 0 });
    expect(remove).toHaveBeenCalledExactlyOnceWith([attachment('abandoned').path]);
  });
  it('keeps a successfully checked but unresolved upload visible', async () => {
    trackPendingServiceFile(attachment('unresolved'));
    rpc.mockResolvedValueOnce({ data: { ok: true, status: 'unresolved' }, error: null });
    expect(await refreshPendingServiceFiles('actor-a')).toMatchObject({ ok: true, cleared: 0, remaining: 1, failed: 0 });
  });
  it('does not start a download when the client context changed during loading', async () => {
    const createElement = vi.fn(); vi.stubGlobal('document', { createElement });
    download.mockResolvedValueOnce({ data: new Blob(['private content']), error: null });
    expect(await downloadServiceFile(attachment('another-client'), { isCurrent: () => false })).toMatchObject({ ok: false });
    expect(createElement).not.toHaveBeenCalled();
  });
});
