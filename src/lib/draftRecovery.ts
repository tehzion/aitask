const PREFIX = 'aitask:draft-recovery:v1:';
const MAX_AGE = 24 * 60 * 60 * 1000;
export type RecoveredDraft<T> = { baseline: T; value: T; updatedAt: number; storageKey?: string };
let tabId: string | undefined;
const currentTab = () => {
  if (tabId) return tabId;
  try { tabId = sessionStorage.getItem('aitask:draft-tab') || crypto.randomUUID(); sessionStorage.setItem('aitask:draft-tab', tabId); }
  catch { tabId = 'current-tab'; }
  return tabId;
};
const formPrefix = (account: string, form: string) => `${PREFIX}${encodeURIComponent(account)}:${encodeURIComponent(form)}:`;
const keyFor = (account: string, form: string) => `${formPrefix(account, form)}${currentTab()}`;
export const readRecoveredDraft = <T,>(account: string, form: string): RecoveredDraft<T> | null => {
  try {
    const ownKey = keyFor(account, form);
    const keys = Object.keys(localStorage).filter(key => key.startsWith(formPrefix(account, form)));
    const entries: RecoveredDraft<T>[] = [];
    for (const key of keys) {
      try {
        const entry = JSON.parse(localStorage.getItem(key) || 'null');
        if (!entry || !Number.isFinite(entry.updatedAt) || Date.now() - entry.updatedAt > MAX_AGE || entry.updatedAt > Date.now() || !entry.value || !entry.baseline) { localStorage.removeItem(key); continue; }
        entries.push({ ...entry, storageKey: key });
      } catch { localStorage.removeItem(key); }
    }
    return entries.find(entry => entry.storageKey === ownKey) || entries.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  } catch { return null; }
};
export const writeRecoveredDraft = <T,>(account: string, form: string, baseline: T, value: T) => {
  try { localStorage.setItem(keyFor(account, form), JSON.stringify({ baseline, value, updatedAt: Date.now() })); return true; }
  catch { return false; }
};
export const removeRecoveredDraft = (account: string, form: string, recoveredKey?: string) => {
  try { localStorage.removeItem(keyFor(account, form)); if (recoveredKey?.startsWith(formPrefix(account, form))) localStorage.removeItem(recoveredKey); } catch { /* optional browser storage */ }
};
export const clearRecoveredDrafts = (account: string) => {
  try {
    const prefix = `${PREFIX}${encodeURIComponent(account)}:`;
    Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key));
  } catch { /* optional browser storage */ }
};
