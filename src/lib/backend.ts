export type BackendMode = 'local' | 'supabase';

export interface BackendStatus {
  mode: BackendMode;
  configured: boolean;
  ready: boolean;
  missing: string[];
  message: string;
  supabaseUrl?: string;
  stateTable: string;
  stateId: string;
}

const env = (key: string) => (import.meta.env[key] as string | undefined)?.trim() || '';

export const SUPABASE_STATE_TABLE = env('VITE_SUPABASE_STATE_TABLE') || 'aitask_app_state';
export const SUPABASE_STATE_ID = env('VITE_SUPABASE_STATE_ID') || 'default';

export const getBackendMode = (): BackendMode => (
  env('VITE_AITASK_BACKEND') === 'supabase' ? 'supabase' : 'local'
);

export const getSupabaseConfig = () => ({
  url: env('VITE_SUPABASE_URL').replace(/\/$/, ''),
  anonKey: env('VITE_SUPABASE_ANON_KEY'),
  table: SUPABASE_STATE_TABLE,
  stateId: SUPABASE_STATE_ID,
});

export const getBackendStatus = (): BackendStatus => {
  const mode = getBackendMode();
  const config = getSupabaseConfig();
  const missing = [
    !config.url ? 'VITE_SUPABASE_URL' : '',
    !config.anonKey ? 'VITE_SUPABASE_ANON_KEY' : '',
  ].filter(Boolean);

  if (mode === 'local') {
    return {
      mode,
      configured: true,
      ready: true,
      missing: [],
      message: 'Using local mock storage.',
      stateTable: config.table,
      stateId: config.stateId,
    };
  }

  return {
    mode,
    configured: missing.length === 0,
    ready: missing.length === 0,
    missing,
    message: missing.length === 0
      ? 'Supabase snapshot sync is enabled.'
      : `Supabase mode is selected but missing ${missing.join(', ')}.`,
    supabaseUrl: config.url || undefined,
    stateTable: config.table,
    stateId: config.stateId,
  };
};

export const shouldUseSupabase = () => {
  const status = getBackendStatus();
  return status.mode === 'supabase' && status.ready;
};
