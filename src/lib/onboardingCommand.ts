// Retain only the operation identity and non-secret payload fingerprint.
// Passwords remain in the form, never in this journal.
const prefix = 'aitask:onboarding-command';
const memory = new Map<string, string>();
export const onboardingRequestKey = async (authUserId: string, payload: Record<string, unknown>) => {
  const safe = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'password' && key !== 'commandId').sort(([a], [b]) => a.localeCompare(b)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(safe)));
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}:${authUserId}:${hash}`;
};
export const pendingOnboardingCommand = (key: string): string | undefined => {
  try { return memory.get(key) || window.sessionStorage.getItem(key) || undefined; } catch { return memory.get(key); }
};
export const retainOnboardingCommand = (key: string): string => {
  const id = pendingOnboardingCommand(key) || crypto.randomUUID();
  memory.set(key, id);
  try { window.sessionStorage.setItem(key, id); } catch { /* Memory still supports same-tab retry. */ }
  return id;
};
export const clearOnboardingCommand = (key: string) => {
  memory.delete(key);
  try { window.sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
};

// A confirmed cancellation releases every same-account fingerprint that still
// refers to this intent, including a draft entered with different email casing.
export const clearOnboardingCommandId = (authUserId: string, commandId: string) => {
  const accountPrefix = `${prefix}:${authUserId}:`;
  for (const [key, id] of memory) if (key.startsWith(accountPrefix) && id === commandId) memory.delete(key);
  try {
    const storage = window.sessionStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key?.startsWith(accountPrefix) && storage.getItem(key) === commandId) storage.removeItem(key);
  } catch { /* The in-memory intent is still released without storage access. */ }
};
