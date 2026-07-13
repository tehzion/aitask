import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPasswordCredential,
  PBKDF2_ITERATIONS,
  setLocalUserPassword,
  verifyLocalUserPassword,
  verifyPasswordCredential,
} from './localCredentials';

const CREDENTIAL_STORAGE_KEY = 'aitask-local-credentials-v1';

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
};

const sha256Hex = async (value: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
};

describe('local credential hardening', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: makeStorage() });
  });

  it('uses a unique salt and rejects the wrong password', async () => {
    const first = await createPasswordCredential('a-strong-private-password');
    const second = await createPasswordCredential('a-strong-private-password');

    expect(first.algorithm).toBe('PBKDF2-SHA256');
    expect(first.iterations).toBe(PBKDF2_ITERATIONS);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPasswordCredential('a-strong-private-password', first)).resolves.toBe(true);
    await expect(verifyPasswordCredential('wrong-password', first)).resolves.toBe(false);
  });

  it('stores no plaintext password', async () => {
    const password = 'another-strong-private-password';
    await setLocalUserPassword('user-1', password);

    const raw = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY) || '';
    expect(raw).not.toContain(password);
    expect(JSON.parse(raw)['user-1']).toMatchObject({ algorithm: 'PBKDF2-SHA256' });
  });

  it('fails closed without a credential unless local demo fallback is explicit', async () => {
    await expect(verifyLocalUserPassword('fresh-browser', 'password123')).resolves.toBe(false);
    await expect(verifyLocalUserPassword('fresh-browser', 'password123', {
      allowDefaultPassword: true,
    })).resolves.toBe(true);
  });

  it('upgrades a valid legacy SHA-256 credential after login', async () => {
    const password = 'legacy-private-password';
    window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify({
      'legacy-user': await sha256Hex(password),
    }));

    await expect(verifyLocalUserPassword('legacy-user', password)).resolves.toBe(true);
    expect(JSON.parse(window.localStorage.getItem(CREDENTIAL_STORAGE_KEY) || '{}')['legacy-user']).toMatchObject({
      algorithm: 'PBKDF2-SHA256',
    });
  });

  it('does not report success when credential storage rejects a write', async () => {
    const storage = makeStorage();
    storage.setItem = () => {
      throw new Error('quota exceeded');
    };
    vi.stubGlobal('window', { localStorage: storage });

    await expect(setLocalUserPassword('user-2', 'a-strong-private-password')).rejects.toThrow(
      'could not save the new credential'
    );
  });
});
