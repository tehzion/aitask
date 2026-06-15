import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { ToastContainer } from './Toast';
import CreateTaskModal from './CreateTaskModal';
import { useStore } from '../store';
import { isNotificationVisible, isNotificationReadByUser } from '../lib/access';
import { getBackendStatus } from '../lib/backend';
import { LayoutDashboard, CheckSquare, CalendarDays, Bell, X, FileText, CheckCircle2, Info, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

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
    backend,
    pullBackendNow,
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
  }, [setCreateTaskModalOpen]);

  // Mobile Notification Calculations
  const myNotifs = useMemo(() => {
    return (notifications || [])
      .filter(n => isNotificationVisible(currentUser, n))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, currentUser]);

  const unreadCount = myNotifs.filter(n => !isNotificationReadByUser(currentUser, n)).length;
  const backendStatus = getBackendStatus();
  const hostedLocalBuild = backendStatus.mode === 'local' && backendStatus.isHostedRuntime;
  const missingSupabaseConfig = backendStatus.mode === 'supabase' && !backendStatus.ready;
  const syncNeedsAttention = hostedLocalBuild || missingSupabaseConfig || Boolean(backend.error) || backend.hasRemoteUpdate;
  const syncBannerTitle = hostedLocalBuild
    ? 'Sync is local on this deployed build'
    : missingSupabaseConfig
      ? 'Supabase sync is not configured'
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
      default: return <AlertCircle className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getBgColor = (type: string) => {
    switch(type) {
      case 'task': return 'bg-blue-50';
      case 'success': return 'bg-emerald-50';
      case 'status': return 'bg-amber-50';
      default: return 'bg-indigo-50';
    }
  };

  return (
    <div className="flex h-screen bg-[#faf8f5] text-stone-900 font-sans overflow-hidden relative">
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
                {backendStatus.mode === 'supabase' && backendStatus.ready && (
                  <button
                    type="button"
                    onClick={() => pullBackendNow({ force: backend.hasRemoteUpdate, silent: false })}
                    disabled={backend.isPulling || backend.isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={cn('h-4 w-4', backend.isPulling && 'animate-spin')} />
                    Refresh
                  </button>
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
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-[#faf8f5] p-4 sm:p-6 lg:p-7 pb-24 md:pb-6">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#241a11] border-t border-white/10 z-40 flex items-center justify-around md:hidden shadow-lg">
          <NavLink
            to="/"
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center flex-1 h-full text-white/50 transition-colors",
              isActive && "text-orange-400 font-bold"
            )}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Dashboard</span>
          </NavLink>

          <NavLink
            to="/tasks"
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center flex-1 h-full text-white/50 transition-colors",
              isActive && "text-orange-400 font-bold"
            )}
          >
            <CheckSquare className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Tasks</span>
          </NavLink>

          <NavLink
            to="/calendar"
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center flex-1 h-full text-white/50 transition-colors",
              isActive && "text-orange-400 font-bold"
            )}
          >
            <CalendarDays className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Calendar</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setIsMobileNotifOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full text-white/50 transition-colors relative",
              isMobileNotifOpen && "text-orange-400 font-bold"
            )}
          >
            <div className="relative">
              <Bell className="w-5 h-5 mb-0.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 h-3.5 w-3.5 rounded-full bg-orange-500 text-[8px] font-black text-white flex items-center justify-center border border-[#241a11]">
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
            className="fixed inset-0 bg-stone-900/60 z-50 md:hidden backdrop-blur-sm animate-fade-in"
            onClick={() => setIsMobileNotifOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 max-h-[75vh] bg-white rounded-t-3xl shadow-2xl border-t border-[#e8e3db] z-50 flex flex-col md:hidden animate-slide-up">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#f0ebe2] flex justify-between items-center bg-stone-50/80 rounded-t-3xl shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-stone-850 text-base">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-orange-700 font-extrabold bg-orange-100 px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNotifOpen(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 hover:bg-stone-100 rounded-lg transition-colors"
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
                    to={notif.link}
                    onClick={() => {
                      markNotificationRead(notif.id);
                      setIsMobileNotifOpen(false);
                    }}
                    className={cn(
                      "px-4 py-3 rounded-xl border flex items-start gap-3 transition-colors",
                      !isNotificationReadByUser(currentUser, notif)
                        ? 'bg-orange-50/30 border-orange-100/50'
                        : 'bg-white border-stone-100/80'
                    )}
                  >
                    <div className={cn("p-2 rounded-full shrink-0", getBgColor(notif.iconType))}>
                      {getIcon(notif.iconType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-stone-400">
                        {notif.title}
                      </p>
                      <p className={cn(
                        "mt-0.5 text-sm leading-snug",
                        !isNotificationReadByUser(currentUser, notif)
                          ? 'text-stone-900 font-bold'
                          : 'text-stone-600 font-medium'
                      )}>
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-stone-400 mt-1">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!isNotificationReadByUser(currentUser, notif) && (
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-full mt-1.5 shrink-0"></div>
                    )}
                  </Link>
                ))
              ) : (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-stone-600">No notifications yet</p>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    Task assignments, approvals, and sync notices will appear here.
                  </p>
                </div>
              )}
            </div>

            {/* Mark all as read */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  markAllNotificationsRead();
                }}
                className="p-4 border-t border-[#f0ebe2] bg-stone-50 hover:bg-stone-100 transition-colors text-center text-sm font-bold text-orange-700 shrink-0"
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
