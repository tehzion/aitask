import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { Bell, Search, Menu, CheckCircle2, Info, AlertCircle, FileText, X, Volume2, VolumeX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { IconButton } from './ui';
import { inputBase } from './uiTokens';
import { cn } from '../lib/utils';
import { getEffectiveRoleName, isNotificationReadByUser, isNotificationVisible } from '../lib/access';
import { useSoundNotifications } from '../hooks/useSoundNotifications';
import { getSoundEnabled, setSoundEnabled } from '../lib/sounds';
import { notificationRouteToPath } from '../lib/security';

interface NavbarProps {
  onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const {
    currentUser,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    commitPendingMutation,
    discardMutation,
    rolePermissions,
  } = useStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [soundEnabled, setSoundEnabledState] = useState(getSoundEnabled);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Play sound on new notifications
  useSoundNotifications(notifications, currentUser);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const myNotifs = useMemo(() => {
    return (notifications || [])
      .filter(n => isNotificationVisible(currentUser, n))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, currentUser]);

  const unreadCount = myNotifs.filter(n => !isNotificationReadByUser(currentUser, n)).length;

  const handleBellClick = () => {
    setShowNotifs(!showNotifs);
  };

  const persistNotificationChange = async (change: () => void) => {
    const previousNotifications = useStore.getState().notifications;
    change();
    const result = await commitPendingMutation();
    if (result.ok) return;

    useStore.setState({ notifications: previousNotifications });
    await discardMutation({ reload: false });
  };

  const handleGlobalSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = globalSearch.trim();
    if (!query) return;
    navigate(`/tasks?search=${encodeURIComponent(query)}`);
    setShowMobileSearch(false);
  };

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
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center flex-1">
        <IconButton
          onClick={onMenuClick}
          label="Open menu"
          className="mr-2 md:hidden"
        >
          <Menu className="w-6 h-6" />
        </IconButton>
        <form onSubmit={handleGlobalSearch} className="relative w-full max-w-md hidden sm:block">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="w-5 h-5 text-slate-400" />
          </span>
          <input 
            type="text" 
            className={cn(inputBase, 'border-transparent bg-slate-100 py-2.5 pl-10 pr-3 shadow-none focus:bg-white')}
            placeholder="Search tasks..."
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
          />
        </form>
      </div>
      
      <div className="flex items-center gap-1 sm:gap-2">
        <IconButton
          label="Search"
          onClick={() => setShowMobileSearch(value => !value)}
          className="sm:hidden"
        >
          {showMobileSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </IconButton>
        <IconButton
          onClick={handleToggleSound}
          label={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
          className="rounded-full"
        >
          {soundEnabled
            ? <Volume2 className="w-5 h-5" />
            : <VolumeX className="w-5 h-5 text-slate-400" />}
        </IconButton>

        <div className="relative" ref={notifRef}>
          <IconButton
            onClick={handleBellClick}
            label="Notifications"
            className="relative rounded-full"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </IconButton>

          {/* Notifications Dropdown */}
          {showNotifs && (
            <div className="absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-950/10 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                <div>
                  <h3 className="font-bold text-slate-900">Notifications</h3>
                  <p className="text-xs text-slate-500">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                  </p>
                </div>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {unreadCount} New
                  </span>
                ) : null}
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {myNotifs.length > 0 ? myNotifs.map(notif => (
                  <Link 
                    key={notif.id} 
                    to={notificationRouteToPath(notif.route ?? (notif as typeof notif & { link?: string }).link)}
                    onClick={() => {
                      void persistNotificationChange(() => markNotificationRead(notif.id));
                      setShowNotifs(false);
                    }}
                    className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50 ${!isNotificationReadByUser(currentUser, notif) ? 'bg-blue-50/45' : ''}`}
                  >
                    <div className={`p-2 rounded-full shrink-0 ${getBgColor(notif.iconType)}`}>
                      {getIcon(notif.iconType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">{notif.title}</p>
                      <p className={`mt-0.5 text-sm leading-5 ${!isNotificationReadByUser(currentUser, notif) ? 'text-slate-950 font-semibold' : 'text-slate-600'}`}>{notif.message}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}</p>
                    </div>
                    {!isNotificationReadByUser(currentUser, notif) && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"></div>
                    )}
                  </Link>
                )) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-600">No notifications yet</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Task assignments, approvals, and sync notices will show here.</p>
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void persistNotificationChange(markAllNotificationsRead)}
                  className="w-full border-t border-slate-200 bg-slate-50 px-4 py-2 text-center transition-colors hover:bg-slate-100"
                >
                  <span className="text-xs font-semibold text-slate-500 transition-colors hover:text-blue-700">Mark All as Read</span>
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-semibold leading-tight text-slate-950">{currentUser.name}</span>
            <span className="text-xs text-slate-500">{getEffectiveRoleName(currentUser, rolePermissions)} - {currentUser.department}</span>
          </div>
          <img 
            src={currentUser.avatar} 
            alt={currentUser.name} 
            className="w-9 h-9 rounded-full ring-2 ring-white shadow-sm object-cover"
          />
        </div>
      </div>
      {showMobileSearch && (
        <form onSubmit={handleGlobalSearch} className="absolute inset-x-0 top-16 border-b border-slate-200 bg-white p-3 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              className={cn(inputBase, 'py-2.5 pl-10 pr-3')}
              placeholder="Search tasks..."
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
          </div>
        </form>
      )}
    </header>
  );
};

export default Navbar;
