import { useEffect, useState } from 'react';
import { getBillingToday } from '../lib/monthlyRecords';
import { parseOptionalDate } from '../lib/utils';

export const useBillingToday = () => {
  const [day, setDay] = useState(getBillingToday);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const today = getBillingToday(); setDay(today); clearTimeout(timer);
      timer = setTimeout(refresh, Date.parse(`${today}T00:00:00+08:00`) + 86_400_000 - Date.now() + 50);
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh(); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return parseOptionalDate(day)!;
};
