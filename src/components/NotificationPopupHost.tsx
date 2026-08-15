import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  X,
} from 'lucide-react';
import { AppNotification, User } from '../types';
import { getUnreadNotifications } from '../lib/access';
import { getIncomingUnreadNotificationIds, seedSeenNotificationIds } from '../lib/notificationPopups';
import { notificationRouteToPath } from '../lib/security';
import { cn } from '../lib/utils';
import { NotificationReadActions } from '../hooks/useNotificationReadActions';
import { useAppNoticeState } from '../hooks/useAppNoticeState';

interface NotificationPopupHostProps {
  currentUser: User | null;
  notifications: AppNotification[];
  isReady: boolean;
  readActions: NotificationReadActions;
}

interface NotificationPopupCardProps {
  notification: AppNotification;
  isReadUpdating: boolean;
  onDismiss: (notificationId: string) => void;
  onMarkRead: (notificationId: string) => Promise<boolean>;
  onView: (notification: AppNotification) => void;
}

const popupIcon = (iconType: AppNotification['iconType']) => {
  switch (iconType) {
    case 'task':
      return <FileText className="h-5 w-5 text-blue-600" />;
    case 'success':
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case 'status':
      return <Info className="h-5 w-5 text-amber-600" />;
    default:
      return <AlertCircle className="h-5 w-5 text-red-600" />;
  }
};

const popupIconBackground = (iconType: AppNotification['iconType']) => {
  switch (iconType) {
    case 'success':
      return 'bg-emerald-50';
    case 'status':
      return 'bg-amber-50';
    case 'alert':
      return 'bg-red-50';
    default:
      return 'bg-blue-50';
  }
};

const NotificationPopupCard: React.FC<NotificationPopupCardProps> = ({
  notification,
  isReadUpdating,
  onDismiss,
  onMarkRead,
  onView,
}) => {
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(notification.id), 8000);
    return () => window.clearTimeout(timeout);
  }, [notification.id, onDismiss]);

  const handleMarkRead = async () => {
    if (isMarkingRead || isReadUpdating) return;
    setIsMarkingRead(true);
    const saved = await onMarkRead(notification.id);
    if (!saved) setIsMarkingRead(false);
  };

  return (
    <article
      aria-label={`New notification: ${notification.title}`}
      className="pointer-events-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] "
    >
      <div className="flex items-start gap-3 p-4">
        <div className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          popupIconBackground(notification.iconType),
        )}>
          {popupIcon(notification.iconType)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{notification.title}</p>
              <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-600">{notification.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(notification.id)}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Dismiss notification: ${notification.title}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <button
          type="button"
          onClick={() => void handleMarkRead()}
          disabled={isMarkingRead || isReadUpdating}
          aria-busy={isMarkingRead || isReadUpdating}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-950 disabled:cursor-wait disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" />
          {isMarkingRead || isReadUpdating ? 'Saving...' : 'Mark as read'}
        </button>
        <button
          type="button"
          onClick={() => onView(notification)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View
        </button>
      </div>
    </article>
  );
};

export const NotificationPopupHost: React.FC<NotificationPopupHostProps> = ({
  currentUser,
  notifications,
  isReady,
  readActions,
}) => {
  const navigate = useNavigate();
  const { hasBottomNotice } = useAppNoticeState();
  const tracker = useRef<{ userId?: string; initialized: boolean; seenIds: Set<string> }>({
    initialized: false,
    seenIds: new Set(),
  });
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [readyUserId, setReadyUserId] = useState<string>();

  const MAX_QUEUED_IDS = 12;

  const unreadNotifications = useMemo(
    () => getUnreadNotifications(currentUser, notifications),
    [currentUser, notifications],
  );
  const unreadIds = useMemo(
    () => new Set(unreadNotifications.map(notification => notification.id)),
    [unreadNotifications],
  );
  const notificationsById = useMemo(
    () => new Map(notifications.map(notification => [notification.id, notification])),
    [notifications],
  );

  useEffect(() => {
    if (!currentUser || !isReady) return;

    if (tracker.current.userId !== currentUser.id) {
      tracker.current = {
        userId: currentUser.id,
        initialized: false,
        seenIds: new Set(),
      };
      setQueuedIds([]);
      setReadyUserId(undefined);
    }

    if (!tracker.current.initialized) {
      tracker.current.seenIds = seedSeenNotificationIds(currentUser, notifications);
      tracker.current.initialized = true;
      setReadyUserId(currentUser.id);
      return;
    }

    const incoming = getIncomingUnreadNotificationIds(
      currentUser,
      notifications,
      tracker.current.seenIds,
    );
    tracker.current.seenIds = incoming.seenIds;

    if (incoming.incomingIds.length === 0) return;
    setQueuedIds(current => Array.from(new Set([...current, ...incoming.incomingIds])).slice(-MAX_QUEUED_IDS));
  }, [currentUser, isReady, notifications]);

  useEffect(() => {
    setQueuedIds(current => current.filter(notificationId => unreadIds.has(notificationId)));
  }, [unreadIds]);

  const dismiss = React.useCallback((notificationId: string) => {
    setQueuedIds(current => current.filter(id => id !== notificationId));
  }, []);

  const viewNotification = React.useCallback((notification: AppNotification) => {
    dismiss(notification.id);
    void readActions.markRead(notification.id);
    navigate(notificationRouteToPath(notification.route));
  }, [dismiss, navigate, readActions]);

  const visibleNotifications = queuedIds
    .slice(0, 3)
    .map(notificationId => notificationsById.get(notificationId))
    .filter((notification): notification is AppNotification => Boolean(notification));

  return (
    <aside
      aria-label="New notifications"
      aria-live="polite"
      aria-atomic="false"
      data-popup-ready={readyUserId === currentUser?.id ? 'true' : 'false'}
      className={cn(
        'pointer-events-none fixed left-4 right-4 z-[65] flex flex-col gap-2.5 md:bottom-5 md:left-[17.25rem] md:right-auto md:w-[360px]',
        hasBottomNotice
          ? 'bottom-[calc(13rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(5rem+env(safe-area-inset-bottom))]',
      )}
    >
      {visibleNotifications.map(notification => (
        <NotificationPopupCard
          key={notification.id}
          notification={notification}
          isReadUpdating={readActions.isUpdating}
          onDismiss={dismiss}
          onMarkRead={readActions.markRead}
          onView={viewNotification}
        />
      ))}
    </aside>
  );
};
