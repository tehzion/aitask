import { useCallback, useId, useLayoutEffect } from 'react';
import { setUnsavedSource } from '../forms/unsavedChanges';
export const useUnsavedChanges = (dirty: boolean, blockNavigation = false) => {
  const id = useId();
  useLayoutEffect(() => {
    setUnsavedSource(id, dirty, blockNavigation);
    return () => setUnsavedSource(id, false);
  }, [dirty, blockNavigation, id]);
  return useCallback(() => setUnsavedSource(id, false), [id]);
};
