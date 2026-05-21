import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { Bell, Search, Menu, CheckCircle2, Info, AlertCircle, FileText, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { IconButton, inputBase } from './ui';
import { cn } from '../lib/utils';
import { getEffectiveRoleName, isNotificationVisible } from '../lib/access';

interface NavbarProps {
  onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const { currentUser, notifications, markNotificationRead, markAllNotificationsRead, rolePermissions } = useStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  const unreadCount = myNotifs.filter(n => !n.isRead).length;

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
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 shrink-0">
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
            placeholder="Search tasks, projects..." 
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
          />
        </form>
      </div>
      
      <div className="flex items-center space-x-4">
        <IconButton
          label="Search"
          onClick={() => setShowMobileSearch(value => !value)}
          className="sm:hidden"
        >
          {showMobileSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </IconButton>
        <div className="relative" ref={notifRef}>
          <IconButton
            onClick={handleBellClick}
            label="Notifications"
            className="relative rounded-full"
          >
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </IconButton>

          {/* Notifications Dropdown */}
          {showNotifs && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-80 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {myNotifs.length > 0 ? myNotifs.map(notif => (
                  <Link 
                    key={notif.id} 
                    to={notif.link}
                    onClick={() => {
                      markNotificationRead(notif.id);
                      setShowNotifs(false);
                    }}
                    className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-start gap-3 ${!notif.isRead ? 'bg-indigo-50/30' : ''}`}
                  >
                    <div className={`p-2 rounded-full shrink-0 ${getBgColor(notif.iconType)}`}>
                      {getIcon(notif.iconType)}
                    </div>
                    <div>
                      <p className={`text-sm ${!notif.isRead ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>{notif.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}</p>
                    </div>
                    {!notif.isRead && (
                      <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 shrink-0"></div>
                    )}
                  </Link>
                )) : (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">
                    You are all caught up!
                  </div>
                )}
              </div>
              {myNotifs.length > 0 && (
                <div 
                  onClick={() => markAllNotificationsRead()}
                  className="px-4 py-2 text-center border-t border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors">Mark All as Read</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-900 leading-tight">{currentUser.name}</span>
            <span className="text-xs text-slate-500">{getEffectiveRoleName(currentUser, rolePermissions)} • {currentUser.department}</span>
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
              placeholder="Search tasks or projects..."
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
