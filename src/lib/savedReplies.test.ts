import { describe, expect, it } from 'vitest';
import { addSavedReply, BUILT_IN_REPLIES, insertReply, MAX_SAVED_REPLIES, parseSavedReplies, removeSavedReply } from './savedReplies';

describe('saved replies', () => {
  it('survives empty or corrupted storage', () => {
    expect(parseSavedReplies(null)).toEqual([]);
    expect(parseSavedReplies('not json')).toEqual([]);
    expect(parseSavedReplies('{"a":1}')).toEqual([]);
    expect(parseSavedReplies('["a", 3, "", "a", " b "]')).toEqual(['a', 'b']);
  });

  it('adds newest first, moves repeats up, trims, and caps the list', () => {
    expect(addSavedReply(['one'], '  two ')).toEqual(['two', 'one']);
    expect(addSavedReply(['one', 'two'], 'two')).toEqual(['two', 'one']);
    const many = Array.from({ length: MAX_SAVED_REPLIES }, (_, index) => `r${index}`);
    const next = addSavedReply(many, 'fresh');
    expect(next).toHaveLength(MAX_SAVED_REPLIES);
    expect(next[0]).toBe('fresh');
    expect(next).not.toContain(`r${MAX_SAVED_REPLIES - 1}`);
  });

  it('ignores blanks and built-ins, and removes by text', () => {
    expect(addSavedReply(['one'], '   ')).toEqual(['one']);
    expect(addSavedReply(['one'], BUILT_IN_REPLIES[0])).toEqual(['one']);
    expect(removeSavedReply(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('inserts a reply on its own line without losing text or duplicating', () => {
    expect(insertReply('', 'Fix colours')).toBe('Fix colours');
    expect(insertReply('Logo is off', 'Fix colours')).toBe('Logo is off\nFix colours');
    expect(insertReply('Fix colours', 'Fix colours')).toBe('Fix colours');
    expect(insertReply('x'.repeat(10), 'abcdef', 12)).toHaveLength(12);
  });
});
