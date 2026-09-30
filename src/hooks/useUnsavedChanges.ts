import { useLayoutEffect, useId, useCallback } from 'react';
import { setUnsavedSource } from '../lib/unsavedChanges';
export const useUnsavedChanges = (dirty: boolean) => {
  const id = useId();
  useLayoutEffect(() => {
    setUnsavedSource(id, dirty);
    return () => setUnsavedSource(id, false);
  }, [dirty, id]);
  return useCallback(() => setUnsavedSource(id, false), [id]);
};
