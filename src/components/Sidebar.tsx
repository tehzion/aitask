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
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-sm transition-opacity md:hidden"
          onClick={onClose}
        />
      )}

      <div className={clsx(
        'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 transition-transform duration-300 ease-in-out md:static md:translate-x-0',
        'bg-white text-slate-900 shadow-xl shadow-slate-950/10 md:shadow-none',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm">
            AT
          </div>
          <div className="min-w-0">
            <div className="font-sans text-lg font-bold tracking-tight text-slate-950">AiTask</div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Agency Hub</p>
          </div>
        </div>

        {/* Nav items */}
        <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Menu</p>
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => clsx(
                'group flex items-center rounded-lg px-3 py-2.5 transition-colors duration-200',
                isActive
                  ? 'border border-blue-100 bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={clsx('mr-3 h-[18px] w-[18px] transition-colors', isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700')} />
                  <span className="font-medium text-sm">{item.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer */}
        <div className="space-y-1 border-t border-slate-200 p-3">
          {canViewSettings && (
            <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) => clsx(
                'group flex w-full items-center rounded-lg px-3 py-2.5 transition-colors duration-200',
                isActive
                  ? 'border border-blue-100 bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              )}
            >
              {({ isActive }) => (
                <>
                  <Settings className={clsx('mr-3 h-[18px] w-[18px]', isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700')} />
                  <span className="font-medium text-sm">Settings</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
                </>
              )}
            </NavLink>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center rounded-lg px-3 py-2.5 text-red-600/80 transition-colors duration-200 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="mr-3 h-[18px] w-[18px]" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
