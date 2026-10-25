import { useEffect, useRef } from 'react';
import { type AppNotification, type User } from '../../../shared/types/index';
import { notificationIconType } from '../services/notificationCenter';
import { getIncomingUnreadNotificationIds, seedSeenNotificationIds } from '../services/notificationPopups';
import { playNotificationSound, resumeAudio } from '../services/sounds';


/**
 * Watches the notifications list and plays a sound whenever a new
 * unread action notification arrives that is visible to the current user.
 *
 * Must be mounted after the user has interacted with the page at
 * least once (browser autoplay policy).
 */
export const useSoundNotifications = (
  notifications: AppNotification[],
  currentUser: User | null
) => {
  const tracker = useRef<{ userId?: string; seenIds: Set<string> }>({ seenIds: new Set() });

  // Resume AudioContext on any user interaction
  useEffect(() => {
    const handler = () => { resumeAudio(); };
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) { tracker.current = { seenIds: new Set() }; return; }
    if (tracker.current.userId !== currentUser.id) {
      tracker.current = { userId: currentUser.id, seenIds: seedSeenNotificationIds(currentUser, notifications) };
      return;
    }
    const incoming = getIncomingUnreadNotificationIds(currentUser, notifications, tracker.current.seenIds);
    tracker.current.seenIds = incoming.seenIds;
    const latest = notifications.find(notification => notification.id === incoming.incomingIds[0]);
    if (latest) playNotificationSound(notificationIconType(latest));
  }, [notifications, currentUser]);
};
