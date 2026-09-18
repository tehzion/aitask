import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  PackageCheck,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CustomRole, User } from '../types';
import { canAccessPath, getVisibleNavigation } from './access';

export type NavigationItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

export type NavigationSections = {
  primary: NavigationItem[];
  secondary: NavigationItem[];
  footer: NavigationItem[];
};

const routeIsVisible = (
  user: User | null | undefined,
  rolePermissions: CustomRole[],
  path: string,
) => path === '/notifications' || path.startsWith('/clients/') || canAccessPath(user, path, rolePermissions);

const filterVisible = (
  user: User | null | undefined,
  rolePermissions: CustomRole[],
  items: NavigationItem[],
) => items.filter(item => routeIsVisible(user, rolePermissions, item.path));

const staffPrimary: NavigationItem[] = [
  { path: '/', label: 'My work', icon: LayoutDashboard },
  { path: '/calendar', label: 'Schedule', icon: CalendarDays },
  { path: '/notifications', label: 'Inbox', icon: Bell },
];

const staffSecondary: NavigationItem[] = [
  { path: '/tasks', label: 'All work', icon: CheckSquare },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/projects', label: 'Companies', icon: FolderKanban },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const clientPrimary: NavigationItem[] = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/clients', label: 'Deliveries', icon: Users },
  { path: '/notifications', label: 'Inbox', icon: Bell },
];

const createClientSecondary = (clientProfilePath?: string): NavigationItem[] => [
  { path: '/calendar', label: 'Schedule', icon: CalendarDays },
  ...(clientProfilePath ? [{ path: clientProfilePath, label: 'Services', icon: PackageCheck }] : []),
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const generalMobilePrimary: NavigationItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/notifications', label: 'Inbox', icon: Bell },
];

const navIcons = {
  Dashboard: LayoutDashboard,
  Calendar: CalendarDays,
  Clients: Users,
  Companies: FolderKanban,
  Reports: BarChart3,
  Approvals: UserPlus,
} as const;

export const getNavigationSections = (
  user: User | null | undefined,
  rolePermissions: CustomRole[] = [],
  clientProfilePath?: string,
): NavigationSections => {
  const isStaff = user?.role === 'Staff' || user?.role === 'HOD';
  const isClient = user?.role === 'Client';

  if (isStaff) {
    return {
      primary: filterVisible(user, rolePermissions, staffPrimary),
      secondary: filterVisible(user, rolePermissions, staffSecondary),
      footer: [],
    };
  }

  if (isClient) {
    return {
      primary: filterVisible(user, rolePermissions, clientPrimary),
      secondary: filterVisible(user, rolePermissions, createClientSecondary(clientProfilePath)),
      footer: [],
    };
  }

  return {
    primary: getVisibleNavigation(user, rolePermissions).map(item => ({
      ...item,
      icon: navIcons[item.label as keyof typeof navIcons],
    })),
    secondary: [],
    footer: filterVisible(user, rolePermissions, [{ path: '/settings', label: 'Settings', icon: Settings }]),
  };
};

export const getMobileNavigation = (
  user: User | null | undefined,
  rolePermissions: CustomRole[] = [],
  clientProfilePath?: string,
) => {
  const sections = getNavigationSections(user, rolePermissions, clientProfilePath);
  if (user?.role === 'Staff' || user?.role === 'HOD' || user?.role === 'Client') return sections.primary;
  return filterVisible(user, rolePermissions, generalMobilePrimary);
};
