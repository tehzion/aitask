import { useEffect, useState } from 'react';
import { isPwaUpdateReady, PWA_UPDATE_READY_EVENT } from '../lib/pwaUpdates';

export const useAppNoticeState = () => {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));
  const [isUpdateReady, setIsUpdateReady] = useState(isPwaUpdateReady);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleUpdateReady = () => setIsUpdateReady(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(PWA_UPDATE_READY_EVENT, handleUpdateReady);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(PWA_UPDATE_READY_EVENT, handleUpdateReady);
    };
  }, []);

  return {
    isOnline,
    isUpdateReady,
    hasBottomNotice: !isOnline || (isOnline && isUpdateReady),
  };
};
