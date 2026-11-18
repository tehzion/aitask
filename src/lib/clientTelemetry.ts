import type { Role } from '../types';
import type { MutationErrorCode } from './secureWorkspace';
import { shouldUseSecureSupabase, supabase } from './supabaseClient';

type Actor = { id: string; role: Role };
type Event =
  | { type: 'banner_shown'; banner: 'conflict' | 'retry' | 'offline' | 'auth' | 'upgrade' | 'connection' | 'remote_update' }
  | { type: 'save_failure'; code: MutationErrorCode; entityTypes?: string[] }
  | { type: 'recovery_duration'; durationMs: number }
  | { type: 'chunk_load_failure' };

let actorForChunk: Actor | null = null;
export const setClientTelemetryActor = (actor: Actor | null) => { actorForChunk = actor; };
export const recordChunkLoadFailure = () => { if (actorForChunk) void recordClientEvent(actorForChunk, { type: 'chunk_load_failure' }); };

/** Best-effort, explicitly enabled, and never includes error text or workspace data (entity type names only). */
export const recordClientEvent = async (actor: Actor, event: Event): Promise<void> => {
  if (import.meta.env.VITE_AITASK_CLIENT_TELEMETRY !== 'true' || !shouldUseSecureSupabase() || !actor.id) return;
  const bannerTypes = ['conflict', 'retry', 'offline', 'auth', 'upgrade', 'connection', 'remote_update'];
  const errorCodes = ['OFFLINE', 'CONFLICT', 'FORBIDDEN', 'VALIDATION', 'NOT_FOUND', 'RETRY_REQUIRED', 'AUTH_REQUIRED'];
  if (event.type === 'banner_shown' && !bannerTypes.includes(event.banner)) return;
  if (event.type === 'save_failure' && !errorCodes.includes(event.code)) return;
  if (event.type === 'recovery_duration' && !Number.isFinite(event.durationMs)) return;
  if (!['banner_shown', 'save_failure', 'recovery_duration', 'chunk_load_failure'].includes(event.type)) return;
  // Entity type names only (lowercase identifiers); never ids, names or data.
  const types = event.type === 'save_failure'
    ? (event.entityTypes || []).filter(type => /^[a-z_]{1,40}$/.test(type)).slice(0, 12).join(',')
    : '';
  const detail = event.type === 'banner_shown' ? event.banner : event.type === 'save_failure' ? (types ? `${event.code}:${types}` : event.code) : null;
  const duration = event.type === 'recovery_duration' ? Math.min(86_400_000, Math.max(0, Math.round(event.durationMs))) : null;
  try {
    await supabase.from('aitask_client_events').insert({ member_id: actor.id, role: actor.role, event_type: event.type, detail, duration_ms: duration });
  } catch {
    // Telemetry must never affect a save or its recovery.
  }
};
