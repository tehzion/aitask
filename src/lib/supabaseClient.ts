import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig, shouldUseSupabase } from './backend';
import { capturePasswordSetupMode } from './authRecovery';

const config = getSupabaseConfig();

capturePasswordSetupMode();

export const supabase = createClient(config.url || 'https://invalid.supabase.co', config.anonKey || 'invalid', {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
  },
});

export const shouldUseSecureSupabase = () => shouldUseSupabase();

const isSafeRealtimeFilterValue = (value: string | undefined, maxLength = 160) => (
  typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= maxLength
);

// Do not report a channel as ready until Supabase has confirmed that the
// Postgres Changes binding is active. Without this, a channel can be marked
// SUBSCRIBED while the replication subscription is still missing (or the
// table is not in supabase_realtime), leaving the UI apparently connected but
// silently waiting for the fifteen-second safety pull.
const realtimeChannelOptions = {
  config: {
    postgres_changes_options: { wait: true, timeout: 10_000 },
  },
} as const;

/**
 * Refresh only when the signed-in member's effective access can have changed.
 * The database remains the authorization boundary; Realtime shortens the UI
 * cache window after a Boss Koo permission or role update.
 */
export const subscribeToCurrentMemberAccessChanges = (
  authUserId: string,
  customRoleId: string | undefined,
  builtinRoleId: string | undefined,
  onChange: () => void,
  onError?: () => void,
) => {
  if (!isSafeRealtimeFilterValue(authUserId)) return () => undefined;
  let active = true;
  const notify = () => { if (active) onChange(); };
  const channel = supabase
    .channel(`aitask-member-access:${authUserId}`, realtimeChannelOptions)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'aitask_members',
      filter: `auth_user_id=eq.${authUserId}`,
    }, notify);

  // Refresh when the member's custom role, or the editable default template for
  // their base role, changes so permission edits take effect without a reload.
  const watchedRoleIds = new Set(
    [customRoleId, builtinRoleId].filter((id): id is string => isSafeRealtimeFilterValue(id)),
  );
  watchedRoleIds.forEach(roleId => {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'aitask_entities',
      filter: `entity_id=eq.${roleId}`,
    }, payload => {
      // Use a single column filter across Realtime versions. Check the
      // entity type locally before triggering a permission refresh.
      if (payload.new.entity_type === 'custom_role' && payload.new.entity_id === roleId) notify();
    });
  });

  channel.subscribe(status => {
    if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) onError?.();
  });
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to the workspace revision only. Business rows stay behind the
 * existing RLS-protected snapshot loader; this channel is an invalidation
 * signal, not a second data transport. A revision is incremented by every
 * committed workspace command, including service and notification commands.
 */
export const subscribeToWorkspaceRevisionChanges = (
  workspaceId: string,
  onChange: () => void,
  onError?: () => void,
) => {
  if (!isSafeRealtimeFilterValue(workspaceId)) return () => undefined;
  let active = true;
  const notify = () => { if (active) onChange(); };
  const channel = supabase
    .channel(`aitask-workspace-revision:${workspaceId}`, realtimeChannelOptions)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'aitask_workspaces',
      filter: `id=eq.${workspaceId}`,
    }, notify);

  channel.subscribe(status => {
    if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) onError?.();
  });
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to visible task-row changes as a low-latency fallback for the
 * workspace revision signal. The payload is deliberately reduced to metadata
 * and is never applied directly; the client always reloads the RLS-filtered
 * snapshot after an event. INSERT and UPDATE are used here because Realtime
 * cannot apply RLS to DELETE events.
 */
export const subscribeToWorkspaceTaskChanges = (
  workspaceId: string,
  onChange: () => void,
  onError?: () => void,
) => {
  if (!isSafeRealtimeFilterValue(workspaceId)) return () => undefined;
  let active = true;
  const notify = () => { if (active) onChange(); };
  const filter = `workspace_id=eq.${workspaceId},entity_type=eq.task`;
  const channel = supabase
    .channel(`aitask-task-changes:${workspaceId}`, realtimeChannelOptions)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'aitask_entities',
      filter,
      select: ['workspace_id', 'entity_type', 'entity_id', 'version', 'updated_at'],
    }, notify)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'aitask_entities',
      filter,
      select: ['workspace_id', 'entity_type', 'entity_id', 'version', 'updated_at'],
    }, notify);

  channel.subscribe(status => {
    if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) onError?.();
  });
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
};

const legacyAliases: Record<string, string> = {
  'boss koo': 'boss@aitask.local',
  'project manager demo': 'admin@aitask.local',
  'urbaneats client demo': 'urbaneats.client@aitask.local',
  'adminmojo': 'adminmojo@aitask.local',
};

export const resolveAuthEmail = (identifier: string) => {
  const normalized = identifier.trim().toLowerCase();
  return normalized.includes('@') ? normalized : legacyAliases[normalized] || normalized;
};

export const signOutSecureSession = async () => {
  await supabase.auth.signOut({ scope: 'local' });
};
