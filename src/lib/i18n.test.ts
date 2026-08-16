import { describe, expect, it } from 'vitest';
import { translateUiText } from './i18n';

describe('Chinese UI translations', () => {
  it('keeps English as the default and translates shared interface copy to Simplified Chinese', () => {
    expect(translateUiText('Clients', 'en')).toBe('Clients');
    expect(translateUiText('Clients', 'zh')).toBe('客户');
    expect(translateUiText('  New client  ', 'zh')).toBe('  新建客户  ');
    expect(translateUiText('Duplicate as Custom Plan', 'zh')).toBe('复制为自定义方案');
  });

  it('localizes dynamic controls without translating their values', () => {
    expect(translateUiText('Switch to night mode', 'zh')).toBe('切换至夜间模式');
    expect(translateUiText('3 unread', 'zh')).toBe('3 条未读');
    expect(translateUiText('Client "UrbanEats" and draft plan created.', 'zh')).toBe('客户“UrbanEats”及其草稿方案已创建。');
  });
});
