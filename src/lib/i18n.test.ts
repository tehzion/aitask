import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedDistanceToNow,
  formatLocalizedMonth,
  formatLocalizedSyncTime,
  formatLocalizedWeekdayDate,
  translateUiText,
} from './i18n';

describe('Chinese UI translations', () => {
  it('keeps English as the default and translates shared interface copy to Simplified Chinese', () => {
    expect(translateUiText('Clients', 'en')).toBe('Clients');
    expect(translateUiText('Clients', 'zh')).toBe('客户');
    expect(translateUiText('System update in progress', 'zh')).toBe('系统正在更新');
    expect(translateUiText('Read only', 'zh')).toBe('只读');
    expect(translateUiText(
      'AiTask is completing a system update. Your workspace is read-only for a moment; no changes have been submitted.',
      'zh',
    )).toBe('AiTask 正在完成系统更新。工作区暂时为只读状态，尚未提交任何更改。');
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

  it('translates shared dynamic summaries and async system responses', () => {
    expect(translateUiText('overdue', 'zh')).toBe('逾期');
    expect(translateUiText('Due in 3 days', 'zh')).toBe('3 天后到期');
    expect(translateUiText('3 days ago', 'zh')).toBe('3 天前');
    expect(translateUiText('3 shown from 10 total, 4 linked tasks', 'zh')).toBe('显示 3 / 10 个，共关联 4 个任务');
    expect(translateUiText('Open delivery file', 'zh')).toBe('打开交付文件');
    expect(translateUiText('1 active revision', 'zh')).toBe('1 个进行中的版本');
    expect(translateUiText('Your visible work, ordered by what needs attention first.', 'zh')).toBe('你可查看的工作，优先显示需要关注的事项。');
    expect(translateUiText('Filter visible work', 'zh')).toBe('筛选可查看工作');
    expect(translateUiText('Website reference', 'zh')).toBe('网站参考');
    expect(translateUiText('The recovery service could not be reached. Please try again.', 'zh')).toBe('无法连接密码恢复服务，请重试。');
    expect(translateUiText('Files must be 100 MB or smaller.', 'zh')).toBe('文件大小必须不超过 100 MB。');
  });

  it('translates interpolated toast messages while keeping user titles intact', () => {
    expect(translateUiText('Task "Due Report" deleted', 'zh')).toBe('任务“Due Report”已删除');
    expect(translateUiText('Status updated to "In Progress"', 'zh')).toBe('状态已更新为“In Progress”');
  });

  it('translates client portal chrome in whole and split-node forms', () => {
    expect(translateUiText('services ·', 'zh')).toBe('项服务 ·');
    expect(translateUiText('published cycle(s)', 'zh')).toBe('个已发布周期');
    expect(translateUiText('linked task(s)', 'zh')).toBe('个关联任务');
    expect(translateUiText('1 services · 1 published cycle(s)', 'zh')).toBe('1 项服务 · 1 个已发布周期');
    expect(translateUiText('3 linked task(s) · Short Video Production', 'zh')).toBe('3 个关联任务 · Short Video Production');
    expect(translateUiText('· Due 18 Aug 2026', 'zh')).toBe('· 截止 2026年8月18日');
    expect(translateUiText('75% of work approved', 'zh')).toBe('75% 的工作已批准');
    expect(translateUiText('Track Settings work, review deliverables, and share feedback.', 'zh')).toBe('跟踪Settings 的工作、审阅交付物并分享反馈。');
    expect(translateUiText('Awaiting your review', 'zh')).toBe('等待您的审阅');
    expect(translateUiText('Review task', 'zh')).toBe('审阅任务');
    expect(translateUiText('Leave feedback', 'zh')).toBe('留下反馈');
    expect(translateUiText('Request changes', 'zh')).toBe('请求修改');
    expect(translateUiText('Delivery Schedule', 'zh')).toBe('交付日程');
    expect(translateUiText('Company Tasks', 'zh')).toBe('公司任务');
    expect(translateUiText('Awaiting review', 'zh')).toBe('待审阅');
    expect(translateUiText('Approved', 'zh')).toBe('已批准');
    expect(translateUiText('Total tasks', 'zh')).toBe('任务总数');
  });

  it('translates staff task-focus chrome, including dependency notices', () => {
    expect(translateUiText('Full edit', 'zh')).toBe('完整编辑');
    expect(translateUiText(
      'Read-only task view. You can update tasks assigned to you or created by you.',
      'zh',
    )).toBe('只读任务视图。您只能更新分配给您的或由您创建的任务。');
    expect(translateUiText('Dependency status unavailable', 'zh')).toBe('前置步骤状态不可用');
    expect(translateUiText('Add companies', 'zh')).toBe('添加公司');
    expect(translateUiText(
      'Dependency status for 1 earlier step is unavailable. Confirm with the task owner before starting.',
      'zh',
    )).toBe('1 个前置步骤的状态不可用。开始前请与任务负责人确认。');
    expect(translateUiText(
      'Dependency status for 3 earlier steps is unavailable. Confirm with the task owner before starting.',
      'zh',
    )).toBe('3 个前置步骤的状态不可用。开始前请与任务负责人确认。');
  });

  it('formats structured dates and relative times in the selected application locale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0));
    const value = new Date(2026, 7, 18, 14, 5);

    expect(formatLocalizedDate(value, 'en')).toBe('18 Aug 2026');
    expect(formatLocalizedWeekdayDate(value, 'en')).toBe('Tuesday, 18 August');
    expect(formatLocalizedWeekdayDate(value, 'zh')).toBe('8月18日 星期二');
    expect(formatLocalizedMonth(value, 'en')).toBe('August 2026');
    expect(formatLocalizedDateTime(value, 'en')).toBe('18 Aug 2026, 14:05');
    expect(formatLocalizedDistanceToNow(value, 'en')).toBe('3 days ago');
    expect(formatLocalizedDate(value, 'zh')).toBe('2026年8月18日');
    expect(formatLocalizedMonth(value, 'zh')).toBe('2026年8月');
    expect(formatLocalizedDateTime(value, 'zh')).toBe('2026年8月18日 14:05');
    expect(formatLocalizedDistanceToNow(value, 'zh')).toBe('3 天前');
    expect(formatLocalizedSyncTime(value, 'en')).toBe('18 Aug 2026, 14:05');
    expect(formatLocalizedSyncTime(new Date(2026, 7, 21, 9, 7), 'zh')).toBe('09:07');
    vi.useRealTimers();
  });
});

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

describe('Chinese translation coverage guards', () => {
  it('keeps the corrected role and service terminology consistent', () => {
    expect(translateUiText('Admin', 'zh')).toBe('项目经理');
    expect(translateUiText('Project Manager', 'zh')).toBe('项目经理');
    expect(translateUiText('Revision', 'zh')).toBe('修订');
    expect(translateUiText('Revisions', 'zh')).toBe('修订');
    expect(translateUiText('Task workflow', 'zh')).toBe('任务工作流');
    expect(translateUiText('New workflow', 'zh')).toBe('新建工作流');
    expect(translateUiText('Workflow Statuses', 'zh')).toBe('工作流状态');
    expect(translateUiText('Deliverable', 'zh')).toBe('交付物');
    expect(translateUiText('Done', 'zh')).toBe('已完成');
    expect(translateUiText('Open tasks', 'zh')).toBe('未完成任务');
  });

  it('has no duplicate dictionary keys with conflicting translations', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'i18n.ts'), 'utf8');
    const lines = source.split('\n');
    const followStart = lines.findIndex(line => line.startsWith('const zhCopyFollowups'));
    const followEnd = lines.findIndex((line, index) => index > followStart && line.startsWith('};'));
    const ranges: Array<[number, number]> = [[12, 377], [379, 567], [569, 1327], [1337, 1669], [followStart + 1, followEnd]];
    const entry = /^\s{2}(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,?\s*$/;
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const [start, end] of ranges) {
      for (let i = start - 1; i < end; i += 1) {
        const match = lines[i]?.match(entry);
        if (!match) continue;
        const key = match[1] ?? match[2] ?? '';
        const value = match[3] ?? match[4] ?? '';
        const previous = seen.get(key);
        if (previous === undefined) seen.set(key, value);
        else if (previous !== value) conflicts.push(key);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('translates every explicit t() literal', () => {
    const files = collectSourceFiles(join(process.cwd(), 'src'))
      .filter(file => !/\.test\.tsx?$/.test(file) && !/lib\/i18n\.ts$/.test(file));
    const literal = /\b(?:t|translateUiText)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*\)/g;
    const missing = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      literal.lastIndex = 0;
      while ((match = literal.exec(source))) {
        const value = (match[1] ?? match[2] ?? '').trim();
        if (value.length < 2) continue;
        if (translateUiText(value, 'zh') === value) missing.add(value);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
