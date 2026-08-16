import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  FileCheck2,
  Info,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react';
import { Badge, Button, PageHeader } from '../components/ui';
import type { LayoutOutletContext } from '../components/Layout';
import { cardBase, inputBase, pageShell } from '../components/uiTokens';
import { isNotificationReadByUser } from '../lib/access';
import {
  groupNotifications,
  mergeNotificationPages,
  NOTIFICATION_CATEGORIES,
  notificationCategoryLabels,
  sectionNotificationGroups,
  type NotificationGroup,
} from '../lib/notificationCenter';
import { loadNotificationFeedPage } from '../lib/notificationFeed';
import { notificationRouteToPath } from '../lib/security';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import type { AppNotification, NotificationCategory, NotificationCursor } from '../types';

type NotificationTab = 'all' | 'unread';

const categoryIcon = (category: NotificationCategory) => {
  switch (category) {
    case 'assignment': return UserRoundPlus;
    case 'deadline': return Clock3;
    case 'review': return FileCheck2;
    case 'feedback': return MessageSquareText;
    case 'account': return ShieldCheck;
    case 'status': return Info;
    default: return Bell;
  }
};

const categoryTone: Record<NotificationCategory, string> = {
  assignment: 'bg-blue-50 text-blue-700',
  deadline: 'bg-amber-50 text-amber-700',
  review: 'bg-violet-50 text-violet-700',
  feedback: 'bg-cyan-50 text-cyan-700',
  account: 'bg-slate-100 text-slate-700',
  status: 'bg-emerald-50 text-emerald-700',
  system: 'bg-slate-100 text-slate-600',
};

const updateReadState = (
  notifications: AppNotification[],
  ids: string[],
  userId: string,
  isRead: boolean,
) => {
  const selected = new Set(ids);
  return notifications.map(notification => {
    if (!selected.has(notification.id)) return notification;
    const current = notification.readByUserIds || [];
    return {
      ...notification,
      isRead: isRead ? notification.isRead : false,
      readByUserIds: isRead
        ? Array.from(new Set([...current, userId]))
        : current.filter(id => id !== userId),
    };
  });
};

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { notificationReadActions } = useOutletContext<LayoutOutletContext>();
  const currentUser = useStore(state => state.currentUser);
  const previewNotifications = useStore(state => state.notifications);
  const notificationUnreadCount = useStore(state => state.notificationUnreadCount);
  const workspaceVersion = useStore(state => state.backend.workspaceVersion);
  const [tab, setTab] = React.useState<NotificationTab>('all');
  const [category, setCategory] = React.useState<NotificationCategory | ''>('');
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = React.useState<NotificationCursor>();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [error, setError] = React.useState('');
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const [refreshToken, setRefreshToken] = React.useState(0);
  const queryKeyRef = React.useRef('');

  const queryKey = `${currentUser?.id || ''}:${tab}:${category}:${search}`;

  React.useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const queryChanged = queryKeyRef.current !== queryKey;
    queryKeyRef.current = queryKey;
    if (queryChanged) {
      setItems([]);
      setNextCursor(undefined);
      setExpandedGroups(new Set());
    }
    setIsLoading(queryChanged || items.length === 0);
    setError('');

    void loadNotificationFeedPage(currentUser, previewNotifications, {
      limit: 50,
      unreadOnly: tab === 'unread',
      category: category || undefined,
      search,
    }).then(page => {
      if (cancelled) return;
      const resetList = queryChanged || tab === 'unread';
      setItems(current => resetList
        ? page.items
        : mergeNotificationPages(current, page.items));
      setNextCursor(current => resetList || !current ? page.nextCursor : current);
      useStore.setState({ notificationUnreadCount: page.unreadCount });
    }).catch(loadError => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.');
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  // Keep loaded history while polling refreshes the first page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, queryKey, workspaceVersion, previewNotifications.length, refreshToken]);

  if (!currentUser) return null;

  const groups = groupNotifications(items, currentUser);
  const sections = sectionNotificationGroups(groups);
  const displayedUnreadCount = notificationUnreadCount;

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError('');
    try {
      const page = await loadNotificationFeedPage(currentUser, previewNotifications, {
        limit: 50,
        cursor: nextCursor,
        unreadOnly: tab === 'unread',
        category: category || undefined,
        search,
      });
      setItems(current => mergeNotificationPages(current, page.items));
      setNextCursor(page.nextCursor);
      useStore.setState({ notificationUnreadCount: page.unreadCount });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load more notifications.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const applyRead = async (ids: string[], isRead: boolean) => {
    const saved = isRead
      ? await notificationReadActions.markRead(ids)
      : await notificationReadActions.markUnread(ids);
    if (saved) {
      setItems(current => {
        const updated = updateReadState(current, ids, currentUser.id, isRead);
        return tab === 'unread' && isRead
          ? updated.filter(notification => !ids.includes(notification.id))
          : updated;
      });
    }
    return saved;
  };

  const markAllRead = async () => {
    const saved = await notificationReadActions.markAllRead();
    if (!saved) return;
    setItems(current => tab === 'unread'
      ? []
      : updateReadState(current, current.map(item => item.id), currentUser.id, true));
  };

  const viewGroup = (group: NotificationGroup) => {
    const unreadIds = group.notifications
      .filter(notification => !isNotificationReadByUser(currentUser, notification))
      .map(notification => notification.id);
    if (unreadIds.length > 0) void applyRead(unreadIds, true);
    navigate(notificationRouteToPath(group.latest.route));
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(current => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title="Notifications"
        description="Review assignments, deadlines, feedback, approvals, and workspace updates."
        action={displayedUnreadCount > 0 ? (
          <Button
            variant="secondary"
            onClick={() => void markAllRead()}
            disabled={notificationReadActions.isUpdating}
          >
            <CheckCheck className="h-4 w-4" />
            {notificationReadActions.isUpdating ? 'Saving...' : 'Mark all read'}
          </Button>
        ) : undefined}
      />

      <section className={cn(cardBase, 'overflow-hidden')} aria-label="Notification center">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="inline-flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto" aria-label="Notification view">
              {(['all', 'unread'] as NotificationTab[]).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    'min-h-9 flex-1 rounded-md px-4 text-sm font-semibold capitalize transition-colors sm:flex-none',
                    tab === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                  aria-pressed={tab === value}
                >
                  {value}{value === 'unread' && displayedUnreadCount > 0 ? ` (${displayedUnreadCount})` : ''}
                </button>
              ))}
            </div>

            <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                className={cn(inputBase, 'py-2.5 pl-9 pr-20')}
                placeholder="Search notifications..."
                aria-label="Search notifications"
              />
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                Search
              </button>
            </form>

            <select
              value={category}
              onChange={event => setCategory(event.target.value as NotificationCategory | '')}
              className={cn(inputBase, 'min-h-10 py-2.5 lg:w-48')}
              aria-label="Filter notification category"
            >
              <option value="">All categories</option>
              {NOTIFICATION_CATEGORIES.map(value => (
                <option key={value} value={value}>{notificationCategoryLabels[value]}</option>
              ))}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="sr-only">
          {isLoading ? 'Loading notifications.' : `${groups.length} notification groups loaded.`}
        </div>

        {error && (
          <div className="m-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Notifications could not be refreshed</p>
              <p className="mt-0.5 text-sm">{error}</p>
            </div>
            <button type="button" onClick={() => setRefreshToken(value => value + 1)} className="rounded-md p-1.5 hover:bg-red-100" aria-label="Retry loading notifications">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        )}

        {isLoading && items.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-medium text-slate-500" role="status">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading notifications...
          </div>
        ) : groups.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Bell className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">{tab === 'unread' ? 'No unread notifications' : 'No notifications found'}</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
              {tab === 'unread'
                ? 'You are all caught up. New assignments, deadlines, and reviews will appear here.'
                : 'Try another category or search, or switch back to All.'}
            </p>
          </div>
        ) : (
          <div>
            {(['Today', 'Yesterday', 'Earlier'] as const).map(section => (
              sections[section].length > 0 && (
                <section key={section} aria-labelledby={`notification-section-${section.toLowerCase()}`}>
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-5">
                    <h2 id={`notification-section-${section.toLowerCase()}`} className="text-xs font-semibold uppercase text-slate-500">{section}</h2>
                  </div>
                  {sections[section].map(group => {
                    const Icon = categoryIcon(group.category);
                    const expanded = expandedGroups.has(group.id);
                    const groupIds = group.notifications.map(notification => notification.id);
                    const allRead = group.unreadCount === 0;
                    return (
                      <article key={`${group.id}:${group.latest.id}`} className={cn('relative border-b border-slate-100 last:border-b-0', !allRead && 'bg-blue-50/30')}>
                        {!allRead && <span className="absolute inset-y-0 left-0 w-1 bg-blue-600" />}
                        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start">
                          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', categoryTone[group.category])}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className={cn('text-sm text-slate-950', allRead ? 'font-medium' : 'font-semibold')}>{group.latest.title}</h3>
                              <Badge tone="slate">{notificationCategoryLabels[group.category]}</Badge>
                              {group.notifications.length > 1 && <Badge tone="blue">{group.notifications.length} updates</Badge>}
                              {group.unreadCount > 0 && <span className="text-xs font-semibold text-blue-700">{group.unreadCount} unread</span>}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{group.latest.message}</p>
                            <p className="mt-1.5 text-xs text-slate-400">{formatDistanceToNow(new Date(group.latest.createdAt), { addSuffix: true })}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                            {group.notifications.length > 1 && (
                              <button type="button" onClick={() => toggleGroup(group.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100" aria-expanded={expanded}>
                                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {expanded ? 'Hide updates' : 'Show updates'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void applyRead(groupIds, allRead ? false : true)}
                              disabled={notificationReadActions.isUpdating}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" />
                              {allRead ? 'Mark unread' : 'Mark read'}
                            </button>
                            <button type="button" onClick={() => viewGroup(group)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">
                              <ExternalLink className="h-4 w-4" />
                              View
                            </button>
                          </div>
                        </div>

                        {expanded && group.notifications.length > 1 && (
                          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 sm:pl-[4.75rem] sm:pr-5">
                            {group.notifications.map(notification => {
                              const isRead = isNotificationReadByUser(currentUser, notification);
                              return (
                                <div key={notification.id} className="flex flex-col gap-2 border-b border-slate-200/70 py-3 last:border-b-0 sm:flex-row sm:items-center">
                                  <div className="min-w-0 flex-1">
                                    <p data-i18n-skip className={cn('text-sm text-slate-700', !isRead && 'font-semibold text-slate-950')}>{notification.message}</p>
                                    <p className="mt-1 text-xs text-slate-400">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void applyRead([notification.id], !isRead)}
                                    disabled={notificationReadActions.isUpdating}
                                    className="self-start rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
                                  >
                                    {isRead ? 'Mark unread' : 'Mark read'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              )
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="flex justify-center border-t border-slate-200 p-4">
            <Button variant="secondary" onClick={() => void loadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
};

export default Notifications;
