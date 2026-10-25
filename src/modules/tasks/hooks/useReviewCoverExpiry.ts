import { useEffect, useState } from 'react';

/** Recompute review controls at expiry and after a suspended tab resumes. */
export const useReviewCoverExpiry = (expiresAt?: string) => {
  const [epoch, refresh] = useState(0);
  useEffect(() => {
    const remaining = Date.parse(expiresAt || '') - Date.now();
    const update = () => refresh(value => value + 1);
    const timer = remaining > 0 ? setTimeout(update, Math.min(remaining + 25, 2147483647)) : undefined;
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [expiresAt, epoch]);
};
