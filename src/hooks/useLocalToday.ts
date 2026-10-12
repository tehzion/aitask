import { useEffect, useState } from 'react';
import { startOfDay } from 'date-fns';

/** Stable local-day value for date-dependent metrics, including suspended tabs. */
export const useLocalToday = () => {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      const day = startOfDay(now);
      setToday(current => current.getTime() === day.getTime() ? current : day);
      clearTimeout(timer);
      // Calendar arithmetic keeps this correct on 23- and 25-hour DST days.
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 25);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
};
