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
