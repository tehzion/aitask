import type { LoginFailureCode, LoginResult } from '../types';

const env = (key: string) => (import.meta.env[key] as string | undefined)?.trim() || '';

// Local demo credentials must never be emitted into hosted production bundles.
export const DEFAULT_USER_PASSWORD = import.meta.env.DEV
  ? env('VITE_AITASK_LOCAL_DEFAULT_PASSWORD') || 'password123'
  : '';
export const PASSWORD_RESET_BYPASS_SESSION_PREFIX = 'aitask:password-reset-bypass:';

export const hasDefaultPassword = (password?: string) => password === DEFAULT_USER_PASSWORD;

export const validateStaffSignupPassword = (password: string, confirmation: string) => {
  if (password.length < 12) return 'Use a password with at least 12 characters.';
  if (password !== confirmation) return 'Passwords do not match.';
  return '';
};

export const isValidRecoveryEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const classifyLoginFailure = (
  message: string,
  phase: 'authentication' | 'workspace' = 'authentication',
): LoginFailureCode => {
  if (/expired|jwt/i.test(message)) return 'session_expired';
  if (phase === 'workspace' && /not an AiTask workspace member|not linked|not approved/i.test(message)) {
    return 'account_unapproved_or_unlinked';
  }
  return phase === 'workspace' ? 'workspace_load_failed' : 'invalid_credentials';
};

export const loginFailure = (code: LoginFailureCode): LoginResult => {
  const messages: Record<LoginFailureCode, string> = {
    invalid_credentials: 'The email or password is incorrect. Check both and try again.',
    account_unapproved_or_unlinked: 'Your account is not approved or linked to an AiTask workspace. Ask Boss Koo to confirm your access.',
    session_expired: 'Your session has expired. Sign in again.',
    workspace_load_failed: 'Your password was accepted, but the workspace could not be loaded. Please try again shortly.',
  };
  return { ok: false, code, error: messages[code] };
};

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
  'u-client-urban',
  'u-operation-demo-local',
  'u-account-demo-local',
]);

export const shouldShowDemoLogin = () => {
  const configured = env('VITE_AITASK_SHOW_DEMO_LOGIN');
  if (configured) {
    if (isEnabled(configured)) return true;
    if (isDisabled(configured)) return false;
  }

  // Fail closed: demo login only appears when the flag is explicitly enabled
  // (or during local development).
  return import.meta.env.DEV || isLocalHost();
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

  return import.meta.env.DEV && isLocalHost();
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

export const clearPasswordResetBypass = (userId?: string) => {
  if (typeof window === 'undefined') return;

  try {
    if (userId) {
      window.sessionStorage.removeItem(`${PASSWORD_RESET_BYPASS_SESSION_PREFIX}${userId}`);
      return;
    }
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PASSWORD_RESET_BYPASS_SESSION_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    /* session storage unavailable */
  }
};
