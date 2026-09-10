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

/**
 * Refresh only when the signed-in member's effective access can have changed.
 * The database remains the authorization boundary; Realtime shortens the UI
 * cache window after a Boss Koo permission or role update.
 */
export const subscribeToCurrentMemberAccessChanges = (
  authUserId: string,
  customRoleId: string | undefined,
  onChange: () => void,
) => {
  if (!isSafeRealtimeFilterValue(authUserId)) return () => undefined;
  const channel = supabase
    .channel(`aitask-member-access:${authUserId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'aitask_members',
      filter: `auth_user_id=eq.${authUserId}`,
    }, onChange);

  if (isSafeRealtimeFilterValue(customRoleId)) {
    channel.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'aitask_entities',
      filter: `entity_type=eq.custom_role,entity_id=eq.${customRoleId}`,
    }, onChange);
  }

  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
};

const legacyAliases: Record<string, string> = {
  'boss koo': 'boss@aitask.local',
  'admin demo': 'admin@aitask.local',
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
