export type BackendMode = 'local' | 'supabase';

export interface BackendStatus {
  mode: BackendMode;
  configured: boolean;
  ready: boolean;
  missing: string[];
  message: string;
  supabaseUrl?: string;
  runtimeHost?: string;
  isHostedRuntime: boolean;
  stateTable: string;
  stateId: string;
}

const env = (key: string) => (import.meta.env[key] as string | undefined)?.trim() || '';

const getRuntimeHost = () => (
  typeof window === 'undefined' ? '' : window.location.hostname
);

const isLocalHost = (host: string) => (
  !host ||
  host === 'localhost' ||
  host === '127.0.0.1' ||
  host === '::1'
);

export const SUPABASE_STATE_TABLE = env('VITE_SUPABASE_STATE_TABLE') || 'aitask_app_state';
export const SUPABASE_STATE_ID = env('VITE_SUPABASE_STATE_ID') || 'default';

export const getBackendMode = (): BackendMode => {
  const configuredMode = env('VITE_AITASK_BACKEND').toLowerCase();
  if (configuredMode === 'local' || configuredMode === 'supabase') {
    return configuredMode;
  }

  const hasSupabaseConfig = Boolean(env('VITE_SUPABASE_URL') && env('VITE_SUPABASE_ANON_KEY'));
  if (hasSupabaseConfig || !isLocalHost(getRuntimeHost())) {
    return 'supabase';
  }

  return 'local';
};

export const getSupabaseConfig = () => ({
  url: env('VITE_SUPABASE_URL').replace(/\/$/, ''),
  anonKey: env('VITE_SUPABASE_ANON_KEY'),
  table: SUPABASE_STATE_TABLE,
  stateId: SUPABASE_STATE_ID,
});

export const getBackendStatus = (): BackendStatus => {
  const mode = getBackendMode();
  const config = getSupabaseConfig();
  const runtimeHost = getRuntimeHost();
  const isHostedRuntime = !isLocalHost(runtimeHost);
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
      message: isHostedRuntime
        ? 'This deployed build is still using local browser storage. Set Supabase environment variables in Vercel and redeploy.'
        : 'Using local mock storage.',
      runtimeHost: runtimeHost || undefined,
      isHostedRuntime,
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
    runtimeHost: runtimeHost || undefined,
    isHostedRuntime,
    stateTable: config.table,
    stateId: config.stateId,
  };
};

export const shouldUseSupabase = () => {
  const status = getBackendStatus();
  return status.mode === 'supabase' && status.ready;
};
