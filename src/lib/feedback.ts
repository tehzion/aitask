export type FeedbackLanguage = 'en' | 'zh';
export type FeedbackRole = 'Super Admin' | 'Admin' | 'Staff' | 'Client';
export type FeedbackAnswer = 'pass' | 'issue' | 'na';

export interface FeedbackQuestion {
  id: string;
  section: string;
  roles?: FeedbackRole[];
  en: string;
  zh: string;
}

export interface FeedbackSubmissionPayload {
  campaign: 'launch-week-2026-07';
  name: string;
  email: string;
  role: FeedbackRole;
  organization: string;
  device: string;
  language: FeedbackLanguage;
  answers: Record<string, FeedbackAnswer>;
  issueDetails: Record<string, string>;
  ratings: {
    overall: number;
    usability: number;
    reliability: number;
    mobile: number | null;
  };
  mostUseful: string;
  mostConfusing: string;
  recommendation: string;
  consent: boolean;
  website?: string;
}

export const FEEDBACK_CAMPAIGN = 'launch-week-2026-07' as const;
export const FEEDBACK_DEADLINE_ISO = '2026-07-30T15:59:59.999Z';
export const FEEDBACK_DEADLINE_EN = '30 July 2026';
export const FEEDBACK_DEADLINE_ZH = '2026年7月30日';

export const feedbackSections = [
  { id: 'account', en: 'Account and login', zh: '账户与登录' },
  { id: 'navigation', en: 'Dashboard and navigation', zh: '仪表板与导航' },
  { id: 'tasks', en: 'Tasks and calendar', zh: '任务与日历' },
  { id: 'clients', en: 'Clients and companies', zh: '客户与公司' },
  { id: 'review', en: 'Feedback and approvals', zh: '反馈与批准' },
  { id: 'reliability', en: 'Saving and reliability', zh: '保存与稳定性' },
  { id: 'super_admin', en: 'Super Admin checks', zh: '超级管理员检查' },
] as const;

export const feedbackQuestions: FeedbackQuestion[] = [
  { id: 'login', section: 'account', en: 'I can sign in and sign out with my own account.', zh: '我可以使用自己的账户登录和登出。' },
  { id: 'account_details', section: 'account', en: 'My name, email, role, and profile photo are correct.', zh: '我的姓名、邮箱、角色和头像正确。' },
  { id: 'role_access', section: 'account', en: 'I only see pages and information allowed for my role.', zh: '我只能看到角色允许的页面和资料。' },
  { id: 'dashboard', section: 'navigation', en: 'The Dashboard loads the information I expect.', zh: '仪表板可以加载我需要的资料。' },
  { id: 'navigation', section: 'navigation', en: 'Menu, search, refresh, and direct page links work.', zh: '菜单、搜索、刷新和直接页面链接可以使用。' },
  { id: 'responsive', section: 'navigation', en: 'The layout is readable on my usual device without overlap.', zh: '页面在我的常用设备上清楚易读，而且没有重叠。' },
  { id: 'task_scope', section: 'tasks', en: 'I only see tasks I am permitted to view.', zh: '我只能看到有权限查看的任务。' },
  { id: 'task_actions', section: 'tasks', en: 'Allowed task creation, editing, assignment, and deletion work.', zh: '有权限的任务创建、编辑、分配和删除功能可以使用。' },
  { id: 'task_fields', section: 'tasks', en: 'Task status, priority, dates, comments, and attachments save correctly.', zh: '任务状态、优先级、日期、评论和附件可以正确保存。' },
  { id: 'calendar', section: 'tasks', en: 'Calendar tasks appear on the correct dates and can be moved when allowed.', zh: '日历任务显示在正确日期，并可在允许时移动。' },
  { id: 'client_scope', section: 'clients', en: 'I only see clients and companies connected to my access.', zh: '我只能看到权限相关的客户和公司。' },
  { id: 'client_details', section: 'clients', en: 'Client details, address, task count, and company information are clear.', zh: '客户资料、地址、任务数量和公司资料清楚易懂。' },
  { id: 'client_actions', section: 'clients', en: 'Authorized client and company actions work correctly.', zh: '获得授权的客户和公司操作可以正常使用。' },
  { id: 'comments', section: 'review', en: 'Comments and feedback appear on the correct task.', zh: '评论和反馈会显示在正确的任务中。' },
  { id: 'approvals', section: 'review', en: 'Approval, revision, history, and notification behavior is correct.', zh: '批准、修改、记录和通知功能正确。' },
  { id: 'save_status', section: 'reliability', en: 'Saving shows a clear status and changes remain after refresh.', zh: '保存状态清楚，刷新后更改仍然存在。' },
  { id: 'sync', section: 'reliability', en: 'Another user can see saved updates without unexpected sync errors.', zh: '其他用户可以看到已保存的更新，而且不会出现异常同步错误。' },
  { id: 'offline_pwa', section: 'reliability', en: 'Offline messaging, reconnection, and the installed PWA behave clearly.', zh: '离线提示、重新连接和已安装的 PWA 表现清楚正常。' },
  { id: 'registration_approval', section: 'super_admin', roles: ['Super Admin'], en: 'Pending Staff registrations and invitation approval work correctly.', zh: '等待批准的员工注册和邀请批准功能正确。' },
  { id: 'permissions', section: 'super_admin', roles: ['Super Admin'], en: 'Role and permission changes take effect after refresh.', zh: '角色和权限更改在刷新后生效。' },
  { id: 'audit', section: 'super_admin', roles: ['Super Admin'], en: 'Sensitive administrative actions create an audit record.', zh: '敏感管理操作会产生审计记录。' },
  { id: 'developer_scope', section: 'super_admin', roles: ['Super Admin'], en: 'adminmojo cannot enter the workspace and has read-only feedback access only.', zh: 'adminmojo 无法进入工作区，只能以只读方式查看反馈。' },
];

export const visibleFeedbackQuestions = (role: FeedbackRole) => feedbackQuestions.filter(question => (
  !question.roles || question.roles.includes(role)
));

export const parseFeedbackRole = (value: string | null | undefined): FeedbackRole => {
  const normalized = value?.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized === 'super admin') return 'Super Admin';
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'client') return 'Client';
  return 'Staff';
};

export const isFeedbackLate = (submittedAt = new Date()) => submittedAt.getTime() > new Date(FEEDBACK_DEADLINE_ISO).getTime();
