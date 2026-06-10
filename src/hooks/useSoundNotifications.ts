import { useEffect, useRef } from 'react';
import { AppNotification } from '../types';
import { isNotificationVisible } from '../lib/access';
import { playNotificationSound, resumeAudio } from '../lib/sounds';
import { User } from '../types';

/**
 * Watches the notifications list and plays a sound whenever a new
 * unread notification arrives that is visible to the current user.
 *
 * Must be mounted after the user has interacted with the page at
 * least once (browser autoplay policy).
 */
export const useSoundNotifications = (
  notifications: AppNotification[],
  currentUser: User | null
) => {
  // Track seen notification IDs so we only play for genuinely new ones
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  // Seed seenIds on first render so existing notifications don't trigger sound
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      notifications.forEach(n => seenIds.current.add(n.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!initialized.current || !currentUser) return;

    for (const notif of notifications) {
      if (seenIds.current.has(notif.id)) continue;

      seenIds.current.add(notif.id);

      // Only play if this notification is visible to the current user
      if (isNotificationVisible(currentUser, notif)) {
        playNotificationSound(notif.iconType);
        break; // Play one sound per batch, avoid stacking
      }
    }
  }, [notifications, currentUser]);
};
