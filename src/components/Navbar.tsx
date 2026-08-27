import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { getMemberDepartments } from '../lib/departments';
import { Bell, Search, Menu, CheckCircle2, Info, AlertCircle, FileText, X, Volume2, VolumeX, Keyboard, Moon, Sun, Monitor, ChevronDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { IconButton } from './ui';
import { inputBase } from './uiTokens';
import { cn } from '../lib/utils';
import { getEffectiveRoleName, getUnreadNotifications } from '../lib/access';
import { useSoundNotifications } from '../hooks/useSoundNotifications';
import { NotificationReadActions } from '../hooks/useNotificationReadActions';
import { getSoundEnabled, setSoundEnabled, SOUND_PREF_EVENT } from '../lib/sounds';
import { notificationRouteToPath } from '../lib/security';
import { shouldUseSecureSupabase } from '../lib/supabaseClient';
import type { ResolvedTheme, ThemePreference } from '../lib/theme';
import { LanguageSwitcher } from './I18nProvider';

interface NavbarProps {
  onMenuClick: () => void;
  notificationReadActions: NotificationReadActions;
  resolvedTheme: ResolvedTheme;
  themePreference: ThemePreference;
  onSetThemePreference: (preference: ThemePreference) => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
}

const Navbar: React.FC<NavbarProps> = ({
  onMenuClick,
  notificationReadActions,
  resolvedTheme,
  themePreference,
  onSetThemePreference,
  onToggleTheme,
  onOpenShortcuts,
}) => {
  const {
    currentUser,
    notifications,
    notificationUnreadCount,
    rolePermissions,
  } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    notifications: state.notifications,
    notificationUnreadCount: state.notificationUnreadCount,
    rolePermissions: state.rolePermissions,
  })));
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [soundEnabled, setSoundEnabledState] = useState(getSoundEnabled);
  const [showAppearance, setShowAppearance] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const appearanceTriggerRef = useRef<HTMLButtonElement>(null);
  const appearanceItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleSoundPreference = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      setSoundEnabledState(enabled);
    };
    window.addEventListener(SOUND_PREF_EVENT, handleSoundPreference);
    return () => window.removeEventListener(SOUND_PREF_EVENT, handleSoundPreference);
  }, []);

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
      if (appearanceRef.current && !appearanceRef.current.contains(event.target as Node)) setShowAppearance(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showAppearance) return;
    const selectedIndex = ['light', 'dark', 'system'].indexOf(themePreference);
    window.setTimeout(() => appearanceItemRefs.current[Math.max(0, selectedIndex)]?.focus(), 0);
  }, [showAppearance, themePreference]);

  const closeAppearance = (returnFocus = false) => {
    setShowAppearance(false);
    if (returnFocus) window.setTimeout(() => appearanceTriggerRef.current?.focus(), 0);
  };

  const handleAppearanceKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % 3;
    if (event.key === 'ArrowUp') nextIndex = (index + 2) % 3;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = 2;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAppearance(true);
      return;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    appearanceItemRefs.current[nextIndex]?.focus();
  };

  useEffect(() => {
    const handleFocusSearch = () => {
      setShowMobileSearch(true);
      window.setTimeout(() => {
        mobileSearchRef.current?.focus();
        mobileSearchRef.current?.select();
      }, 0);
    };
    window.addEventListener('aitask-focus-search', handleFocusSearch);
    return () => window.removeEventListener('aitask-focus-search', handleFocusSearch);
  }, []);

  const unreadNotifs = useMemo(() => {
    return getUnreadNotifications(currentUser, notifications || [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, currentUser]);

  const unreadCount = shouldUseSecureSupabase() ? notificationUnreadCount : unreadNotifs.length;
  const previewNotifications = unreadNotifs.slice(0, 5);
  const isClient = currentUser?.role === 'Client';

  const handleBellClick = () => {
    setShowNotifs(!showNotifs);
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
      case 'task': return <FileText className="w-4 h-4 text-accent" />;
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'status': return <Info className="w-4 h-4 text-amber-500" />;
      default: return <AlertCircle className="w-4 h-4 text-accent" />;
    }
  };

  const getBgColor = (type: string) => {
    switch(type) {
      case 'task': return 'bg-accent-soft';
      case 'success': return 'bg-emerald-50';
      case 'status': return 'bg-amber-50';
      default: return 'bg-accent-soft';
    }
  };

  return (
    <header className="sticky top-0 z-10 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-line/80 bg-surface/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
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
            aria-label={isClient ? 'Search deliveries' : 'Search tasks'}
            aria-keyshortcuts="/"
            data-global-search
            className={cn(inputBase, 'border-transparent bg-inset py-2.5 pl-10 pr-3 shadow-none focus:bg-surface')}
            placeholder={isClient ? 'Search deliveries…' : 'Search tasks...'}
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
          />
        </form>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <LanguageSwitcher compact />
        <IconButton
          label="Search"
          onClick={() => setShowMobileSearch(value => !value)}
          className="sm:hidden"
        >
          {showMobileSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </IconButton>
        <div className="relative flex items-center" ref={appearanceRef}>
          <IconButton onClick={onToggleTheme} label={`Switch to ${resolvedTheme === 'dark' ? 'day' : 'night'} mode`} aria-pressed={resolvedTheme === 'dark'} aria-keyshortcuts="Shift+D" className="rounded-r-none">
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </IconButton>
          <button ref={appearanceTriggerRef} type="button" onClick={() => setShowAppearance(value => !value)} onKeyDown={event => { if (event.key === 'Escape' && showAppearance) { event.preventDefault(); closeAppearance(true); } }} aria-label="Appearance settings" aria-haspopup="menu" aria-expanded={showAppearance} aria-controls="appearance-menu" className="flex h-11 w-11 items-center justify-center rounded-r-control text-muted hover:bg-inset hover:text-ink"><ChevronDown className="h-4 w-4" /></button>
          {showAppearance && <div id="appearance-menu" role="menu" aria-label="Appearance" className="absolute right-0 top-12 z-50 w-44 rounded-panel bg-surface p-1.5 shadow-float ring-1 ring-line">
            {([{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Monitor }] as const).map((option, index) => <button key={option.id} ref={node => { appearanceItemRefs.current[index] = node; }} type="button" role="menuitemradio" aria-checked={themePreference === option.id} onKeyDown={event => handleAppearanceKeyDown(event, index)} onClick={() => { onSetThemePreference(option.id); closeAppearance(true); }} className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 text-sm transition-colors duration-160', themePreference === option.id ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-inset hover:text-ink')}><option.icon className="h-4 w-4" />{option.label}</button>)}
          </div>}
        </div>
        <IconButton
          onClick={onOpenShortcuts}
          label="Keyboard shortcuts"
          aria-keyshortcuts="?"
          className="hidden sm:inline-flex"
        >
          <Keyboard className="h-5 w-5" />
        </IconButton>
        <IconButton
          onClick={handleToggleSound}
          label={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
        >
          {soundEnabled
            ? <Volume2 className="w-5 h-5" />
            : <VolumeX className="w-5 h-5 text-slate-400" />}
        </IconButton>

        <div className="relative" ref={notifRef}>
          <IconButton
            onClick={handleBellClick}
            label="Notifications"
            aria-expanded={showNotifs}
            aria-controls="header-notifications-menu"
            className="relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-700 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </IconButton>

          {/* Notifications Dropdown */}
          {showNotifs && (
            <div id="header-notifications-menu" role="region" aria-label="Notification preview" className="calm-raised absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-80 overflow-hidden">
              <div className="flex items-center justify-between border-b border-line/80 bg-inset/80 px-4 py-3">
                <div>
                  <h3 className="font-bold text-slate-900">Notifications</h3>
                  <p className="text-xs text-slate-500">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                  </p>
                </div>
                {unreadCount > 0 ? (
                  <span className="rounded-tag bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
                    {unreadCount} New
                  </span>
                ) : null}
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {previewNotifications.length > 0 ? previewNotifications.map(notif => (
                  <Link
                    key={notif.id}
                    to={notificationRouteToPath(notif.route ?? (notif as typeof notif & { link?: string }).link)}
                    onClick={() => {
                      void notificationReadActions.markRead(notif.id);
                      setShowNotifs(false);
                    }}
                    className="flex items-start gap-3 border-b border-line/60 bg-surface px-4 py-3 transition-colors hover:bg-inset/70"
                  >
                    <div className={`rounded-lg p-2 shrink-0 ${getBgColor(notif.iconType)}`}>
                      {getIcon(notif.iconType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-500">{notif.title}</p>
                      <p data-i18n-skip className="mt-0.5 text-sm font-semibold leading-5 text-slate-950">{notif.message}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}</p>
                    </div>
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true"></div>
                  </Link>
                )) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-600">No unread notifications</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">You are all caught up.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line/80 bg-inset/80 px-3 py-2.5">
                <Link
                  to="/notifications"
                  onClick={() => setShowNotifs(false)}
                  className="rounded-tag px-2 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                >
                  View all notifications
                </Link>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void notificationReadActions.markAllRead()}
                    disabled={notificationReadActions.isUpdating}
                    className="rounded-tag px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface hover:text-accent disabled:cursor-wait disabled:opacity-60"
                  >
                    {notificationReadActions.isUpdating ? 'Saving...' : 'Mark all read'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-l border-line pl-4">
          <div className="hidden md:flex flex-col items-end">
            <span data-i18n-skip className="text-sm font-semibold leading-tight text-slate-950">{currentUser.name}</span>
            <span className="text-xs text-slate-500">
              {getEffectiveRoleName(currentUser, rolePermissions)} - {getMemberDepartments(currentUser).join(', ')}
            </span>
          </div>
          <img
            src={currentUser.avatar}
            data-i18n-skip alt={currentUser.name}
            className="h-9 w-9 rounded-control object-cover ring-1 ring-line"
          />
        </div>
      </div>
      {showMobileSearch && (
        <form onSubmit={handleGlobalSearch} className="absolute inset-x-0 top-16 border-b border-line bg-surface p-3 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={mobileSearchRef}
              type="text"
              autoFocus
              aria-label={isClient ? 'Search deliveries' : 'Search tasks'}
              aria-keyshortcuts="/"
              data-global-search
              className={cn(inputBase, 'py-2.5 pl-10 pr-3')}
              placeholder={isClient ? 'Search deliveries…' : 'Search tasks...'}
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
