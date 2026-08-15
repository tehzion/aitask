import { describe, expect, it } from 'vitest';
import { getNavigationShortcut, NAVIGATION_SHORTCUTS } from './keyboard';

describe('keyboard navigation shortcuts', () => {
  it('keeps every page key unique', () => {
    const keys = NAVIGATION_SHORTCUTS.map(shortcut => shortcut.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches page keys without case sensitivity', () => {
    expect(getNavigationShortcut('T')).toMatchObject({ label: 'Tasks', path: '/tasks' });
    expect(getNavigationShortcut('x')).toBeUndefined();
  });
});
