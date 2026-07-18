export type PasswordSetupMode = 'invite' | 'recovery';

export const PASSWORD_SETUP_SESSION_KEY = 'aitask:password-setup-mode';

const validModes = new Set<PasswordSetupMode>(['invite', 'recovery']);

export const passwordSetupModeFromUrl = (value: string): PasswordSetupMode | null => {
  try {
    const parsed = new URL(value, 'https://aitask.invalid');
    const queryMode = parsed.searchParams.get('type');
    const hashMode = new URLSearchParams(parsed.hash.replace(/^#/, '')).get('type');
    const mode = (hashMode || queryMode || '').toLowerCase() as PasswordSetupMode;
    return validModes.has(mode) ? mode : null;
  } catch {
    return null;
  }
};

export const capturePasswordSetupMode = () => {
  if (typeof window === 'undefined') return null;
  const mode = passwordSetupModeFromUrl(window.location.href);
  if (!mode) return null;
  try {
    window.sessionStorage.setItem(PASSWORD_SETUP_SESSION_KEY, mode);
  } catch {
    return null;
  }
  return mode;
};

export const getPasswordSetupMode = (): PasswordSetupMode | null => {
  if (typeof window === 'undefined') return null;
  const captured = capturePasswordSetupMode();
  if (captured) return captured;
  try {
    const stored = window.sessionStorage.getItem(PASSWORD_SETUP_SESSION_KEY) as PasswordSetupMode | null;
    return stored && validModes.has(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const clearPasswordSetupMode = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PASSWORD_SETUP_SESSION_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
};

export const passwordSetupRedirectUrl = () => {
  if (typeof window === 'undefined') return '/account/password';
  return `${window.location.origin}/account/password`;
};
