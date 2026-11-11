import { describe, expect, it } from 'vitest';
import type { ClientPlanStatus, ServiceCycleStatus } from '../types';
import { translateUiText } from './i18n';
import './pageCopy';
import { cycleStatusLabel, planStatusLabel } from './serviceStatusLabels';

describe('service status labels', () => {
  it('labels plan statuses without changing their stored values', () => {
    expect(['Draft', 'Active', 'Paused', 'Ended'].map(status => planStatusLabel(status as 'Draft' | 'Active' | 'Paused' | 'Ended'))).toEqual(['Draft', 'Running', 'Paused', 'Ended']);
  });
  it('labels every monthly cycle status', () => {
    expect(['Draft', 'Published', 'Completed', 'Cancelled'].map(status => cycleStatusLabel(status as 'Draft' | 'Published' | 'Completed' | 'Cancelled'))).toEqual(['Not started', 'In progress', 'Done', 'Cancelled']);
  });

  const planStatuses: ClientPlanStatus[] = ['Draft', 'Active', 'Paused', 'Ended'];
  const cycleStatuses: ServiceCycleStatus[] = ['Draft', 'Published', 'Completed', 'Cancelled'];

  it('has a Chinese translation for every status label', () => {
    const labels = [...new Set([...planStatuses.map(planStatusLabel), ...cycleStatuses.map(cycleStatusLabel)])];
    for (const label of labels) expect(translateUiText(label, 'zh'), label).not.toBe(label);
  });

  it('keeps a running plan distinct from a month in progress in Chinese', () => {
    expect(translateUiText(planStatusLabel('Active'), 'zh')).toBe('运行中');
    expect(translateUiText(cycleStatusLabel('Published'), 'zh')).toBe('进行中');
    expect(translateUiText('Running plans', 'zh')).toBe('运行中的方案');
  });
});
