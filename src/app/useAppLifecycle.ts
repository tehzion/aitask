import { useEffect, useState } from 'react';
import { useAppNoticeState } from '../hooks/useAppNoticeState';
import { useMonthlyServiceCycles } from '../hooks/useMonthlyServiceCycles';
import { hasBlockingUnsavedChanges, hasUnsavedChanges, configurePendingWork, subscribeUnsavedChanges } from '../lib/unsavedChanges';
import { clearWorkspaceSession, startBackendAutoSync, stopBackendAutoSync, useStore } from '../store';
import { shouldUseSecureSupabase, supabase } from '../lib/supabaseClient';
import { useI18n } from '../components/I18nProvider';

/**
 * Coordinates application-wide side effects without coupling route rendering
 * to backend boot, session recovery, or local-mode reminders.
 */
export const useAppLifecycle = () => {
  useMonthlyServiceCycles();
  const { t } = useI18n();
  const { isOnline, isUpdateReady } = useAppNoticeState();
  const [hasDrafts, setHasDrafts] = useState(hasUnsavedChanges);
  const initializeBackend = useStore(state => state.initializeBackend);
  const sessionMemberId = useStore(state => state.currentUser?.id);
  const forceSyncMockData = useStore(state => state._forceSyncMockData);
  const sendDueDateReminders = useStore(state => state.sendDueDateReminders);

  useEffect(() => {
    configurePendingWork(() => {
      const backend = useStore.getState().backend;
      return backend.hasLocalChanges || backend.pendingMutations > 0 || backend.isSaving;
    });
    const update = () => setHasDrafts(hasUnsavedChanges());
    const unsubscribe = subscribeUnsavedChanges(update);
    const unsubscribeStore = useStore.subscribe(update);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const beforeNavigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || !hasUnsavedChanges()) return;
      if (anchor.href === window.location.href || new URL(anchor.href).origin === window.location.origin) return;
      if (hasBlockingUnsavedChanges() || !window.confirm(t('feedback.leaveUnsaved'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigate, true);
    update();
    return () => {
      unsubscribe();
      unsubscribeStore();
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeNavigate, true);
    };
  }, [t]);

  useEffect(() => {
    if (sessionMemberId) startBackendAutoSync();
    else stopBackendAutoSync();
    return stopBackendAutoSync;
  }, [sessionMemberId]);

  useEffect(() => {
    if (!shouldUseSecureSupabase()) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        clearWorkspaceSession();
        return;
      }

      const currentUser = useStore.getState().currentUser;
      if (currentUser && currentUser.authUserId !== session.user.id) {
        clearWorkspaceSession();
        useStore.setState((state) => ({
          currentUser: null,
          backend: {
            ...state.backend,
            status: 'loading',
            isLoading: true,
            message: t('shell.refreshingAccount'),
          },
        }));
        queueMicrotask(() => void useStore.getState().initializeBackend());
      }
    });
    return () => subscription.unsubscribe();
  }, [t]);

  useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      if (['/feedback', '/feedback/results'].includes(window.location.pathname)) return;
      await initializeBackend();
      if (!isMounted) return;
      startBackendAutoSync();
      forceSyncMockData();
      let store = useStore.getState();
      if (!shouldUseSecureSupabase()) {
        sendDueDateReminders();
        store = useStore.getState();
      }
      if (store.backend.hasLocalChanges && !store.backend.hasRemoteUpdate) {
        await store.commitPendingMutation();
      }
    };

    void boot();
    return () => { isMounted = false; };
  }, [forceSyncMockData, initializeBackend, sendDueDateReminders]);

  useEffect(() => {
    if (shouldUseSecureSupabase()) return;
    const remind = () => {
      if (document.visibilityState === 'visible') sendDueDateReminders();
    };
    const interval = window.setInterval(remind, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', remind);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', remind);
    };
  }, [sendDueDateReminders]);

  return { hasDrafts, isOnline, isUpdateReady };
};
