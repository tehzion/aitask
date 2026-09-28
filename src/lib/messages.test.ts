import { describe, expect, it } from 'vitest';
import {
  enMessages,
  formatMessage,
  getMessagePlaceholders,
  messageIds,
  msg,
  zhMessages,
} from './messages';
import { zhTerminology } from './terminology';

describe('typed message catalog', () => {
  it('keeps English and Simplified Chinese catalogs aligned', () => {
    expect(Object.keys(zhMessages).sort()).toEqual(Object.keys(enMessages).sort());
    expect(messageIds).toHaveLength(Object.keys(enMessages).length);
  });

  it('keeps interpolation placeholders aligned', () => {
    for (const id of messageIds) {
      expect(getMessagePlaceholders(enMessages[id]), id).toEqual(getMessagePlaceholders(zhMessages[id]));
    }
  });

  it('formats structured messages for both locales without mutating values', () => {
    const descriptor = msg('task.statusUpdated', { status: 'In Progress' });
    expect(formatMessage(descriptor, 'en')).toBe('Status updated to "In Progress"');
    expect(formatMessage(descriptor, 'zh')).toBe('状态已更新为“In Progress”');
  });

  it('uses the approved Simplified Chinese terminology', () => {
    expect(zhTerminology.review.client).toBe('审阅');
    expect(zhTerminology.review.internal).toBe('审核');
    expect(zhTerminology.review.approval).toBe('审批');
    expect(zhTerminology.revision).toBe('修订');
    expect(zhTerminology.client).toBe('客户');
    expect(zhTerminology.company).toBe('公司');
    expect(zhTerminology.package).toBe('配套');
    expect(zhTerminology.plan).toBe('方案');
    expect(zhTerminology.workspace).toBe('工作区');
    expect(zhTerminology.deliverable).toBe('交付物');
    expect(zhTerminology.formalAddress).toBe('您');
  });
});
