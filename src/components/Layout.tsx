import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { ToastContainer } from './Toast';
import CreateTaskModal from './CreateTaskModal';
import { useStore } from '../store';
import { canCreateTasks, isNotificationVisible, isNotificationReadByUser } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { LayoutDashboard, CheckSquare, CalendarDays, Bell, X, FileText, CheckCircle2, Info, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { notificationRouteToPath } from '../lib/security';

const Layout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileNotifOpen, setIsMobileNotifOpen] = useState(false);

  const {
    isCreateTaskModalOpen,
    setCreateTaskModalOpen,
    notifications,
    currentUser,
    markNotificationRead,
    markAllNotificationsRead,
    commitPendingMutation,
    backend,
    pullBackendNow,
    retryMutation,
    discardMutation,
    rolePermissions,
  } = useStore();

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        if (!canCreateTasks(currentUser, rolePermissions)) return;
        e.preventDefault();
        setCreateTaskModalOpen(true);
      } else if (e.key === '/') {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentUser, rolePermissions, setCreateTaskModalOpen]);

  // Mobile Notification Calculations
  const myNotifs = useMemo(() => {
    return (notifications || [])
      .filter(n => isNotificationVisible(currentUser, n))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, currentUser]);

  const unreadCount = myNotifs.filter(n => !isNotificationReadByUser(currentUser, n)).length;

  const persistNotificationChange = async (change: () => void) => {
    const previousNotifications = useStore.getState().notifications;
    change();
    const result = await commitPendingMutation();
    if (result.ok) return;

    useStore.setState({ notifications: previousNotifications });
    await discardMutation({ reload: false });
  };
  const backendStatus = getBackendStatus();
  const hostedLocalBuild = backendStatus.mode === 'local' && backendStatus.isHostedRuntime;
  const missingSupabaseConfig = backendStatus.mode === 'supabase' && !backendStatus.ready;
  const pendingResolution = backend.status === 'conflict' || backend.status === 'retry_required' || (backend.status === 'offline' && backend.hasLocalChanges);
  const syncNeedsAttention = hostedLocalBuild || missingSupabaseConfig || Boolean(backend.error) || backend.hasRemoteUpdate || pendingResolution;
  const syncBannerTitle = hostedLocalBuild
    ? 'Sync is local on this deployed build'
    : missingSupabaseConfig
      ? 'Supabase sync is not configured'
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
      default: return <AlertCircle className="w-4 h-4 text-teal-600" />;
    }
  };

  const getBgColor = (type: string) => {
    switch(type) {
      case 'task': return 'bg-blue-50';
      case 'success': return 'bg-emerald-50';
      case 'status': return 'bg-amber-50';
      default: return 'bg-teal-50';
    }
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-100 font-sans text-slate-950">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden w-full relative">
        <Navbar onMenuClick={() => setIsMobileMenuOpen(true)} />
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
                <Link
                  to="/settings"
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  Open Settings
                </Link>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-100 p-4 pb-24 sm:p-6 md:pb-6 lg:p-7">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white shadow-lg shadow-slate-950/10 md:hidden">
          <NavLink
            to="/"
            className={({ isActive }) => cn(
              "flex h-full flex-1 flex-col items-center justify-center text-slate-500 transition-colors",
              isActive && "font-bold text-blue-600"
            )}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Dashboard</span>
          </NavLink>

          <NavLink
            to="/tasks"
            className={({ isActive }) => cn(
              "flex h-full flex-1 flex-col items-center justify-center text-slate-500 transition-colors",
              isActive && "font-bold text-blue-600"
            )}
          >
            <CheckSquare className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Tasks</span>
          </NavLink>

          <NavLink
            to="/calendar"
            className={({ isActive }) => cn(
              "flex h-full flex-1 flex-col items-center justify-center text-slate-500 transition-colors",
              isActive && "font-bold text-blue-600"
            )}
          >
            <CalendarDays className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Calendar</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setIsMobileNotifOpen(true)}
            className={cn(
              "relative flex h-full flex-1 flex-col items-center justify-center text-slate-500 transition-colors",
              isMobileNotifOpen && "font-bold text-blue-600"
            )}
          >
            <div className="relative">
              <Bell className="w-5 h-5 mb-0.5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-blue-600 text-[8px] font-black text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Notifications</span>
          </button>
        </div>
      </div>

      {/* Mobile Slide-Up Notification Sheet */}
      {isMobileNotifOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm animate-fade-in md:hidden"
            onClick={() => setIsMobileNotifOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl shadow-slate-950/20 animate-slide-up md:hidden">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between rounded-t-2xl border-b border-slate-200 bg-slate-50/80 px-5 py-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-extrabold text-blue-700">
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
              {myNotifs.length > 0 ? (
                myNotifs.map(notif => (
                  <Link
                    key={notif.id}
                    to={notificationRouteToPath(notif.route ?? (notif as typeof notif & { link?: string }).link)}
                    onClick={() => {
                      void persistNotificationChange(() => markNotificationRead(notif.id));
                      setIsMobileNotifOpen(false);
                    }}
                    className={cn(
                      "px-4 py-3 rounded-lg border flex items-start gap-3 transition-colors",
                      !isNotificationReadByUser(currentUser, notif)
                        ? 'border-blue-100/70 bg-blue-50/45'
                        : 'border-slate-100/80 bg-white'
                    )}
                  >
                    <div className={cn("p-2 rounded-full shrink-0", getBgColor(notif.iconType))}>
                      {getIcon(notif.iconType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {notif.title}
                      </p>
                      <p className={cn(
                        "mt-0.5 text-sm leading-snug",
                        !isNotificationReadByUser(currentUser, notif)
                          ? 'font-bold text-slate-950'
                          : 'font-medium text-slate-600'
                      )}>
                        {notif.message}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!isNotificationReadByUser(currentUser, notif) && (
                      <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500"></div>
                    )}
                  </Link>
                ))
              ) : (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-600">No notifications yet</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Task assignments, approvals, and sync notices will appear here.
                  </p>
                </div>
              )}
            </div>

            {/* Mark all as read */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void persistNotificationChange(markAllNotificationsRead)}
                className="shrink-0 border-t border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-blue-700 transition-colors hover:bg-slate-100"
              >
                Mark All as Read
              </button>
            )}
          </div>
        </>
      )}

      <ToastContainer />
      <CreateTaskModal isOpen={isCreateTaskModalOpen} onClose={() => setCreateTaskModalOpen(false)} />
    </div>
  );
};

export default Layout;
