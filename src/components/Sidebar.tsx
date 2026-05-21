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

  const currentUser = useStore((state) => state.currentUser);
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
          className="fixed inset-0 bg-slate-900/50 z-20 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={clsx(
        "fixed inset-y-0 left-0 z-30 w-64 bg-slate-950 text-white flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0 shadow-2xl md:shadow-none",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex flex-col justify-center px-6 border-b border-white/10 bg-slate-950 shrink-0">
        <div className="flex flex-col items-start justify-center mt-1">
          <div className="flex items-baseline font-sans">
            <span className="text-2xl font-bold text-red-500 tracking-tighter">A</span>
            <div className="flex flex-col items-center justify-end ml-[1px]">
              <span className="text-2xl font-bold text-red-500 tracking-tighter">i</span>
            </div>
            <span className="text-xl font-extrabold text-white tracking-tight ml-1">Task</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Menu</div>
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) => clsx(
              'flex items-center px-3 py-2.5 rounded-lg transition-colors duration-200',
              isActive ? 'bg-white/10 text-white shadow-sm' : 'text-slate-300 hover:bg-white/5 hover:text-white'
            )}
          >
            <item.icon className="w-5 h-5 mr-3" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="p-4 border-t border-white/10 space-y-2">
        {canViewSettings && (
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => clsx(
              'flex items-center px-3 py-2.5 rounded-lg w-full transition-colors duration-200',
              isActive ? 'bg-white/10 text-white shadow-sm' : 'text-slate-300 hover:bg-white/5 hover:text-white'
            )}
          >
            <Settings className="w-5 h-5 mr-3" />
            <span className="font-medium">Settings</span>
          </NavLink>
        )}
        <button 
          onClick={handleLogout}
          className="flex items-center px-3 py-2.5 rounded-lg text-red-300 hover:bg-red-500/15 hover:text-red-100 w-full transition-colors duration-200"
        >
          <LogOut className="w-5 h-5 mr-3" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
    </>
  );
};

export default Sidebar;
