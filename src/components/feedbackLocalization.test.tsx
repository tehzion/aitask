import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from './I18nProvider';
import { msg } from '../lib/messages';
import { getLocalizedTaskStatus } from '../lib/localeLabels';
const Messages = () => {
  const { t } = useI18n();
  return <div><p>{t(msg('task.statusUpdated', { status: 'In Progress' }))}</p><p>{t(msg('task.priorityUpdated', { priority: 'High' }))}</p><p>{t(msg('task.updated', { title: 'In Progress Designer' }))}</p></div>;
};
afterEach(() => vi.unstubAllGlobals());
describe('rendered feedback localization', () => {
  it('localizes system enum values but preserves task names containing those words', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'zh' }, navigator: { language: 'zh-CN' } });
    const html = renderToStaticMarkup(<I18nProvider><Messages /></I18nProvider>);
    expect(html).toContain('状态已更新为“进行中”');
    expect(html).toContain('优先级已更新为“高”');
    expect(html).toContain('In Progress Designer');
  });
  it('distinguishes task review from client approval without changing custom statuses', () => {
    expect(getLocalizedTaskStatus('Waiting Approval', 'en')).toBe('Waiting for review');
    expect(getLocalizedTaskStatus('Waiting Approval', 'zh')).toBe('待审核');
    expect(getLocalizedTaskStatus('Approved', 'en')).toBe('Review approved');
    expect(getLocalizedTaskStatus('Our custom status', 'zh')).toBe('Our custom status');
  });
});
