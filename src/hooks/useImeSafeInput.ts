import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CompositionEvent, type FocusEvent } from 'react';

type InputElement = HTMLInputElement | HTMLTextAreaElement;
type InputProps = {
  value: string;
  onChange: (event: ChangeEvent<InputElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (event: CompositionEvent<InputElement>) => void;
  onBlur: (event: FocusEvent<InputElement>) => void;
};

type ImeSafeInputHandlers = {
  inputProps: InputProps;
  value: string;
  commit: (value: string) => void;
};

type ImeSafeInputOptions = {
  commitDelayMs?: number;
};

/**
 * Keeps IME composition local until the browser commits it.
 *
 * Updating router/search state for every composition event can replace the
 * controlled value while a Chinese or Japanese IME is composing, which may
 * duplicate the temporary Latin text (for example, `h` becoming `hhh`).
 */
export const useImeSafeInput = (
  value: string,
  onCommit: (value: string) => void,
  { commitDelayMs = 0 }: ImeSafeInputOptions = {},
): ImeSafeInputHandlers => {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);
  const lastCommittedRef = useRef(value);
  const pendingCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const clearPendingCommit = useCallback(() => {
    if (pendingCommitRef.current === null) return;
    clearTimeout(pendingCommitRef.current);
    pendingCommitRef.current = null;
  }, []);

  useEffect(() => clearPendingCommit, [clearPendingCommit]);

  useEffect(() => {
    if (composingRef.current) return;
    clearPendingCommit();
    setDraft(value);
    lastCommittedRef.current = value;
  }, [clearPendingCommit, value]);

  const commitNow = useCallback((nextValue: string) => {
    clearPendingCommit();
    if (nextValue === lastCommittedRef.current) return;
    lastCommittedRef.current = nextValue;
    onCommitRef.current(nextValue);
  }, [clearPendingCommit]);

  const scheduleCommit = useCallback((nextValue: string) => {
    clearPendingCommit();
    if (nextValue === lastCommittedRef.current) return;
    if (commitDelayMs <= 0) {
      commitNow(nextValue);
      return;
    }
    pendingCommitRef.current = setTimeout(() => {
      pendingCommitRef.current = null;
      commitNow(nextValue);
    }, commitDelayMs);
  }, [clearPendingCommit, commitDelayMs, commitNow]);

  const commit = useCallback((nextValue: string) => {
    setDraft(nextValue);
    commitNow(nextValue);
  }, [commitNow]);

  const onChange = useCallback((event: ChangeEvent<InputElement>) => {
    const nextValue = event.currentTarget.value;
    setDraft(nextValue);
    const nativeEvent = event.nativeEvent as Event & { isComposing?: boolean };
    if (!composingRef.current && !nativeEvent.isComposing) {
      scheduleCommit(nextValue);
    }
  }, [scheduleCommit]);

  const onCompositionStart = useCallback(() => {
    clearPendingCommit();
    composingRef.current = true;
  }, [clearPendingCommit]);

  const onCompositionEnd = useCallback((event: CompositionEvent<InputElement>) => {
    composingRef.current = false;
    commit(event.currentTarget.value);
  }, [commit]);

  const onBlur = useCallback((event: FocusEvent<InputElement>) => {
    if (!composingRef.current) commit(event.currentTarget.value);
  }, [commit]);

  return {
    inputProps: {
      value: draft,
      onChange,
      onCompositionStart,
      onCompositionEnd,
      onBlur,
    },
    value: draft,
    commit,
  };
};
