import { AppNotification, ClientProfile, CustomRole, Project, Registration, Task, User } from '../types';
import { getSupabaseConfig, shouldUseSupabase } from './backend';

export interface PersistedWorkspaceState {
  users: User[];
  clients?: ClientProfile[];
  projects: Project[];
  tasks: Task[];
  notifications: AppNotification[];
  registrations: Registration[];
  rolePermissions?: CustomRole[];
  taskStatuses?: string[];
  deletedUserIds?: string[];
  deletedRoleIds?: string[];
  deletedTaskStatuses?: string[];
  deletedClientIds?: string[];
}

export interface SnapshotResult {
  state: PersistedWorkspaceState;
  source: 'local' | 'supabase';
  message: string;
  version: number;
  updatedAt?: string;
}

export interface SaveSnapshotResult {
  saved: boolean;
  conflict: boolean;
  message: string;
  version?: number;
  updatedAt?: string;
  latest?: SnapshotResult;
}

interface SupabaseSnapshotRow {
  id: string;
  state: PersistedWorkspaceState;
  version?: number | string;
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

const snapshotSelect = 'state,updated_at,version';

const parseSnapshotRow = (
  row: Pick<SupabaseSnapshotRow, 'state' | 'updated_at' | 'version'> | undefined,
  message: string,
  source: SnapshotResult['source'] = 'supabase'
): SnapshotResult | null => {
  if (!row?.state) return null;

  return {
    state: row.state,
    source,
    message,
    version: Number(row.version || 1),
    updatedAt: row.updated_at,
  };
};

const readJsonRows = async <T>(response: Response): Promise<T[]> => {
  try {
    return await response.json() as T[];
  } catch {
    return [];
  }
};

export const fetchSupabaseSnapshot = async (): Promise<SnapshotResult | null> => {
  if (!shouldUseSupabase()) return null;

  const config = getSupabaseConfig();
  const response = await fetch(
    snapshotUrl(`id=eq.${encodeURIComponent(config.stateId)}&select=${snapshotSelect}`),
    { headers: headers() }
  );

  if (!response.ok) {
    throw new Error(`Supabase load failed: ${response.status} ${response.statusText}`);
  }

  const rows = await readJsonRows<Pick<SupabaseSnapshotRow, 'state' | 'updated_at' | 'version'>>(response);
  return parseSnapshotRow(rows[0], 'Loaded workspace state from Supabase.');
};

const createSupabaseSnapshot = async (state: PersistedWorkspaceState): Promise<SnapshotResult> => {
  const config = getSupabaseConfig();
  const updatedAt = new Date().toISOString();
  const response = await fetch(
    snapshotUrl(`select=${snapshotSelect}`),
    {
      method: 'POST',
      headers: {
        ...headers(),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id: config.stateId,
        state,
        version: 1,
        updated_at: updatedAt,
      }),
    }
  );

  if (response.status === 409) {
    const latest = await fetchSupabaseSnapshot();
    if (latest) return latest;
  }

  if (!response.ok) {
    throw new Error(`Supabase create failed: ${response.status} ${response.statusText}`);
  }

  const rows = await readJsonRows<Pick<SupabaseSnapshotRow, 'state' | 'updated_at' | 'version'>>(response);
  return parseSnapshotRow(rows[0], 'Created a new Supabase snapshot from the current workspace.', 'local') || {
    state,
    source: 'local',
    message: 'Created a new Supabase snapshot from the current workspace.',
    version: 1,
    updatedAt,
  };
};

export const loadSupabaseSnapshot = async (
  fallback: PersistedWorkspaceState
): Promise<SnapshotResult> => {
  if (!shouldUseSupabase()) {
    return {
      state: fallback,
      source: 'local',
      message: 'Supabase is not configured.',
      version: 0,
    };
  }

  const existing = await fetchSupabaseSnapshot();
  return existing || createSupabaseSnapshot(fallback);
};

export const saveSupabaseSnapshot = async (
  state: PersistedWorkspaceState,
  expectedVersion = 1
): Promise<SaveSnapshotResult> => {
  if (!shouldUseSupabase()) {
    return {
      saved: true,
      conflict: false,
      message: 'Supabase is not configured.',
      version: 0,
    };
  }

  const config = getSupabaseConfig();
  const updatedAt = new Date().toISOString();
  const response = await fetch(
    snapshotUrl(`id=eq.${encodeURIComponent(config.stateId)}&version=eq.${expectedVersion}&select=${snapshotSelect}`),
    {
      method: 'PATCH',
      headers: {
        ...headers(),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        state,
        version: expectedVersion + 1,
        updated_at: updatedAt,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase save failed: ${response.status} ${response.statusText}`);
  }

  const rows = await readJsonRows<Pick<SupabaseSnapshotRow, 'state' | 'updated_at' | 'version'>>(response);
  const saved = parseSnapshotRow(rows[0], 'Workspace state synced to Supabase.');
  if (saved) {
    return {
      saved: true,
      conflict: false,
      message: saved.message,
      version: saved.version,
      updatedAt: saved.updatedAt,
    };
  }

  const latest = await fetchSupabaseSnapshot();
  return {
    saved: false,
    conflict: true,
    message: 'A newer workspace update is available. Refresh before saving.',
    version: latest?.version,
    updatedAt: latest?.updatedAt,
    latest: latest || undefined,
  };
};
