import { describe, expect, it } from 'vitest';
import { cycleStatusLabel, planStatusLabel } from './serviceStatusLabels';

describe('service status labels', () => {
  it('labels plan statuses without changing their stored values', () => {
    expect(['Draft', 'Active', 'Paused', 'Ended'].map(status => planStatusLabel(status as 'Draft' | 'Active' | 'Paused' | 'Ended'))).toEqual(['Draft', 'Running', 'Paused', 'Ended']);
  });
  it('labels every monthly cycle status', () => {
    expect(['Draft', 'Published', 'Completed', 'Cancelled'].map(status => cycleStatusLabel(status as 'Draft' | 'Published' | 'Completed' | 'Cancelled'))).toEqual(['Not started', 'In progress', 'Done', 'Cancelled']);
  });
});
