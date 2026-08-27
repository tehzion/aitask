import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { ToastContainer } from './Toast';
import { NotificationPopupHost } from './NotificationPopupHost';
import ReleaseNotice from './ReleaseNotice';
import CreateTaskModal from './CreateTaskModal';
import { useStore } from '../store';
import { useNotificationReadActions } from '../hooks/useNotificationReadActions';
import { canAccessPath, canCreateTasks, getUnreadNotifications } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { LayoutDashboard, CheckSquare, CalendarDays, Bell, X, FileText, CheckCircle2, Info, AlertCircle, RefreshCw, RotateCcw, Settings as SettingsIcon, UserPlus, Menu } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { notificationRouteToPath } from '../lib/security';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import { useColorTheme } from '../hooks/useColorTheme';
import { getNavigationShortcut, isEditableShortcutTarget } from '../lib/keyboard';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import CommandPalette from './CommandPalette';

export interface LayoutOutletContext {
  notificationReadActions: ReturnType<typeof useNotificationReadActions>;
}

const Layout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileNotifOpen, setIsMobileNotifOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('aitask-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [shortcutAnnouncement, setShortcutAnnouncement] = useState('');
  const shortcutPrefixRef = useRef('');
  const shortcutTimerRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { preference, resolvedTheme, setPreference, toggleTheme } = useColorTheme();

  const {
    isCreateTaskModalOpen,
    setCreateTaskModalOpen,
    notifications,
    notificationUnreadCount,
    currentUser,
    backend,
    pullBackendNow,
    retryMutation,
    discardMutation,
    rolePermissions,
  } = useStore(useShallow(state => ({
    isCreateTaskModalOpen: state.isCreateTaskModalOpen,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
    notifications: state.notifications,
    notificationUnreadCount: state.notificationUnreadCount,
    currentUser: state.currentUser,
    backend: state.backend,
    pullBackendNow: state.pullBackendNow,
    retryMutation: state.retryMutation,
    discardMutation: state.discardMutation,
    rolePermissions: state.rolePermissions,
  })));
  const notificationReadActions = useNotificationReadActions();

  const toggleSidebar = () => {
    setIsSidebarCollapsed(current => {
      const next = !current;
      try { window.localStorage.setItem('aitask-sidebar-collapsed', String(next)); } catch { /* keep the in-memory preference */ }
      return next;
    });
  };

  const userCanCreateTasks = canCreateTasks(currentUser, rolePermissions);

  const openMobileMenu = React.useCallback(() => {
    mobileMenuTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = React.useCallback(() => {
    if (!isMobileMenuOpen) return;
    setIsMobileMenuOpen(false);
    window.setTimeout(() => mobileMenuTriggerRef.current?.focus(), 0);
  }, [isMobileMenuOpen]);

  // Global keyboard shortcuts are intentionally disabled while typing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableShortcutTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[data-aitask-modal-portal]')) return;

      if (e.key === 'Escape') {
        closeMobileMenu();
        setIsMobileNotifOpen(false);
        shortcutPrefixRef.current = '';
        return;
      }

      if (e.key === '?' ) {
        e.preventDefault();
        setIsShortcutHelpOpen(true);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      if (shortcutPrefixRef.current === 'g') {
        shortcutPrefixRef.current = '';
        if (shortcutTimerRef.current) window.clearTimeout(shortcutTimerRef.current);
        const shortcut = getNavigationShortcut(e.key);
        if (!shortcut || !canAccessPath(currentUser, shortcut.path, rolePermissions)) return;
        e.preventDefault();
        navigate(shortcut.path);
        setShortcutAnnouncement(`Opened ${shortcut.label}.`);
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleTheme();
        setShortcutAnnouncement(`Switched to ${resolvedTheme === 'dark' ? 'day' : 'night'} mode.`);
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        shortcutPrefixRef.current = 'g';
        setShortcutAnnouncement('Go to: press a page shortcut key.');
        if (shortcutTimerRef.current) window.clearTimeout(shortcutTimerRef.current);
        shortcutTimerRef.current = window.setTimeout(() => {
          shortcutPrefixRef.current = '';
          setShortcutAnnouncement('Navigation shortcut cancelled.');
        }, 8000);
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!userCanCreateTasks) return;
        e.preventDefault();
        setCreateTaskModalOpen(true);
      } else if (e.key === '/') {
        const searchInput = Array.from(document.querySelectorAll<HTMLInputElement>('[data-global-search]'))
          .find(input => input.getClientRects().length > 0);
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        } else {
          e.preventDefault();
          window.dispatchEvent(new Event('aitask-focus-search'));
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (shortcutTimerRef.current) window.clearTimeout(shortcutTimerRef.current);
    };
  }, [closeMobileMenu, currentUser, navigate, resolvedTheme, rolePermissions, setCreateTaskModalOpen, toggleTheme, userCanCreateTasks]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    const content = appContentRef.current;
    if (!content) return;
    if (isMobileMenuOpen) content.setAttribute('inert', '');
    else content.removeAttribute('inert');
    return () => content.removeAttribute('inert');
  }, [isMobileMenuOpen]);

  // Mobile Notification Calculations
  const unreadNotifs = useMemo(() => {
    return getUnreadNotifications(currentUser, notifications || [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, currentUser]);

  const unreadCount = shouldUseSecureSupabase() ? notificationUnreadCount : unreadNotifs.length;
  const previewNotifications = unreadNotifs.slice(0, 5);
  const isStaff = currentUser?.role === 'Staff';
  const isClient = currentUser?.role === 'Client';
  const mobileNavItems = useMemo(() => isStaff
    ? [
        { path: '/', label: 'My work', icon: LayoutDashboard },
        { path: '/calendar', label: 'Schedule', icon: CalendarDays },
        { path: '/notifications', label: 'Inbox', icon: Bell },
      ].filter(item => item.path === '/notifications' || canAccessPath(currentUser, item.path, rolePermissions))
    : isClient
      ? [
          { path: '/', label: 'Home', icon: LayoutDashboard },
          { path: '/tasks', label: 'Deliveries', icon: CheckSquare },
          { path: '/notifications', label: 'Inbox', icon: Bell },
        ].filter(item => item.path === '/notifications' || canAccessPath(currentUser, item.path, rolePermissions))
    : [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/tasks', label: 'Tasks', icon: CheckSquare },
        { path: '/calendar', label: 'Calendar', icon: CalendarDays },
        ...(canAccessPath(currentUser, '/approvals', rolePermissions)
          ? [{ path: '/approvals', label: 'Approvals', icon: UserPlus }]
          : []),
        ...(canAccessPath(currentUser, '/settings', rolePermissions)
          ? [{ path: '/settings', label: 'Settings', icon: SettingsIcon }]
          : []),
      ].filter(item => canAccessPath(currentUser, item.path, rolePermissions)), [currentUser, isClient, isStaff, rolePermissions]);
  const canOpenSettings = Boolean(currentUser?.mustResetPassword)
    || canAccessPath(currentUser, '/settings', rolePermissions);

  const backendStatus = getBackendStatus();
  const hostedLocalBuild = backendStatus.mode === 'local' && backendStatus.isHostedRuntime;
  const missingSupabaseConfig = backendStatus.mode === 'supabase' && !backendStatus.ready;
  const upgradeRequired = backend.upgradeRequired === true;
  const pendingResolution = !upgradeRequired && (backend.status === 'conflict' || backend.status === 'retry_required' || (backend.status === 'offline' && backend.hasLocalChanges));
  const syncNeedsAttention = hostedLocalBuild || missingSupabaseConfig || upgradeRequired || Boolean(backend.error) || backend.hasRemoteUpdate || pendingResolution;
  const syncBannerTitle = hostedLocalBuild
    ? 'Sync is local on this deployed build'
    : missingSupabaseConfig
      ? 'Supabase sync is not configured'
      : upgradeRequired
        ? 'System update in progress'
        : backend.status === 'conflict'
        ? 'Sync conflict needs review'
        : backend.status === 'retry_required'
          ? 'A change needs to be retried'
          : backend.status === 'offline'
            ? 'AiTask is offline'
      : backend.hasRemoteUpdate
        ? 'Workspace update available'
        : 'Supabase sync issue';
  const syncBannerMessage = hostedLocalBuild
    ? 'This browser is using local storage only. Set the Supabase environment variables in Vercel and redeploy before clients use the app.'
    : missingSupabaseConfig
      ? `Missing ${backendStatus.missing.join(', ')}. Changes will not sync between users until Vercel is rebuilt with Supabase env.`
      : backend.error || backend.message;

  const getIcon = (type: string) => {
    switch(type) {
      case 'task': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'status': return <Info className="w-4 h-4 text-amber-500" />;
      default: return <AlertCircle className="w-4 h-4 text-blue-600" />;
    }
  };

  const getBgColor = (type: string) => {
    switch(type) {
      case 'task': return 'bg-blue-50';
      case 'success': return 'bg-emerald-50';
      case 'status': return 'bg-amber-50';
      default: return 'bg-blue-50';
    }
  };

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-canvas font-sans text-ink">
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0">
        Skip to main content
      </a>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{shortcutAnnouncement}</p>
      <Sidebar isOpen={isMobileMenuOpen} onClose={closeMobileMenu} isCollapsed={isSidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      <div ref={appContentRef} className="relative flex min-w-0 w-full flex-1 flex-col overflow-hidden">
        <Navbar
          onMenuClick={openMobileMenu}
          notificationReadActions={notificationReadActions}
          resolvedTheme={resolvedTheme}
          themePreference={preference}
          onSetThemePreference={setPreference}
          onToggleTheme={toggleTheme}
          onOpenShortcuts={() => setIsShortcutHelpOpen(true)}
        />
        {syncNeedsAttention && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:px-6 lg:px-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{syncBannerTitle}</p>
                  <p className="mt-0.5 text-sm leading-5 text-amber-800">{syncBannerMessage}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {backendStatus.mode === 'supabase' && backendStatus.ready && !pendingResolution && (
                  <button
                    type="button"
                    onClick={() => pullBackendNow({ silent: false })}
                    disabled={backend.isPulling || backend.isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={cn('h-4 w-4', backend.isPulling && 'animate-spin')} />
                    Refresh
                  </button>
                )}
                {pendingResolution && (
                  <>
                    <button
                      type="button"
                      onClick={() => void retryMutation()}
                      disabled={backend.isPulling || backend.isSaving || backend.status === 'offline'}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Retry my changes
                    </button>
                    <button
                      type="button"
                      onClick={() => void discardMutation()}
                      disabled={backend.isPulling || backend.isSaving || backend.status === 'offline'}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Use latest
                    </button>
                  </>
                )}
                {canOpenSettings && (
                  <Link
                    to="/settings"
                    className="inline-flex min-h-9 items-center justify-center rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                  >
                    Open Settings
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-canvas p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none sm:p-6 md:pb-6 lg:p-8"
        >
          <Outlet context={{ notificationReadActions }} />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_14px_rgb(7_22_18/0.10)] md:hidden">
          {mobileNavItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex h-16 flex-1 flex-col items-center justify-center text-slate-500 transition-colors",
                  isActive && "font-semibold text-accent"
                )}
              >
              <span className="relative">
                <Icon className="mb-0.5 h-5 w-5" />
                {item.path === '/notifications' && unreadCount > 0 && <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-surface bg-accent px-0.5 text-[8px] font-black text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </span>
              <span className="text-[10px]">{item.label}</span>
              </NavLink>
            );
          })}

          {isStaff || isClient ? (
            <button
              type="button"
              onClick={openMobileMenu}
              aria-label={isClient ? 'Open more client destinations' : 'Open more staff actions'}
              className="flex h-16 flex-1 flex-col items-center justify-center text-slate-500 transition-colors hover:text-accent"
            >
              <Menu className="mb-0.5 h-5 w-5" />
              <span className="text-[10px]">More</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsMobileNotifOpen(true)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              className={cn(
                "relative flex h-16 flex-1 flex-col items-center justify-center text-slate-500 transition-colors",
                isMobileNotifOpen && "font-semibold text-accent"
              )}
            >
              <div className="relative">
                <Bell className="mb-0.5 h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-surface bg-accent text-[8px] font-black text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px]">Notifications</span>
            </button>
          )}
        </nav>
      </div>

      {/* Mobile Slide-Up Notification Sheet */}
      {isMobileNotifOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-slate-950/45 animate-fade-in md:hidden"
            onClick={() => setIsMobileNotifOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-panel border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_28px_rgb(7_22_18/0.18)] animate-slide-up md:hidden">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between rounded-t-panel border-b border-line bg-inset/80 px-5 py-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-accent" />
                <h3 className="text-base font-bold text-slate-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="rounded-tag bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNotifOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close notifications"
                title="Close notifications"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 pb-8">
              {previewNotifications.length > 0 ? (
                previewNotifications.map(notif => (
                  <Link
                    key={notif.id}
                    to={notificationRouteToPath(notif.route ?? (notif as typeof notif & { link?: string }).link)}
                    onClick={() => {
                      void notificationReadActions.markRead(notif.id);
                      setIsMobileNotifOpen(false);
                    }}
                    className="flex items-start gap-3 rounded-control bg-inset/70 px-4 py-3 transition-colors hover:bg-inset"
                  >
                    <div className={cn("rounded-lg p-2 shrink-0", getBgColor(notif.iconType))}>
                      {getIcon(notif.iconType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-500">
                        {notif.title}
                      </p>
                      <p data-i18n-skip className="mt-0.5 text-sm font-semibold leading-snug text-slate-950">
                        {notif.message}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></div>
                  </Link>
                ))
              ) : (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-600">No unread notifications</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">You are all caught up.</p>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-inset px-4 py-3">
              <Link
                to="/notifications"
                onClick={() => setIsMobileNotifOpen(false)}
                className="rounded-tag px-2 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft"
              >
                View all notifications
              </Link>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void notificationReadActions.markAllRead()}
                  disabled={notificationReadActions.isUpdating}
                  className="rounded-tag px-2 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-accent disabled:cursor-wait disabled:opacity-60"
                >
                  {notificationReadActions.isUpdating ? 'Saving...' : 'Mark all read'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <NotificationPopupHost
        currentUser={currentUser}
        notifications={notifications}
        isReady={!backend.isLoading && backend.status !== 'loading'}
        readActions={notificationReadActions}
      />
      <ReleaseNotice
        currentUser={currentUser}
        isReady={!backend.isLoading && backend.status !== 'loading'}
      />
      <ToastContainer />
      <CreateTaskModal isOpen={isCreateTaskModalOpen} onClose={() => setCreateTaskModalOpen(false)} />
      <KeyboardShortcutsDialog
        isOpen={isShortcutHelpOpen}
        canCreateTask={userCanCreateTasks}
        onClose={() => setIsShortcutHelpOpen(false)}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenShortcuts={() => setIsShortcutHelpOpen(true)}
      />
    </div>
  );
};

export default Layout;
