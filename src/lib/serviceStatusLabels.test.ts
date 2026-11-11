import { describe, expect, it } from 'vitest';
import { cycleStatusLabel, planStatusLabel } from './serviceStatusLabels';

describe('service status labels', () => {
  it('labels plan statuses without changing their stored values', () => {
    expect(['Draft', 'Active', 'Paused', 'Ended'].map(status => planStatusLabel(status as 'Draft' | 'Active' | 'Paused' | 'Ended'))).toEqual(['Draft', 'Running', 'Paused', 'Ended']);
  });
  it('preserves an unrecognized stored month status', () => {
    expect(cycleStatusLabel('Legacy' as 'Draft')).toBe('Legacy');
    expect(cycleStatusLabel('__proto__' as 'Draft')).toBe('__proto__');
  });
  it('labels every monthly cycle status', () => {
    expect(['Draft', 'Published', 'Completed', 'Cancelled'].map(status => cycleStatusLabel(status as 'Draft' | 'Published' | 'Completed' | 'Cancelled'))).toEqual(['Not started', 'In progress', 'Done', 'Cancelled']);
  });
});
