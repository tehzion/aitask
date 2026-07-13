export const DEFAULT_USER_PASSWORD = 'password123';
export const PASSWORD_RESET_BYPASS_SESSION_PREFIX = 'aitask:password-reset-bypass:';

export const hasDefaultPassword = (password?: string) => password === DEFAULT_USER_PASSWORD;

const env = (key: string) => (import.meta.env[key] as string | undefined)?.trim() || '';

const isEnabled = (value: string) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const isDisabled = (value: string) => ['0', 'false', 'no', 'off'].includes(value.toLowerCase());

const isLocalHost = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

const HOSTED_BLOCKED_SEED_USER_IDS = new Set([
  'u-boss',
  'u-adminmojo',
  'u-admin',
  'u-staff',
  'u-finance',
  'u-client-urban',
]);

export const shouldShowDemoLogin = () => {
  const configured = env('VITE_AITASK_SHOW_DEMO_LOGIN');
  if (configured) {
    if (isEnabled(configured)) return true;
    if (isDisabled(configured)) return false;
  }

  return isLocalHost();
};

export const canLoginWithSeedAccount = (userId: string) => (
  shouldShowDemoLogin() || !HOSTED_BLOCKED_SEED_USER_IDS.has(userId)
);

export const canUsePasswordResetBypass = () => {
  const configured = env('VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS');
  if (configured) {
    if (isEnabled(configured)) return true;
    if (isDisabled(configured)) return false;
  }

  return isLocalHost();
};

export const hasPasswordResetBypass = (userId?: string) => {
  if (!userId || !canUsePasswordResetBypass() || typeof window === 'undefined') return false;

  try {
    return window.sessionStorage.getItem(`${PASSWORD_RESET_BYPASS_SESSION_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
};

export const enablePasswordResetBypass = (userId?: string) => {
  if (!userId || !canUsePasswordResetBypass() || typeof window === 'undefined') return false;

  try {
    window.sessionStorage.setItem(`${PASSWORD_RESET_BYPASS_SESSION_PREFIX}${userId}`, '1');
    return true;
  } catch {
    return false;
  }
};
