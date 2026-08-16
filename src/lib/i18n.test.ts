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

  it('translates confirm dialogs while keeping embedded user content untouched', () => {
    expect(translateUiText('Delete "Launch film" ? This removes the task from the workspace.', 'zh')).toBe('Delete "Launch film" ? This removes the task from the workspace.');
    expect(translateUiText('Delete "Launch film"? This removes the task from the workspace.', 'zh')).toBe('确定删除“Launch film”？该任务将从工作区移除。');
    expect(translateUiText('Delete "Acme"? Existing tasks will be kept and unlinked from this company.', 'zh')).toBe('确定删除“Acme”？现有任务将保留并解除与该公司的关联。');
    expect(translateUiText('Pause the "Growth Plan" plan? The current cycle stays unchanged and future cycles stop generating.', 'zh')).toBe('确定暂停“Growth Plan”方案？当前周期保持不变，后续周期将停止生成。');
  });

  it('translates static toast messages', () => {
    expect(translateUiText('Attachment updated successfully', 'zh')).toBe('附件已更新');
    expect(translateUiText('Status added successfully', 'zh')).toBe('状态已添加');
    expect(translateUiText('Choose a valid due date.', 'zh')).toBe('请选择有效的截止日期。');
  });

  it('translates interpolated toast messages while keeping user titles intact', () => {
    expect(translateUiText('Task "Due Report" deleted', 'zh')).toBe('任务“Due Report”已删除');
    expect(translateUiText('Status updated to "In Progress"', 'zh')).toBe('状态已更新为“In Progress”');
  });
});
