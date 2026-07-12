import { DEFAULT_USER_PASSWORD, hasDefaultPassword } from './auth';

const CREDENTIAL_STORAGE_KEY = 'aitask-local-credentials-v1';

type CredentialMap = Record<string, string>;

// Compact, standard, dependency-free synchronous SHA-256 implementation
function sha256(str: string): string {
  const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isPrime: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isPrime[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isPrime[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  const utf8 = unescape(encodeURIComponent(str));
  const words: number[] = [];
  const asciiLength = utf8.length * 8;
  
  let temp = utf8 + '\x80';
  while ((temp.length % 64) !== 56) {
    temp += '\x00';
  }
  
  for (let i = 0; i < temp.length; i++) {
    words[i >> 2] |= temp.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  
  words.push((asciiLength / maxWord) | 0);
  words.push(asciiLength | 0);
  
  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);
    
    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15];
        const s0 = (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3));
        const w2 = w[i - 2];
        const s1 = (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10));
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ((hash[4] & hash[5]) ^ (~hash[4] & hash[6])) + k[i] + w[i]) | 0;
      const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + ((hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]))) | 0;
      
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.length = 8;
    }
    
    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  let result = '';
  for (let i = 0; i < 8; i++) {
    let hex = (hash[i] >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    result += hex;
  }
  return result;
}

export const hashPassword = (password: string): string => {
  return sha256(password);
};

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readCredentials = (): CredentialMap => {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const credentials = parsed as CredentialMap;
      let migrated = false;
      const isSha256 = /^[0-9a-f]{64}$/i;
      
      for (const key of Object.keys(credentials)) {
        const pwd = credentials[key];
        if (pwd && !isSha256.test(pwd)) {
          credentials[key] = sha256(pwd);
          migrated = true;
        }
      }
      
      if (migrated) {
        writeCredentials(credentials);
      }
      return credentials;
    }
    return {};
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
    credentials[userId] = hashPassword(password);
  }

  writeCredentials(credentials);
};

export const verifyLocalUserPassword = (userId: string, passwordToVerify: string): boolean => {
  const hashedAttempt = hashPassword(passwordToVerify);
  const storedHash = getLocalUserPassword(userId);
  if (!storedHash) {
    // Compare attempt hash with default password hash
    return hashedAttempt === hashPassword(DEFAULT_USER_PASSWORD);
  }
  return hashedAttempt === storedHash;
};
