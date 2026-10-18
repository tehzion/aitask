import { afterEach, describe, expect, it, vi } from 'vitest';

const remoteState = vi.hoisted(() => ({ secure: false, failWrite: false }));

vi.mock('./supabaseClient', () => ({
  shouldUseSecureSupabase: () => remoteState.secure,
  supabase: {
    from: () => ({
      upsert: async () => ({ error: remoteState.failWrite ? { message: 'Network request failed.' } : null }),
    }),
  },
}));
import { clearTutorialFeedbackMemory, getTutorialFeedback, saveTutorialFeedback } from './tutorialFeedback';

afterEach(() => {
  clearTutorialFeedbackMemory();
  remoteState.secure = false;
  remoteState.failWrite = false;
});

describe('tutorial feedback', () => {
  it('stores one private local fallback record per user and tutorial', async () => {
    const first = await saveTutorialFeedback({ userId: 'feedback-user-a', tutorialId: 'create-task', helpful: false, reason: 'unclear', comment: 'The assignment step needs more context.', locale: 'en' });
    expect(first.ok).toBe(true);
    expect((await getTutorialFeedback('feedback-user-a', 'create-task'))?.reason).toBe('unclear');
    expect(await getTutorialFeedback('feedback-user-b', 'create-task')).toBeNull();

    const replacement = await saveTutorialFeedback({ userId: 'feedback-user-a', tutorialId: 'create-task', helpful: true, locale: 'zh' });
    expect(replacement.ok).toBe(true);
    expect((await getTutorialFeedback('feedback-user-a', 'create-task'))?.helpful).toBe(true);
    expect((await getTutorialFeedback('feedback-user-a', 'create-task'))?.comment).toBe('');
  });

  it('rejects invalid or oversized feedback before persistence', async () => {
    expect((await saveTutorialFeedback({ userId: 'feedback-user-a', tutorialId: 'not valid', helpful: true, locale: 'en' })).ok).toBe(false);
    expect((await saveTutorialFeedback({ userId: 'feedback-user-a', tutorialId: 'create-task', helpful: false, reason: 'unclear', comment: 'x'.repeat(2001), locale: 'en' })).ok).toBe(false);
  });

  it('reports a secure-backend write failure without presenting feedback as saved', async () => {
    remoteState.secure = true;
    remoteState.failWrite = true;

    const result = await saveTutorialFeedback({ userId: 'feedback-user-a', tutorialId: 'create-task', helpful: true, locale: 'en' });

    expect(result).toEqual({ ok: false, error: 'Unable to save tutorial feedback.' });
  });
});
