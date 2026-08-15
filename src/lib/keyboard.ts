export interface NavigationShortcut {
  key: string;
  label: string;
  path: string;
}

export const NAVIGATION_SHORTCUTS: NavigationShortcut[] = [
  { key: 'd', label: 'Dashboard', path: '/' },
  { key: 't', label: 'Tasks', path: '/tasks' },
  { key: 'c', label: 'Calendar', path: '/calendar' },
  { key: 'l', label: 'Clients', path: '/clients' },
  { key: 'p', label: 'Companies', path: '/projects' },
  { key: 'r', label: 'Reports', path: '/reports' },
  { key: 'a', label: 'Approvals', path: '/approvals' },
  { key: 's', label: 'Settings', path: '/settings' },
];

export const isEditableShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches('input, textarea, select, [contenteditable="true"], [role="textbox"]');
};

export const getNavigationShortcut = (key: string) => (
  NAVIGATION_SHORTCUTS.find(shortcut => shortcut.key === key.toLowerCase())
);
