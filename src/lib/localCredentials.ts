import { DEFAULT_USER_PASSWORD, hasDefaultPassword } from './auth';

const CREDENTIAL_STORAGE_KEY = 'aitask-local-credentials-v1';

type CredentialMap = Record<string, string>;

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readCredentials = (): CredentialMap => {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as CredentialMap
      : {};
  } catch {
    return {};
  }
};

const writeCredentials = (credentials: CredentialMap) => {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Mock-login credentials are best-effort local state until Supabase Auth replaces this path.
  }
};

export const getLocalUserPassword = (userId: string) => {
  return readCredentials()[userId];
};

export const setLocalUserPassword = (userId: string, password: string) => {
  const credentials = readCredentials();

  if (!password || hasDefaultPassword(password)) {
    delete credentials[userId];
  } else {
    credentials[userId] = password;
  }

  writeCredentials(credentials);
};

export const resolveLocalUserPassword = (userId: string) => {
  return getLocalUserPassword(userId) || DEFAULT_USER_PASSWORD;
};
