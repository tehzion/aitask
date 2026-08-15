import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, CalendarDays, FolderKanban, BarChart3, Settings, LogOut, UserPlus, Users, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStore, stopBackendAutoSync } from '../store';
import clsx from 'clsx';
import { canAccessPath, getVisibleNavigation } from '../lib/access';
import { clearPasswordResetBypass } from '../lib/auth';
import { shouldUseSecureSupabase, signOutSecureSession } from '../lib/supabaseClient';
import { APP_VERSION_LABEL, APP_COMMIT } from '../lib/appVersion';

const navIcons = {
  Dashboard: LayoutDashboard,
  Tasks: CheckSquare,
  Calendar: CalendarDays,
  Clients: Users,
  Companies: FolderKanban,
  Reports: BarChart3,
  Approvals: UserPlus,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isCollapsed, onToggleCollapsed }) => {
  const [isDesktop, setIsDesktop] = React.useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  ));
  const sidebarRef = React.useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const handleLogout = async () => {
    const signingOutUser = useStore.getState().currentUser;
    if (shouldUseSecureSupabase()) await signOutSecureSession();
    clearPasswordResetBypass(signingOutUser?.id);
    stopBackendAutoSync();
    useStore.setState({ currentUser: null });
    navigate('/login', { replace: true });
  };

  const currentUser     = useStore((state) => state.currentUser);
  const rolePermissions = useStore((state) => state.rolePermissions);

  const filteredNavItems = getVisibleNavigation(currentUser, rolePermissions).map(item => ({
    ...item,
    icon: navIcons[item.label as keyof typeof navIcons],
  }));
  const canViewSettings = canAccessPath(currentUser, '/settings', rolePermissions);

  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const handleChange = () => setIsDesktop(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  React.useEffect(() => {
    if (!sidebarRef.current) return;
    if (!isDesktop && !isOpen) sidebarRef.current.setAttribute('inert', '');
    else sidebarRef.current.removeAttribute('inert');
  }, [isDesktop, isOpen]);

  React.useEffect(() => {
    if (!isDesktop && isOpen) {
      window.setTimeout(() => sidebarRef.current?.querySelector<HTMLElement>('a[href]')?.focus(), 0);
    }
  }, [isDesktop, isOpen]);

  React.useEffect(() => {
    if (isDesktop || !isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        sidebar.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, isOpen, onClose]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          tabIndex={-1}
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-sm transition-opacity md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        ref={sidebarRef}
        tabIndex={-1}
        aria-label="Primary navigation"
        aria-hidden={!isDesktop && !isOpen}
        className={clsx(
        'fixed inset-y-0 left-0 z-30 flex w-[17rem] flex-col border-r border-line/80 transition-transform duration-160 ease-out md:static md:translate-x-0',
        'bg-surface text-ink shadow-float md:shadow-none',
        isCollapsed && 'md:w-20',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className={clsx('flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-line/70 px-5', isCollapsed && 'md:justify-center md:px-2')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent text-sm font-semibold tracking-[-0.03em] text-white shadow-[0_10px_24px_-16px_rgb(var(--calm-accent)/0.9)]">
            AT
          </div>
          <div className={clsx('min-w-0', isCollapsed && 'md:hidden')}>
            <div className="font-sans text-lg font-semibold tracking-[-0.03em] text-ink">AiTask</div>
            <p className="text-[11px] font-medium text-muted">Operations workspace</p>
          </div>
        </div>

        {/* Nav items */}
        <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className={clsx('calm-eyebrow mb-3 px-3', isCollapsed && 'md:sr-only')}>Workspace</p>
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) => clsx(
                'group flex min-h-11 items-center rounded-control px-3 py-2.5 transition-colors duration-160',
                isCollapsed && 'md:justify-center md:px-2',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-inset hover:text-ink'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={clsx('h-[19px] w-[19px] shrink-0 transition-colors', !isCollapsed && 'mr-3', isCollapsed && 'md:mr-0', isActive ? 'text-accent' : 'text-muted group-hover:text-ink')} />
                  <span className={clsx('text-sm font-medium', isCollapsed && 'md:hidden')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer */}
        <div className="space-y-1 border-t border-line/70 p-3">
          {canViewSettings && (
            <NavLink
              to="/settings"
              onClick={onClose}
              title={isCollapsed ? 'Settings' : undefined}
              className={({ isActive }) => clsx(
                'group flex min-h-11 w-full items-center rounded-control px-3 py-2.5 transition-colors duration-160',
                isCollapsed && 'md:justify-center md:px-2',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-inset hover:text-ink'
              )}
            >
              {({ isActive }) => (
                <>
                  <Settings className={clsx('h-[19px] w-[19px]', !isCollapsed && 'mr-3', isCollapsed && 'md:mr-0', isActive ? 'text-accent' : 'text-muted group-hover:text-ink')} />
                  <span className={clsx('text-sm font-medium', isCollapsed && 'md:hidden')}>Settings</span>
                </>
              )}
            </NavLink>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={isCollapsed ? 'Logout' : undefined}
            className={clsx('flex min-h-11 w-full items-center rounded-control px-3 py-2.5 text-red-600/80 transition-colors duration-160 hover:bg-red-50 hover:text-red-700', isCollapsed && 'md:justify-center md:px-2')}
          >
            <LogOut className={clsx('h-[19px] w-[19px]', !isCollapsed && 'mr-3', isCollapsed && 'md:mr-0')} />
            <span className={clsx('text-sm font-medium', isCollapsed && 'md:hidden')}>Logout</span>
          </button>
          <button type="button" onClick={onToggleCollapsed} className="hidden min-h-11 w-full items-center justify-center rounded-control text-muted transition-colors duration-160 hover:bg-inset hover:text-ink md:flex" aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {isCollapsed ? <PanelLeftOpen className="h-[19px] w-[19px]" /> : <><PanelLeftClose className="mr-3 h-[19px] w-[19px]" /><span className="text-sm font-medium">Collapse</span></>}
          </button>
          <p className={clsx('px-3 pt-2 font-mono text-[10px] text-muted/70', isCollapsed && 'md:hidden')} title="AiTask application version and build commit">
            {APP_VERSION_LABEL} · {APP_COMMIT}
          </p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
