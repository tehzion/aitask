import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { readRecoveredDraft, removeRecoveredDraft, writeRecoveredDraft } from '../lib/draftRecovery';

// Only explicitly supplied fields are persisted; never pass passwords, auth
// tokens, file blobs, or a complete workspace into this hook.
export function useRecoverableForm<T>(form: string, value: T, dirty: boolean, enabled = true) {
  const account = useStore(state => state.currentUser?.authUserId || state.currentUser?.id || '');
  const baseline = useRef(value);
  const currentValue = useRef(value); currentValue.current = value;
  const [available, setAvailable] = useState(() => account && enabled ? readRecoveredDraft<T>(account, form) : null);
  const [storageFailed, setStorageFailed] = useState(false);
  const previousKey = useRef(`${account}:${form}`);
  const previouslyEnabled = useRef(enabled);
  const serialized = JSON.stringify(value);
  const lastValue = useRef(serialized);
  const clearedValue = useRef<string | null>(null);
  useEffect(() => {
    const key = `${account}:${form}`;
    if (key !== previousKey.current || (enabled && !previouslyEnabled.current)) {
      previousKey.current = key; baseline.current = currentValue.current;
      setAvailable(account && enabled ? readRecoveredDraft<T>(account, form) : null);
      clearedValue.current = null; setStorageFailed(false);
    }
    previouslyEnabled.current = enabled;
    lastValue.current = serialized;
    if (enabled && dirty && account && clearedValue.current !== serialized) {
      const actor = useStore.getState().currentUser;
      if ((actor?.authUserId || actor?.id) === account) setStorageFailed(!writeRecoveredDraft(account, form, baseline.current, currentValue.current));
    }
  }, [account, form, serialized, dirty, enabled]);
  const clear = () => { clearedValue.current = lastValue.current; removeRecoveredDraft(account, form, available?.storageKey); setAvailable(null); setStorageFailed(false); };
  const restore = () => {
    const draft = available?.value;
    setAvailable(null);
    return draft;
  };
  return { available: Boolean(available), draft: available?.value, storageFailed, clear, restore };
}
