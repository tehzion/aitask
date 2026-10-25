import { describe, expect, it } from 'vitest';
import { FEEDBACK_DEADLINE_ISO, isFeedbackLate, parseFeedbackRole, visibleFeedbackQuestions } from './feedback';

describe('feedback configuration', () => {
  it('preselects supported roles safely', () => {
    expect(parseFeedbackRole('Client')).toBe('Client');
    expect(parseFeedbackRole('super-admin')).toBe('Super Admin');
    expect(parseFeedbackRole('unknown')).toBe('Staff');
  });

  it('shows Super Admin checks only to the selected Super Admin role', () => {
    expect(visibleFeedbackQuestions('Staff').some(item => item.section === 'super_admin')).toBe(false);
    expect(visibleFeedbackQuestions('Super Admin').some(item => item.section === 'super_admin')).toBe(true);
  });

  it('uses the announced 30 July 2026 deadline', () => {
    expect(FEEDBACK_DEADLINE_ISO).toBe('2026-07-30T15:59:59.999Z');
    expect(isFeedbackLate(new Date('2026-07-30T15:00:00Z'))).toBe(false);
    expect(isFeedbackLate(new Date('2026-07-30T16:00:00Z'))).toBe(true);
  });
});

