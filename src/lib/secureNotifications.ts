import type { AppNotification, NotificationFeedPage } from '../types';
import type { MutationResult, NotificationFeedQuery, NotificationReadResponse, SecureNotificationRuntime } from './secureWorkspace';
import { parseNotification } from './security';
import { enrichNotificationMetadata } from './notificationCenter';

export const createSecureNotifications = (runtime: SecureNotificationRuntime) => {
  const { captureWorkspaceSession, isWorkspaceSessionCurrent, isRecord, cleanPortalText, bindSessionRequest, withSyncTimeout, supabase, SECURE_WORKSPACE_ID, isAuthError, refreshSecureSession, entityKey, stable, commandId, SyncRequestTimeoutError } = runtime;

  const parseNotificationFeedItem = (
    value: unknown,
    memberId: string,
  ): AppNotification | null => {
    if (!isRecord(value)) return null;
    const parsed = parseNotification({
      ...value,
      isRead: value.isRead === true,
      readByUserIds: value.isRead === true ? [memberId] : [],
      visibleToCurrentUser: true,
    });
    return parsed ? enrichNotificationMetadata(parsed) : null;
  };

  const loadSecureNotificationPage = async (
    query: NotificationFeedQuery = {},
  ): Promise<NotificationFeedPage> => {
    const limit = Math.min(50, Math.max(1, Math.floor(query.limit || 50)));
    const invoke = bindSessionRequest(() => withSyncTimeout(supabase.rpc('aitask_read_notifications', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_limit: limit,
      p_before_created_at: query.cursor?.createdAt || null,
      p_before_id: query.cursor?.id || null,
      p_unread_only: Boolean(query.unreadOnly),
      p_category: query.category || null,
      p_search: query.search?.trim().slice(0, 200) || null,
    })));

    let result = await invoke();
    if (isAuthError(result.error) && await refreshSecureSession()) result = await invoke();
    if (result.error) throw result.error;
    if (!isRecord(result.data) || result.data.ok !== true) {
      throw new Error(isRecord(result.data) && typeof result.data.error === 'string'
        ? result.data.error
        : 'Supabase returned an invalid notification feed.');
    }

    const memberId = cleanPortalText(result.data.memberId, 160);
    if (!memberId) throw new Error('The notification feed is not linked to this account.');
    const items = (Array.isArray(result.data.items) ? result.data.items : [])
      .map(item => parseNotificationFeedItem(item, memberId))
      .filter((item): item is AppNotification => Boolean(item));
    const rawCursor = isRecord(result.data.nextCursor) ? result.data.nextCursor : undefined;
    const createdAt = cleanPortalText(rawCursor?.createdAt, 80);
    const cursorId = cleanPortalText(rawCursor?.id, 160);

    return {
      items,
      unreadCount: Math.max(0, Number(result.data.unreadCount) || 0),
      nextCursor: createdAt && cursorId ? { createdAt, id: cursorId } : undefined,
    };
  };

  const applyNotificationReadBaseline = (
    response: NotificationReadResponse,
    isRead: boolean,
  ) => {
    const memberId = response.memberId;
    if (!memberId) return;
    (response.changedNotifications || []).forEach(changed => {
      const key = entityKey('notification', changed.id);
      const previous = runtime.baseline.get(key);
      if (!previous) return;
      const currentReads = Array.isArray(previous.data.readByUserIds)
        ? previous.data.readByUserIds.filter((value): value is string => typeof value === 'string')
        : [];
      const readByUserIds = isRead
        ? Array.from(new Set([...currentReads, memberId]))
        : currentReads.filter(id => id !== memberId);
      const data = { ...previous.data, readByUserIds };
      runtime.baseline.set(key, {
        ...previous,
        version: Math.max(1, Number(changed.version) || previous.version),
        data,
        serialized: stable({ parentId: previous.parentId || null, data }),
      });
    });
  };

  const setSecureNotificationsRead = async (
    notificationIds: string[],
    isRead: boolean,
    markAll = false,
  ): Promise<MutationResult<NotificationReadResponse>> => {
    const sessionToken = captureWorkspaceSession();
    const ids = Array.from(new Set(notificationIds.map(id => id.trim()).filter(Boolean))).sort();
    if (!markAll && ids.length === 0) {
      return { ok: false, code: 'VALIDATION', error: 'Choose at least one notification.' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, code: 'OFFLINE', error: 'You are offline. Reconnect before updating notifications.' };
    }
    const matchesRetry = runtime.retryableNotificationMutation
      && runtime.retryableNotificationMutation.isRead === isRead
      && runtime.retryableNotificationMutation.markAll === markAll
      && stable(runtime.retryableNotificationMutation.notificationIds) === stable(ids);
    if (runtime.retryableNotificationMutation && !matchesRetry) {
      return {
        ok: false,
        code: 'RETRY_REQUIRED',
        error: 'Retry the previous notification update before starting another one.',
      };
    }
    const pending = matchesRetry
      ? runtime.retryableNotificationMutation!
      : { id: commandId(), notificationIds: ids, isRead, markAll };
    runtime.retryableNotificationMutation = pending;

    const invoke = bindSessionRequest(() => withSyncTimeout(supabase.rpc('aitask_set_notifications_read', {
      p_workspace_id: SECURE_WORKSPACE_ID,
      p_command_id: pending.id,
      p_notification_ids: pending.notificationIds,
      p_is_read: pending.isRead,
      p_mark_all: pending.markAll,
    })));

    let result: Awaited<ReturnType<typeof invoke>>;
    try {
      result = await invoke();
      if (isAuthError(result.error) && await refreshSecureSession()) result = await invoke();
    } catch (error) {
      return {
        ok: false,
        code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'RETRY_REQUIRED',
        error: error instanceof SyncRequestTimeoutError
          ? 'Notification update confirmation timed out. Try the same action again safely.'
          : 'Supabase could not confirm the notification update.',
      };
    }

    if (!isWorkspaceSessionCurrent(sessionToken)) return { ok: false, code: 'FORBIDDEN', error: 'Your session changed. Sign in again.' };
    if (result.error) {
      if (isAuthError(result.error)) runtime.retryableNotificationMutation = null;
      return {
        ok: false,
        code: isAuthError(result.error) ? 'FORBIDDEN' : 'RETRY_REQUIRED',
        error: result.error.message || 'Unable to update notifications.',
      };
    }

    const response = result.data as NotificationReadResponse;
    if (!response?.ok) {
      if (response?.code !== 'RETRY_REQUIRED') runtime.retryableNotificationMutation = null;
      return {
        ok: false,
        code: response?.code || 'RETRY_REQUIRED',
        error: response?.error || 'The notification update was rejected.',
      };
    }

    runtime.retryableNotificationMutation = null;
    applyNotificationReadBaseline(response, isRead);
    return {
      ok: true,
      data: response,
      commandId: response.commandId || pending.id,
      workspaceVersion: Number(response.workspaceVersion) || 1,
      replayed: response.replayed,
    };
  };

  return { loadSecureNotificationPage, setSecureNotificationsRead };
};
