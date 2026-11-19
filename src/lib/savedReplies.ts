/** Reviewer quick replies: a few built-ins plus ones a reviewer saves for themselves. */
export const BUILT_IN_REPLIES = [
  'Please check the colours against the brand guide.',
  'There are wording or spelling mistakes to fix.',
  'The logo or brand assets are not the latest ones.',
  'The size or format is not what was requested.',
  'Almost there: only small tweaks are left.',
] as const;

export const MAX_SAVED_REPLIES = 8;
export const MAX_REPLY_LENGTH = 300;

export const savedRepliesKey = (userId: string) => `aitask:review-replies:${userId}`;

/** Tolerates empty, corrupted or hand-edited storage. */
export const parseSavedReplies = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const replies: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const text = item.trim().slice(0, MAX_REPLY_LENGTH);
      if (text && !seen.has(text)) { seen.add(text); replies.push(text); }
    }
    return replies.slice(0, MAX_SAVED_REPLIES);
  } catch { return []; }
};

/** Newest first; a repeat moves to the front; the oldest drops past the limit. */
export const addSavedReply = (replies: readonly string[], text: string): string[] => {
  const reply = text.trim().slice(0, MAX_REPLY_LENGTH);
  if (!reply || (BUILT_IN_REPLIES as readonly string[]).includes(reply)) return [...replies];
  return [reply, ...replies.filter(item => item !== reply)].slice(0, MAX_SAVED_REPLIES);
};

export const removeSavedReply = (replies: readonly string[], text: string): string[] => replies.filter(item => item !== text);

/** Appends a reply on its own line without losing what is already typed. */
export const insertReply = (current: string, reply: string, maxLength = 2000): string => {
  if (current.includes(reply)) return current;
  const base = current.trim() ? (current.endsWith('\n') ? current : `${current}\n`) : '';
  return `${base}${reply}`.slice(0, maxLength);
};
