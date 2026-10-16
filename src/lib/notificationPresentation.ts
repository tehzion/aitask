import type { NotificationCategory, AppNotification } from '../types';
import { type AppLocale } from './i18n';
import { getLocalizedStatus, getLocalizedRole } from './localeLabels';
import { classifyNotification, notificationCategoryLabels, notificationIconType } from './notificationCenter';

const titles: Record<string, string> = {
  'Task Ready for Approval': '任务待审核', 'Task Completed': '任务已完成',
  'Task Status Updated': '任务更新', 'Task Assigned To You': '任务已分配给您',
  'New Task Assigned': '已分配新任务', 'Task Created by Staff': '团队已创建任务',
  'Task Deleted': '任务已删除', 'New Comment': '新评论', 'Team Update': '团队更新',
  'Client Feedback': '客户反馈', 'Client Approved Task': '客户已批准任务',
  'Client Requested Revision': '客户请求修订', 'Revision Requested': '已请求修订',
  'Task Deadline Approaching': '任务截止日期临近', 'Help Requested': '协助请求',
  'Member Added': '已添加成员', 'Member Removed': '已移除成员', 'New Registration': '新注册',
};
const categories: Record<NotificationCategory, string> = { assignment: '任务分配', deadline: '截止日期', review: '审核', feedback: '反馈', account: '账号', status: '状态更新', system: '系统' };
export const notificationCategoryLabel = (category: NotificationCategory, locale: AppLocale) => locale === 'zh' ? categories[category] : notificationCategoryLabels[category];

// Match complete system templates; captured names, titles, and notes stay verbatim.
const patterns: [RegExp, (...values: string[]) => string][] = [
  [/^"([\s\S]+)" is ready for department review\.$/, title => `“${title}”已准备好进行部门审核。`],
  [/^"([\s\S]+)" is ready for client review\.$/, title => `“${title}”已准备好供客户审阅。`],
  [/^"([\s\S]+)" was moved to (.+) by ([\s\S]+)\.$/, (title, status, name) => `${name}已将“${title}”移至${getLocalizedStatus(status, 'zh')}。`],
  [/^"([\s\S]+)" was approved by ([\s\S]+)\.$/, (title, name) => `${name}已通过“${title}”的审核。`],
  [/^"([\s\S]+)" has been assigned to you by ([\s\S]+)\.$/, (title, name) => `${name}已将“${title}”分配给您。`],
  [/^You have been assigned a new task: "([\s\S]+)"\.$/, title => `您收到新任务：“${title}”。`],
  [/^([\s\S]+) created a new task: "([\s\S]+)"\.$/, (name, title) => `${name}创建了新任务：“${title}”。`],
  [/^([\s\S]+) deleted "([\s\S]+)"\.$/, (name, title) => `${name}删除了“${title}”。`],
  [/^([\s\S]+) commented on (?:your task )?"([\s\S]+)"\.$/, (name, title) => `${name}在“${title}”中添加了评论。`],
  [/^You have a new comment on "([\s\S]+)"\.$/, title => `“${title}”有新评论。`],
  [/^([\s\S]+) posted an update on "([\s\S]+)"\.$/, (name, title) => `${name}在“${title}”中发布了更新。`],
  [/^([\s\S]+) requested a revision on "([\s\S]+)"\.$/, (name, title) => `${name}请求修订“${title}”。`],
  [/^([\s\S]+) (approved|rejected) "([\s\S]+)"(?:\. |: |\.)([\s\S]*)$/, (name, decision, title, note) => `${name}${decision === 'approved' ? '批准' : '请求修订'}了“${title}”${note ? `：${note}` : '。'}`],
  [/^"([\s\S]+)": assignment accepted by ([\s\S]+)\.$/, (title, name) => `${name}已接受“${title}”的任务分配。`],
  [/^"([\s\S]+)": help requested by ([\s\S]+)\.$/, (title, name) => `${name}为“${title}”请求协助。`],
  [/^"([\s\S]+)": blocker cleared by ([\s\S]+)\.$/, (title, name) => `${name}已清除“${title}”的阻碍。`],
  [/^"([\s\S]+)" is due today\.$/, title => `“${title}”今日到期。`],
  [/^"([\s\S]+)" is due tomorrow\.$/, title => `“${title}”明日到期。`],
  [/^"([\s\S]+)" for ([\s\S]+) is due today\.$/, (title, client) => `“${title}”（${client}）今日到期。`],
  [/^"([\s\S]+)" for ([\s\S]+) is due tomorrow\.$/, (title, client) => `“${title}”（${client}）明日到期。`],
  [/^"([\s\S]+)" was returned to you by ([\s\S]+)\.$/, (title, name) => `${name}已将“${title}”退回给您。`],
  [/^([\s\S]+) added ([\s\S]+) as ([\s\S]+)\.$/, (name, member, role) => `${name}已将 ${member} 添加为${getLocalizedRole(role, 'zh')}。`],
  [/^([\s\S]+?) removed ([\s\S]+?)\.( Their assigned tasks are now unassigned\.)?$/, (name, member, unassigned) => `${name}已移除 ${member}。${unassigned ? '其已分配的任务现已取消分配。' : ''}`],
  [/^([\s\S]+) has registered and is waiting for your approval\.$/, name => `${name} 已注册，正在等待您的批准。`],
];

export const presentNotification = (notification: AppNotification, locale: AppLocale) => {
  let message = notification.message;
  if (locale === 'zh' && titles[notification.title]) {
    for (const [pattern, render] of patterns) {
      const match = pattern.exec(message);
      if (match) { message = render(...match.slice(1)); break; }
    }
  }
  const departmentReview = notification.title === 'Task Ready for Approval' && / is ready for department review\.$/.test(notification.message);
  const clientReview = notification.title === 'Task Ready for Approval' && / is ready for client review\.$/.test(notification.message);
  const title = departmentReview ? (locale === 'zh' ? '任务待部门审核' : 'Ready for department review') : clientReview ? (locale === 'zh' ? '任务待客户审阅' : 'Ready for client review') : locale === 'zh' ? titles[notification.title] || notification.title : notification.title;
  return {
    title,
    message,
    categoryLabel: notificationCategoryLabel(classifyNotification(notification), locale),
    iconType: notificationIconType(notification),
  };
};
