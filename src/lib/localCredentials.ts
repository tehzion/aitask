import { DEFAULT_USER_PASSWORD, hasDefaultPassword } from './auth';

const CREDENTIAL_STORAGE_KEY = 'aitask-local-credentials-v1';
export const PBKDF2_ITERATIONS = 310_000;

export type Pbkdf2Credential = {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  hash: string;
};

type StoredCredential = Pbkdf2Credential | string;
type CredentialMap = Record<string, StoredCredential>;

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const bytesToHex = (bytes: Uint8Array) => (
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
);

const hexToBytes = (value: string) => {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return Uint8Array.from(value.match(/.{2}/g) || [], pair => Number.parseInt(pair, 16));
};

const isPbkdf2Credential = (value: unknown): value is Pbkdf2Credential => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const credential = value as Partial<Pbkdf2Credential>;
  return credential.algorithm === 'PBKDF2-SHA256' &&
    Number.isInteger(credential.iterations) &&
    Number(credential.iterations) >= 100_000 &&
    Number(credential.iterations) <= 1_000_000 &&
    typeof credential.salt === 'string' &&
    Boolean(hexToBytes(credential.salt)) &&
    typeof credential.hash === 'string' &&
    Boolean(hexToBytes(credential.hash));
};

const readCredentials = (): CredentialMap => {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, StoredCredential] => (
        typeof entry[1] === 'string' || isPbkdf2Credential(entry[1])
      ))
    );
  } catch {
    return {};
  }
};

const writeCredentials = (credentials: CredentialMap) => {
  if (!canUseStorage()) return false;

  try {
    window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(credentials));
    return true;
  } catch {
    return false;
  }
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
};

const digest = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoded));
};

const derivePasswordHash = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
};

export const createPasswordCredential = async (password: string): Promise<Pbkdf2Credential> => {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
  return {
    algorithm: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    hash: bytesToHex(hash),
  };
};

export const verifyPasswordCredential = async (password: string, credential: Pbkdf2Credential) => {
  if (!isPbkdf2Credential(credential)) return false;
  const salt = hexToBytes(credential.salt);
  const expected = hexToBytes(credential.hash);
  if (!salt || !expected) return false;
  const attempt = await derivePasswordHash(password, salt, credential.iterations);
  return constantTimeEqual(attempt, expected);
};

export const getLocalUserPassword = (userId: string) => readCredentials()[userId];

export const setLocalUserPassword = async (userId: string, password: string) => {
  if (!password || hasDefaultPassword(password)) {
    const credentials = readCredentials();
    delete credentials[userId];
    if (!writeCredentials(credentials)) {
      throw new Error('This browser could not update local credential storage.');
    }
    return;
  }

  const credential = await createPasswordCredential(password);
  if (!writeCredentials({ ...readCredentials(), [userId]: credential })) {
    throw new Error('This browser could not save the new credential.');
  }
};

const verifyLegacyCredential = async (password: string, credential: string) => {
  const attempt = await digest(password);
  const legacyHash = /^[0-9a-f]{64}$/i.test(credential)
    ? hexToBytes(credential)
    : await digest(credential);
  return Boolean(legacyHash && constantTimeEqual(attempt, legacyHash));
};

export const verifyLocalUserPassword = async (
  userId: string,
  passwordToVerify: string,
  options: { allowDefaultPassword?: boolean } = {}
): Promise<boolean> => {
  const storedCredential = getLocalUserPassword(userId);
  if (!storedCredential) {
    if (!options.allowDefaultPassword) return false;
    const [attempt, expected] = await Promise.all([
      digest(passwordToVerify),
      digest(DEFAULT_USER_PASSWORD),
    ]);
    return constantTimeEqual(attempt, expected);
  }

  if (isPbkdf2Credential(storedCredential)) {
    return verifyPasswordCredential(passwordToVerify, storedCredential);
  }

  const isValid = await verifyLegacyCredential(passwordToVerify, storedCredential);
  if (isValid) await setLocalUserPassword(userId, passwordToVerify);
  return isValid;
};
