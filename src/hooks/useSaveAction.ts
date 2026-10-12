import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';

type Result = { ok: boolean; error?: string };
type Failure = { ok: false; error: string; code?: undefined };

// Own busy state and completion for one editor/account. Old responses cannot
// settle a new operation, and transport exceptions use the normal error path.
export const useSaveAction = (context?: string) => {
  const actorId = useStore(state => state.currentUser?.id);
  const [busy, setBusy] = useState(false);
  const owner = useRef<object | null>(null);
  const identity = useRef({ actorId, context });
  identity.current = { actorId, context };
  useEffect(() => {
    owner.current = null;
    setBusy(false);
    return () => { owner.current = null; };
  }, [actorId, context]);

  const run = async <T extends Result>(operation: (isCurrent: () => boolean) => Promise<T>, settle?: (result: T | Failure) => void): Promise<T | Failure | null> => {
    if (owner.current) return null;
    const token = {};
    const session = captureWorkspaceSession();
    const started = identity.current;
    const isCurrent = () => owner.current === token && isWorkspaceSessionCurrent(session)
      && identity.current.actorId === started.actorId && identity.current.context === started.context
      && useStore.getState().currentUser?.id === started.actorId;
    owner.current = token;
    setBusy(true);
    try {
      const result = await operation(isCurrent);
      if (!isCurrent()) return null;
      settle?.(result);
      return result;
    } catch (error) {
      if (!isCurrent()) return null;
      const result: Failure = { ok: false, error: error instanceof Error ? error.message : 'The change is waiting to be saved.' };
      settle?.(result);
      return result;
    } finally {
      if (owner.current === token) { owner.current = null; setBusy(false); }
    }
  };
  return { busy, run };
};
