import { describe, expect, it } from 'vitest';
import { applyBriefPrompts, getBriefPrompts } from './briefTemplates';

describe('brief templates', () => {
  it('has prompts for each preset service and a generic fallback', () => {
    expect(getBriefPrompts('Design')).toContain('Colours and fonts');
    expect(getBriefPrompts('Something custom')).toEqual(['Goal', 'Audience', 'Items that must be included']);
    expect(getBriefPrompts(undefined)).toContain('Goal');
  });

  it('adds missing prompts as empty lines', () => {
    expect(applyBriefPrompts('', ['Length', 'Aspect ratio'])).toBe('Length: \nAspect ratio: ');
  });

  it('keeps existing text and skips prompts already present, ignoring case', () => {
    expect(applyBriefPrompts('length: 30s', ['Length', 'Aspect ratio'])).toBe('length: 30s\nAspect ratio: ');
    expect(applyBriefPrompts('Length: 30s\nAspect ratio: 9:16', ['Length', 'Aspect ratio'])).toBe('Length: 30s\nAspect ratio: 9:16');
  });

  it('does not double a trailing newline and respects the length limit', () => {
    expect(applyBriefPrompts('Notes\n', ['Goal'])).toBe('Notes\nGoal: ');
    expect(applyBriefPrompts('x'.repeat(995), ['Goal', 'Audience'], 1000)).toHaveLength(1000);
  });
});
