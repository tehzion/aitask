import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  getSystemPrefersDark,
  getThemePreference,
  resolveTheme,
  saveThemePreference,
  THEME_CHANGE_EVENT,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme';

export const useColorTheme = () => {
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => (
    resolveTheme(getThemePreference(), getSystemPrefersDark())
  ));

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolvedTheme(saveThemePreference(next));
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setPreference]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (preference === 'system') setResolvedTheme(applyTheme('system'));
    };
    const handleThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ preference: ThemePreference; resolved: ResolvedTheme }>).detail;
      if (!detail) return;
      setPreferenceState(detail.preference);
      setResolvedTheme(detail.resolved);
    };

    media.addEventListener('change', handleSystemChange);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => {
      media.removeEventListener('change', handleSystemChange);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, [preference]);

  return { preference, resolvedTheme, setPreference, toggleTheme };
};
