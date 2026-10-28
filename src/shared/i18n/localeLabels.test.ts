import { describe, expect, it } from 'vitest';
import {
	getLocalizedDepartment,
	getLocalizedDevice,
	getLocalizedPriority,
	getLocalizedRole,
	getLocalizedStatus,
	getLocalizedTaskStatus,
} from './localeLabels';

describe('locale-aware enum labels', () => {
  it('localizes built-in values', () => {
    expect(getLocalizedStatus('In Progress', 'zh')).toBe('进行中');
    expect(getLocalizedStatus('Published', 'zh')).toBe('已发布');
    expect(getLocalizedRole('Project Manager', 'zh')).toBe('项目经理');
    expect(getLocalizedDepartment('Designer', 'zh')).toBe('设计');
    expect(getLocalizedPriority('Urgent', 'zh')).toBe('紧急');
    expect(getLocalizedDevice('Mobile', 'zh')).toBe('手机');
  });

  it('uses one task-specific label for review and approval states', () => {
    expect(getLocalizedTaskStatus('Waiting Approval', 'en')).toBe('Waiting for review');
    expect(getLocalizedTaskStatus('Waiting Approval', 'zh')).toBe('待审核');
    expect(getLocalizedTaskStatus('Approved', 'en')).toBe('Review approved');
  });

  it('preserves custom values exactly', () => {
    expect(getLocalizedRole('Growth Lead', 'zh')).toBe('Growth Lead');
    expect(getLocalizedDepartment('Creative Lab', 'zh')).toBe('Creative Lab');
    expect(getLocalizedStatus('Waiting on legal', 'zh')).toBe('Waiting on legal');
  });
});
