import { AppNotification, CustomRole, Project, Registration, Task, User } from '../types';
import { getSupabaseConfig, shouldUseSupabase } from './backend';

export interface PersistedWorkspaceState {
  users: User[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  registrations: Registration[];
  rolePermissions?: CustomRole[];
}

export interface SnapshotResult {
  state: PersistedWorkspaceState;
  source: 'local' | 'supabase';
  message: string;
}

interface SupabaseSnapshotRow {
  id: string;
  state: PersistedWorkspaceState;
  updated_at?: string;
}

const headers = () => {
  const config = getSupabaseConfig();
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
  };
};

const snapshotUrl = (query = '') => {
  const config = getSupabaseConfig();
  const suffix = query ? `?${query}` : '';
  return `${config.url}/rest/v1/${config.table}${suffix}`;
};

export const loadSupabaseSnapshot = async (
  fallback: PersistedWorkspaceState
): Promise<SnapshotResult> => {
  if (!shouldUseSupabase()) {
    return { state: fallback, source: 'local', message: 'Supabase is not configured.' };
  }

  const config = getSupabaseConfig();
  const response = await fetch(
    snapshotUrl(`id=eq.${encodeURIComponent(config.stateId)}&select=state`),
    { headers: headers() }
  );

  if (!response.ok) {
    throw new Error(`Supabase load failed: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as Pick<SupabaseSnapshotRow, 'state'>[];
  if (rows[0]?.state) {
    return {
      state: rows[0].state,
      source: 'supabase',
      message: 'Loaded workspace state from Supabase.',
    };
  }

  await saveSupabaseSnapshot(fallback);
  return {
    state: fallback,
    source: 'local',
    message: 'Created a new Supabase snapshot from local demo data.',
  };
};

export const saveSupabaseSnapshot = async (state: PersistedWorkspaceState) => {
  if (!shouldUseSupabase()) return;

  const config = getSupabaseConfig();
  const response = await fetch(
    snapshotUrl(`on_conflict=id`),
    {
      method: 'POST',
      headers: {
        ...headers(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: config.stateId,
        state,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase save failed: ${response.status} ${response.statusText}`);
  }
};
