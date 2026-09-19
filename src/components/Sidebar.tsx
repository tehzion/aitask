import React from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useStore, stopBackendAutoSync } from '../store';
import clsx from 'clsx';
import { canCreateTasks } from '../lib/access';
import { clearPasswordResetBypass } from '../lib/auth';
import { shouldUseSecureSupabase, signOutSecureSession } from '../lib/supabaseClient';
import { discardSecureWorkspaceCommand, getRetainedSecureCommand } from '../lib/secureWorkspace';
import { getMobileNavigation, getNavigationSections, type NavigationItem } from '../lib/navigation';
import { useI18n } from './I18nProvider';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

type CollapsedLabel = {
  label: string;
  top: number;
  left: number;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isCollapsed, onToggleCollapsed }) => {
  const [isDesktop, setIsDesktop] = React.useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  ));
  const [collapsedLabel, setCollapsedLabel] = React.useState<CollapsedLabel | null>(null);
  const sidebarRef = React.useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const currentUser = useStore((state) => state.currentUser);
  const rolePermissions = useStore((state) => state.rolePermissions);
  const clients = useStore((state) => state.clients);
  const setCreateTaskModalOpen = useStore((state) => state.setCreateTaskModalOpen);
  const isStaff = currentUser?.role === 'Staff' || currentUser?.role === 'HOD';
  const isClient = currentUser?.role === 'Client';
  const clientProfile = isClient
    ? clients.find(item => item.clientName.trim().toLowerCase() === currentUser.companyName?.trim().toLowerCase())
    : undefined;
  const { primary, secondary, footer } = getNavigationSections(
    currentUser,
    rolePermissions,
    clientProfile ? `/clients/${clientProfile.id}` : undefined,
  );
  const mobilePrimaryPaths = new Set(getMobileNavigation(currentUser, rolePermissions).map(item => item.path));
  const visibleSecondary = isDesktop
    ? secondary
    : secondary.filter(item => !mobilePrimaryPaths.has(item.path));
  const moreActive = visibleSecondary.some(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const [staffMoreOpen, setStaffMoreOpen] = React.useState(moreActive);

  const handleLogout = async () => {
    const signingOutUser = useStore.getState().currentUser;
    if (shouldUseSecureSupabase()) {
      const backend = useStore.getState().backend;
      const hasPendingChange = backend.pendingMutations > 0 || getRetainedSecureCommand() !== null;
      if (hasPendingChange && !window.confirm(t('Sign out anyway? Your pending change in this browser tab will be permanently discarded.'))) {
        return;
      }
      discardSecureWorkspaceCommand();
      await signOutSecureSession();
    }
    clearPasswordResetBypass(signingOutUser?.id);
    stopBackendAutoSync();
    useStore.setState({ currentUser: null });
    navigate('/login', { replace: true });
  };

  const showCollapsedLabel = (event: React.SyntheticEvent<HTMLElement>, label: string) => {
    if (!isDesktop || !isCollapsed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCollapsedLabel({
      label,
      top: rect.top + rect.height / 2,
      left: Math.min(rect.right + 12, window.innerWidth - 16),
    });
  };

  const hideCollapsedLabel = () => setCollapsedLabel(null);

  const collapsedLabelHandlers = (label: string) => ({
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') showCollapsedLabel(event, label);
    },
    onPointerLeave: hideCollapsedLabel,
    onFocus: (event: React.FocusEvent<HTMLElement>) => showCollapsedLabel(event, label),
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hideCollapsedLabel();
    },
  });

  const renderNavItem = (item: NavigationItem) => {
    const label = t(item.label);
    return (
      <div key={item.path} className="group/nav-item relative" {...collapsedLabelHandlers(item.label)}>
        <NavLink
          to={item.path}
          onClick={onClose}
          aria-label={isCollapsed ? label : undefined}
          title={isCollapsed ? label : undefined}
          className={({ isActive }) => clsx(
            'group relative flex min-h-11 items-center rounded-control px-3 py-2.5 transition-[background-color,color,box-shadow] duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            isCollapsed && 'md:justify-center md:px-2',
            isActive
              ? 'bg-accent-soft font-semibold text-ink before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-accent'
              : 'text-muted hover:bg-inset hover:text-ink',
          )}
        >
          {({ isActive }) => (
            <>
              <span className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors',
                isActive ? 'bg-surface/80 text-accent' : 'bg-inset/70 text-muted group-hover:bg-surface group-hover:text-ink',
              )}>
                <item.icon aria-hidden="true" className="h-[18px] w-[18px]" />
              </span>
              <span className={clsx('min-w-0 truncate text-sm', isCollapsed && 'md:hidden')}>{label}</span>
            </>
          )}
        </NavLink>
      </div>
    );
  };

  React.useEffect(() => {
    if (moreActive) setStaffMoreOpen(true);
  }, [moreActive]);

  React.useEffect(() => {
    if ((isStaff || isClient) && isOpen && !isDesktop) setStaffMoreOpen(true);
  }, [isClient, isDesktop, isOpen, isStaff]);

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

  React.useEffect(() => {
    if (!isCollapsed || !isDesktop) setCollapsedLabel(null);
  }, [isCollapsed, isDesktop]);

  return (
    <>
      {isOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          className="fixed inset-0 z-20 bg-slate-950/35 backdrop-blur-sm transition-opacity md:hidden"
          onClick={onClose}
        />
      )}

      <nav
        ref={sidebarRef}
        tabIndex={-1}
        aria-label={t('Primary navigation')}
        aria-hidden={!isDesktop && !isOpen}
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-[17rem] flex-col border-r border-line/80 bg-surface text-ink shadow-float transition-transform duration-160 ease-out md:static md:translate-x-0 md:shadow-none',
          isCollapsed && 'md:w-20',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className={clsx('flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-line/70 px-5', isCollapsed && 'md:justify-center md:px-2')}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent text-sm font-semibold tracking-[-0.03em] text-white shadow-[0_10px_24px_-16px_rgb(var(--calm-accent)/0.9)]">
            AT
          </div>
          <div className={clsx('min-w-0', isCollapsed && 'md:hidden')}>
            <div className="font-sans text-lg font-semibold tracking-[-0.03em] text-ink">AiTask</div>
            <p className="text-[11px] font-medium text-muted">{t(isClient ? 'Client workspace' : 'Operations workspace')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close navigation menu')}
            title={t('Close navigation menu')}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:hidden"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className={clsx('calm-eyebrow mb-3 px-3', isCollapsed && 'md:sr-only')}>{t('Workspace')}</p>
          <div className="space-y-1">{primary.map(renderNavItem)}</div>
          {(isStaff || isClient) && visibleSecondary.length > 0 && (
            <div className="pt-3">
              <button
                type="button"
                onClick={() => setStaffMoreOpen(value => !value)}
                aria-expanded={staffMoreOpen}
                aria-controls="staff-more-menu"
                aria-label={isCollapsed ? t('More') : undefined}
                title={isCollapsed ? t('More') : undefined}
                {...collapsedLabelHandlers('More')}
                className={clsx(
                  'group relative hidden min-h-11 w-full items-center rounded-control px-3 py-2.5 transition-[background-color,color,box-shadow] duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface md:flex',
                  isCollapsed && 'md:justify-center md:px-2',
                  moreActive ? 'bg-accent-soft font-semibold text-ink before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-accent' : 'text-muted hover:bg-inset hover:text-ink',
                )}
              >
                <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-control', moreActive ? 'bg-surface/80 text-accent' : 'bg-inset/70 text-muted group-hover:bg-surface group-hover:text-ink')}>
                  <MoreHorizontal aria-hidden="true" className="h-[18px] w-[18px]" />
                </span>
                <span className={clsx('flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm', isCollapsed && 'md:hidden')}>
                  <span>{t('More')}</span>
                  <ChevronDown aria-hidden="true" className={clsx('h-4 w-4 transition-transform', staffMoreOpen && 'rotate-180')} />
                </span>
              </button>
              <div className="mb-2 mt-3 px-3 md:hidden">
                <p className="calm-eyebrow">{t('More destinations')}</p>
              </div>
              <div id="staff-more-menu" hidden={isDesktop && !staffMoreOpen} className={clsx('mt-1 space-y-1', !isCollapsed && 'ml-4 border-l border-line pl-2', 'md:mt-2')}>
                {isStaff && canCreateTasks(currentUser, rolePermissions) && (
                  <div className="group/nav-item relative" {...collapsedLabelHandlers('Create task')}>
                    <button
                      type="button"
                      onClick={() => { setCreateTaskModalOpen(true); onClose(); }}
                      aria-label={isCollapsed ? t('Create task') : undefined}
                      title={isCollapsed ? t('Create task') : undefined}
                      className={clsx('group flex min-h-11 w-full items-center rounded-control px-3 py-2.5 text-accent transition-[background-color,color,box-shadow] duration-160 hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface', isCollapsed && 'md:justify-center md:px-2')}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"><Plus aria-hidden="true" className="h-[18px] w-[18px]" /></span>
                      <span className={clsx('min-w-0 truncate text-left text-sm font-semibold', isCollapsed && 'md:hidden')}>{t('Create task')}</span>
                    </button>
                  </div>
                )}
                {visibleSecondary.map(renderNavItem)}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1 border-t border-line/70 p-3">
          <div className="group/nav-item relative" {...collapsedLabelHandlers('Logout')}>
            <button
              type="button"
              onClick={handleLogout}
              title={isCollapsed ? t('Logout') : undefined}
              aria-label={isCollapsed ? t('Logout') : undefined}
              className={clsx('group relative flex min-h-11 w-full items-center rounded-control px-3 py-2.5 text-red-700 transition-[background-color,color,box-shadow] duration-160 hover:bg-red-50 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface', isCollapsed && 'md:justify-center md:px-2')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-red-50 text-red-700"><LogOut aria-hidden="true" className="h-[18px] w-[18px]" /></span>
              <span className={clsx('min-w-0 truncate text-sm font-medium', isCollapsed && 'md:hidden')}>{t('Logout')}</span>
            </button>
          </div>
          {footer.map(renderNavItem)}
          <button
            type="button"
            onClick={onToggleCollapsed}
            {...collapsedLabelHandlers(isCollapsed ? 'Expand navigation' : 'Collapse navigation')}
            className="group relative hidden min-h-11 w-full items-center justify-center rounded-control text-muted transition-[background-color,color,box-shadow] duration-160 hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface md:flex"
            aria-label={t(isCollapsed ? 'Expand navigation' : 'Collapse navigation')}
            title={t(isCollapsed ? 'Expand navigation' : 'Collapse navigation')}
          >
            {isCollapsed ? <PanelLeftOpen aria-hidden="true" className="h-[19px] w-[19px]" /> : <><PanelLeftClose aria-hidden="true" className="mr-3 h-[19px] w-[19px]" /><span className="text-sm font-medium">{t('Collapse')}</span></>}
          </button>
        </div>
      </nav>
      {isCollapsed && isDesktop && collapsedLabel && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[100] -translate-y-1/2 whitespace-nowrap rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-float"
          style={{ top: collapsedLabel.top, left: collapsedLabel.left }}
        >
          {t(collapsedLabel.label)}
        </span>,
        document.body,
      )}
    </>
  );
};

export default Sidebar;
