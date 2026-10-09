import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ channel: mocks.channel, removeChannel: mocks.removeChannel }) }));
import { subscribeToCurrentMemberAccessChanges } from './supabaseClient';

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
});
