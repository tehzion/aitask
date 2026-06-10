import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, CalendarDays, FolderKanban, BarChart3, Settings, LogOut, UserPlus } from 'lucide-react';
import { useStore } from '../store';
import clsx from 'clsx';
import { canAccessPath, getVisibleNavigation } from '../lib/access';

const navIcons = {
  Dashboard: LayoutDashboard,
  Tasks: CheckSquare,
  Calendar: CalendarDays,
  Projects: FolderKanban,
  Reports: BarChart3,
  Approvals: UserPlus,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    useStore.setState({ currentUser: null });
    navigate('/login');
  };

  const currentUser     = useStore((state) => state.currentUser);
  const rolePermissions = useStore((state) => state.rolePermissions);

  const filteredNavItems = getVisibleNavigation(currentUser, rolePermissions).map(item => ({
    ...item,
    icon: navIcons[item.label as keyof typeof navIcons],
  }));
  const canViewSettings = canAccessPath(currentUser, '/settings', rolePermissions);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-stone-900/50 z-20 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar — warm dark wood #2d1e14 */}
      <div className={clsx(
        'fixed inset-y-0 left-0 z-30 w-64 flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0 shadow-2xl md:shadow-none',
        'bg-[#241a11] text-white',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="h-16 flex flex-col justify-center px-6 border-b border-white/10 shrink-0">
          <div className="flex items-baseline font-sans gap-0.5">
            <span className="text-2xl font-black text-orange-400 tracking-tighter">Ai</span>
            <span className="text-xl font-extrabold text-white tracking-tight">Task</span>
          </div>
          <p className="text-[10px] text-white/30 tracking-widest uppercase mt-0.5 font-medium">Agency Hub</p>
        </div>

        {/* Nav items */}
        <div className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3 px-3">Menu</p>
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => clsx(
                'flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group',
                isActive
                  ? 'bg-orange-600/20 text-orange-300 font-semibold'
                  : 'text-white/60 hover:bg-white/8 hover:text-white/90'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={clsx('w-4.5 h-4.5 mr-3 transition-colors', isActive ? 'text-orange-400' : 'text-white/40 group-hover:text-white/70')} />
                  <span className="font-medium text-sm">{item.label}</span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400" />}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 space-y-0.5">
          {canViewSettings && (
            <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) => clsx(
                'flex items-center px-3 py-2.5 rounded-xl w-full transition-all duration-200 group',
                isActive
                  ? 'bg-orange-600/20 text-orange-300 font-semibold'
                  : 'text-white/60 hover:bg-white/8 hover:text-white/90'
              )}
            >
              {({ isActive }) => (
                <>
                  <Settings className={clsx('w-4.5 h-4.5 mr-3', isActive ? 'text-orange-400' : 'text-white/40')} />
                  <span className="font-medium text-sm">Settings</span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400" />}
                </>
              )}
            </NavLink>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center px-3 py-2.5 rounded-xl text-red-400/80 hover:bg-red-500/15 hover:text-red-300 w-full transition-all duration-200"
          >
            <LogOut className="w-4.5 h-4.5 mr-3" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
