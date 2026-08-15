export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'aitask-color-theme';
export const THEME_CHANGE_EVENT = 'aitask-theme-change';

export const isThemePreference = (value: unknown): value is ThemePreference => (
  value === 'light' || value === 'dark' || value === 'system'
);

export const resolveTheme = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme => (
  preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference
);

export const getThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const getSystemPrefersDark = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches
);

export const applyTheme = (preference: ThemePreference): ResolvedTheme => {
  const resolved = resolveTheme(preference, getSystemPrefersDark());
  if (typeof document === 'undefined') return resolved;

  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute('content', resolved === 'dark' ? '#0B1115' : '#176B5C');
  return resolved;
};

export const saveThemePreference = (preference: ThemePreference) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme changes should remain usable when storage is unavailable.
  }
  const resolved = applyTheme(preference);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference, resolved } }));
  return resolved;
};

export const initializeTheme = () => applyTheme(getThemePreference());
