import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ channel: mocks.channel, removeChannel: mocks.removeChannel }) }));
import { subscribeToCurrentMemberAccessChanges, subscribeToWorkspaceRevisionChanges } from './supabaseClient';

type Watcher = { filter: { table: string; filter: string }; callback: (payload: { new: Record<string, unknown> }) => void };
let watchers: Watcher[];
beforeEach(() => {
  vi.clearAllMocks(); watchers = [];
  const channel = {
    on: vi.fn((_event, filter, callback) => { watchers.push({ filter, callback }); return channel; }),
    subscribe: vi.fn(),
  };
  mocks.channel.mockReturnValue(channel);
});

describe('effective access realtime subscription', () => {
  it.each(['builtin-hod', 'builtin-staff', 'builtin-client', 'builtin-project-manager'])('uses a single supported column filter for %s', roleId => {
    subscribeToCurrentMemberAccessChanges('auth-id', undefined, roleId, vi.fn());
    expect(watchers.find(watcher => watcher.filter.table === 'aitask_entities')?.filter.filter).toBe(`entity_id=eq.${roleId}`);
  });
  it('refreshes only watched role rows, ignoring unrelated entity types', () => {
    const refresh = vi.fn();
    subscribeToCurrentMemberAccessChanges('auth-id', 'custom-hod', 'builtin-hod', refresh);
    const watched = watchers.find(watcher => watcher.filter.filter === 'entity_id=eq.custom-hod')!;
    watched.callback({ new: { entity_type: 'task', entity_id: 'custom-hod' } });
    expect(refresh).not.toHaveBeenCalled();
    watched.callback({ new: { entity_type: 'custom_role', entity_id: 'other-role' } });
    expect(refresh).not.toHaveBeenCalled();
    watched.callback({ new: { entity_type: 'custom_role', entity_id: 'custom-hod' } });
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('ignores delayed callbacks after the HOD subscription is removed', () => {
    const refresh = vi.fn();
    const cleanup = subscribeToCurrentMemberAccessChanges('auth-id', undefined, 'builtin-hod', refresh);
    cleanup();
    watchers[0].callback({ new: {} });
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });
  it('reports channel failures without treating them as permission failures', () => {
    const onError = vi.fn();
    subscribeToCurrentMemberAccessChanges('auth-id', undefined, 'builtin-hod', vi.fn(), onError);
    const subscribe = mocks.channel.mock.results[0]?.value.subscribe as ReturnType<typeof vi.fn>;
    subscribe.mock.calls[0]?.[0]?.('CHANNEL_ERROR');
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('workspace revision realtime subscription', () => {
  it('subscribes to the RLS-protected workspace revision row', () => {
    const refresh = vi.fn();
    subscribeToWorkspaceRevisionChanges('aitask-main', refresh);
    const watcher = watchers.find(item => item.filter.table === 'aitask_workspaces');
    expect(watcher?.filter.filter).toBe('id=eq.aitask-main');
    watcher?.callback({ new: { version: 9 } });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('rejects unsafe identifiers and ignores callbacks after cleanup', () => {
    const refresh = vi.fn();
    const invalidCleanup = subscribeToWorkspaceRevisionChanges('aitask-main,other', refresh);
    expect(mocks.channel).not.toHaveBeenCalled();
    invalidCleanup();

    const cleanup = subscribeToWorkspaceRevisionChanges('aitask-main', refresh);
    cleanup();
    watchers.find(item => item.filter.table === 'aitask_workspaces')?.callback({ new: { version: 10 } });
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });
  it('reports workspace channel timeouts so the UI can explain the fallback refresh', () => {
    const onError = vi.fn();
    subscribeToWorkspaceRevisionChanges('aitask-main', vi.fn(), onError);
    const subscribe = mocks.channel.mock.results[0]?.value.subscribe as ReturnType<typeof vi.fn>;
    subscribe.mock.calls[0]?.[0]?.('TIMED_OUT');
    expect(onError).toHaveBeenCalledOnce();
  });
});
