import { describe, expect, it } from 'vitest';
import {
  getLocalizedDepartment,
  getLocalizedDevice,
  getLocalizedPriority,
  getLocalizedRole,
  getLocalizedStatus,
} from './localeLabels';

describe('locale-aware enum labels', () => {
  it('localizes built-in values', () => {
    expect(getLocalizedStatus('In Progress', 'zh')).toBe('进行中');
    expect(getLocalizedRole('Project Manager', 'zh')).toBe('项目经理');
    expect(getLocalizedDepartment('Designer', 'zh')).toBe('设计');
    expect(getLocalizedPriority('Urgent', 'zh')).toBe('紧急');
    expect(getLocalizedDevice('Mobile', 'zh')).toBe('手机');
  });

  it('preserves custom values exactly', () => {
    expect(getLocalizedRole('Growth Lead', 'zh')).toBe('Growth Lead');
    expect(getLocalizedDepartment('Creative Lab', 'zh')).toBe('Creative Lab');
    expect(getLocalizedStatus('Waiting on legal', 'zh')).toBe('Waiting on legal');
  });
});
