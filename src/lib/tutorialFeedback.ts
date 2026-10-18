import type { AppLocale } from './i18n';
import { shouldUseSecureSupabase, supabase } from './supabaseClient';
import { SECURE_WORKSPACE_ID } from './secureWorkspace';

export type TutorialFeedbackReason = 'unclear' | 'different_interface' | 'not_solved' | 'missing_info' | 'other';

export interface TutorialFeedbackRecord {
  tutorialId: string;
  helpful: boolean;
  reason?: TutorialFeedbackReason;
  comment: string;
  locale: AppLocale;
  updatedAt: string;
}

export interface TutorialFeedbackInput {
  userId: string;
  tutorialId: string;
  helpful: boolean;
  reason?: TutorialFeedbackReason;
  comment?: string;
  locale: AppLocale;
}

export interface TutorialFeedbackResult {
  ok: boolean;
  record?: TutorialFeedbackRecord;
  error?: string;
}

const STORAGE_KEY = 'aitask:tutorial-feedback:v1';
const MAX_COMMENT_LENGTH = 2000;
const allowedReasons = new Set<TutorialFeedbackReason>(['unclear', 'different_interface', 'not_solved', 'missing_info', 'other']);
const memoryRecords = new Map<string, Record<string, TutorialFeedbackRecord>>();

const readRecords = (): Record<string, Record<string, TutorialFeedbackRecord>> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, TutorialFeedbackRecord>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeLocalRecord = (userId: string, record: TutorialFeedbackRecord) => {
  const next = { ...(memoryRecords.get(userId) || {}), [record.tutorialId]: record };
  memoryRecords.set(userId, next);
  try {
    const records = readRecords();
    records[userId] = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // The in-memory record still prevents duplicate submissions in this session.
  }
};

const readLocalRecord = (userId: string, tutorialId: string) => {
  const memory = memoryRecords.get(userId);
  if (memory?.[tutorialId]) return memory[tutorialId];
  const record = readRecords()[userId]?.[tutorialId];
  if (!record || typeof record !== 'object') return null;
  memoryRecords.set(userId, { ...(memory || {}), [tutorialId]: record });
  return record;
};

const validate = (input: TutorialFeedbackInput) => {
  const tutorialId = input.tutorialId.trim();
  const comment = (input.comment || '').trim();
  if (!input.userId.trim() || !tutorialId || !/^[a-z0-9][a-z0-9-]*$/.test(tutorialId)) return 'Unable to save tutorial feedback.';
  if (comment.length > MAX_COMMENT_LENGTH) return 'Feedback is too long.';
  if (input.reason && !allowedReasons.has(input.reason)) return 'Choose a valid feedback reason.';
  return null;
};

const toRecord = (row: { tutorial_id: string; helpful: boolean; reason: TutorialFeedbackReason | null; comment: string; locale: AppLocale; updated_at: string }): TutorialFeedbackRecord => ({
  tutorialId: row.tutorial_id,
  helpful: row.helpful,
  ...(row.reason ? { reason: row.reason } : {}),
  comment: row.comment || '',
  locale: row.locale === 'zh' ? 'zh' : 'en',
  updatedAt: row.updated_at || new Date().toISOString(),
});

export const getTutorialFeedback = async (userId: string | undefined, tutorialId: string): Promise<TutorialFeedbackRecord | null> => {
  if (!userId) return null;
  if (!shouldUseSecureSupabase()) return readLocalRecord(userId, tutorialId);
  const { data, error } = await supabase
    .from('aitask_tutorial_feedback')
    .select('tutorial_id, helpful, reason, comment, locale, updated_at')
    .eq('workspace_id', SECURE_WORKSPACE_ID)
    .eq('tutorial_id', tutorialId)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Unable to load tutorial feedback.');
  return data ? toRecord(data) : null;
};

export const saveTutorialFeedback = async (input: TutorialFeedbackInput): Promise<TutorialFeedbackResult> => {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };
  const tutorialId = input.tutorialId.trim();
  const comment = (input.comment || '').trim();
  const updatedAt = new Date().toISOString();
  const record: TutorialFeedbackRecord = {
    tutorialId,
    helpful: input.helpful,
    ...(input.reason ? { reason: input.reason } : {}),
    comment,
    locale: input.locale === 'zh' ? 'zh' : 'en',
    updatedAt,
  };
  if (!shouldUseSecureSupabase()) {
    writeLocalRecord(input.userId, record);
    return { ok: true, record };
  }

  const { error } = await supabase.from('aitask_tutorial_feedback').upsert({
    workspace_id: SECURE_WORKSPACE_ID,
    tutorial_id: tutorialId,
    helpful: input.helpful,
    reason: input.reason || null,
    comment,
    locale: input.locale === 'zh' ? 'zh' : 'en',
    updated_at: updatedAt,
  }, { onConflict: 'workspace_id,auth_user_id,tutorial_id' });
  if (error) return { ok: false, error: 'Unable to save tutorial feedback.' };
  return { ok: true, record };
};

export const clearTutorialFeedbackMemory = () => memoryRecords.clear();
