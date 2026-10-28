import { isBossKoo, isHodUser } from '../../shared/authorization/access';
import type { CustomRole, RolePermissionKey, RolePermissions, User } from '../../shared/types/index';

export const RELEASE_NOTICE_ID = '2026-10-project-workflows';
export const OPEN_RELEASE_NOTICE_EVENT = 'aitask-open-release-notice';
export type ReleaseNoticePersona = 'admin' | 'projectManager' | 'hod' | 'staff' | 'client';

export interface ReleaseNoticeHighlight {
  title: string;
  description: string;
  requiredPermissions?: RolePermissionKey[];
}

export interface ReleaseNoticeCopy {
  eyebrow: string;
  title: string;
  description: string;
  highlights: ReleaseNoticeHighlight[];
  detailsTitle: string;
  detailsDescription: string;
  detailedHighlights: ReleaseNoticeHighlight[];
  detailsLabel: string;
  backLabel: string;
  acknowledgeLabel: string;
}

type ReleaseNoticeLocale = 'en' | 'zh';

const englishCopy: Record<ReleaseNoticePersona, ReleaseNoticeCopy> = {
  admin: {
    eyebrow: 'What’s new',
    title: 'Project and team work are easier to follow',
    description: 'Recent updates bring project ownership, review work, and monthly delivery into a clearer view.',
    highlights: [
      { title: 'Review project owners and milestones', description: 'Open a project from Companies to check its status, team, tasks, milestones, and closure checklist.', requiredPermissions: ['viewProjects'] },
      { title: 'See work that needs attention', description: 'Use the management dashboard and reports to follow deadlines, reviews, and monthly delivery.', requiredPermissions: ['viewDashboard', 'viewReports'] },
      { title: 'Manage member access', description: 'Review access requests and role permissions in Approvals.', requiredPermissions: ['viewApprovals'] },
    ],
    detailsTitle: 'More from this update',
    detailsDescription: 'These updates help teams keep ownership, reviews, and client delivery connected.',
    detailedHighlights: [
      { title: 'Keep project responsibility clear', description: 'Review the assigned project team and the work linked to each project.', requiredPermissions: ['viewProjects'] },
      { title: 'Follow department handoffs', description: 'See task owners and review steps as work moves through the team.', requiredPermissions: ['viewTasks'] },
      { title: 'Track service cycles and renewals', description: 'Review published delivery periods, upcoming dates, and client-visible progress.', requiredPermissions: ['viewDeliveryTracker'] },
      { title: 'Use reports to guide follow-up', description: 'Review the reporting period and the work included in each summary.', requiredPermissions: ['viewReports'] },
    ],
    detailsLabel: 'See all updates', backLabel: 'Back to summary', acknowledgeLabel: 'Continue to AiTask',
  },
  projectManager: {
    eyebrow: 'What’s new',
    title: 'Projects have clearer owners and next steps',
    description: 'Recent updates make it easier to coordinate project teams, hand off tasks, and follow delivery progress.',
    highlights: [
      { title: 'Review project health and milestones', description: 'Open a project from Companies to check its status, team, tasks, milestones, and closure checklist.', requiredPermissions: ['viewProjects'] },
      { title: 'Hand work to the right department', description: 'Choose a department and follow the project’s assignment rules when you create a task.', requiredPermissions: ['viewTasks', 'createTasks'] },
      { title: 'Spot reviews and delivery risks', description: 'Use your dashboard and reports to find deadlines, reviews, and work that needs follow-up.', requiredPermissions: ['viewDashboard', 'viewReports'] },
    ],
    detailsTitle: 'More from this update',
    detailsDescription: 'Use the project and client views to keep planning, assignments, and delivery in context.',
    detailedHighlights: [
      { title: 'Coordinate project teams', description: 'Review project members and the responsibilities assigned to each team.', requiredPermissions: ['viewProjects'] },
      { title: 'See who can take the next task', description: 'Task assignment follows the selected project and its eligible departments and members.', requiredPermissions: ['viewTasks', 'createTasks'] },
      { title: 'Follow internal review and client feedback', description: 'Internal approval and client acceptance are separate steps with different reviewers.', requiredPermissions: ['viewTasks'] },
      { title: 'Plan recurring client work', description: 'Review service plans, monthly cycles, and renewal dates for clients in your scope.', requiredPermissions: ['viewProjects', 'viewDeliveryTracker', 'manageClientPlans'] },
      { title: 'Use reports to guide follow-up', description: 'Check the report period and delivery measures before sharing a progress summary.', requiredPermissions: ['viewReports'] },
    ],
    detailsLabel: 'See all updates', backLabel: 'Back to summary', acknowledgeLabel: 'Continue to AiTask',
  },
  hod: {
    eyebrow: 'What’s new',
    title: 'Department handoffs are easier to follow',
    description: 'Find department work, assign eligible staff, and review submissions with clearer next steps.',
    highlights: [
      { title: 'Start with department work', description: 'See tasks assigned to you and work visible to your department.', requiredPermissions: ['viewTasks'] },
      { title: 'Assign eligible staff', description: 'Reassign work only when the task status, project, department, and staff member allow it.', requiredPermissions: ['viewTasks', 'manageCreatedTasks'] },
      { title: 'Review submitted work', description: 'Check files and comments, then approve or request changes when the review step allows it.', requiredPermissions: ['viewTasks'] },
    ],
    detailsTitle: 'More from this update',
    detailsDescription: 'Assignment and review actions depend on the task and project settings shown in AiTask.',
    detailedHighlights: [
      { title: 'Check the task before handing it off', description: 'Review the brief, deadline, project, department, and current owner first.', requiredPermissions: ['viewTasks'] },
      { title: 'Follow assignment rules', description: 'Pending, In Progress, and Revision work may be reassigned when the selected staff member is eligible.', requiredPermissions: ['viewTasks', 'manageCreatedTasks'] },
      { title: 'Know when assignment is locked', description: 'Tasks waiting for approval, approved, completed, or cancelled cannot be reassigned.', requiredPermissions: ['viewTasks'] },
      { title: 'Use review actions when available', description: 'The project’s approval settings determine who reviews a submission next.', requiredPermissions: ['viewTasks'] },
      { title: 'Follow team updates', description: 'Check notifications for task assignments, review handoffs, and requested changes.' },
    ],
    detailsLabel: 'See all updates', backLabel: 'Back to summary', acknowledgeLabel: 'Continue to AiTask',
  },
  staff: {
    eyebrow: 'What’s new',
    title: 'Your assigned work is easier to follow',
    description: 'Find deadlines, share progress, and see what needs your attention next.',
    highlights: [
      { title: 'See tasks assigned to you', description: 'My Work brings your tasks, deadlines, and revision requests into one view.', requiredPermissions: ['viewTasks'] },
      { title: 'Keep updates with the task', description: 'Add comments or files, update progress, and submit work when it is ready for review.', requiredPermissions: ['viewTasks'] },
      { title: 'Respond to requested changes', description: 'Read the reviewer’s note, update the work, and submit it again when revisions are requested.', requiredPermissions: ['viewTasks'] },
    ],
    detailsTitle: 'More from this update',
    detailsDescription: 'Use the task brief and review notes to understand what to do next.',
    detailedHighlights: [
      { title: 'Start with the task brief', description: 'Check the requirement, deadline, and project before you begin.', requiredPermissions: ['viewTasks'] },
      { title: 'Share progress as you work', description: 'Add a work note or file to the task so the next person can see the latest update.', requiredPermissions: ['viewTasks'] },
      { title: 'Submit work for review', description: 'Send the task for review when the requested work and evidence are ready.', requiredPermissions: ['viewTasks'] },
      { title: 'Check your notifications', description: 'Look for assignment updates, review handoffs, and revision requests in your inbox.' },
    ],
    detailsLabel: 'See all updates', backLabel: 'Back to summary', acknowledgeLabel: 'Continue to AiTask',
  },
  client: {
    eyebrow: 'What’s new',
    title: 'Shared deliveries are easier to follow',
    description: 'See the work your team has shared and respond when a delivery is ready for your review.',
    highlights: [
      { title: 'Follow published deliveries', description: 'See delivery periods, files, and progress after your team shares them with you.', requiredPermissions: ['viewDeliveryTracker'] },
      { title: 'Review and respond', description: 'Give feedback or record acceptance when a delivery is ready for client review.', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { title: 'See service information shared with you', description: 'Review the service and delivery details available to your company.', requiredPermissions: ['viewDeliveryTracker'] },
    ],
    detailsTitle: 'More from this update',
    detailsDescription: 'Client views show shared information and keep internal team details private.',
    detailedHighlights: [
      { title: 'Review shared files and updates', description: 'Open a delivery to review available files, dates, and client-visible notes.', requiredPermissions: ['viewDeliveryTracker'] },
      { title: 'Share feedback during client review', description: 'Comment or request changes when the delivery is open for your review.', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { title: 'Record your acceptance', description: 'Accept a delivery when it meets the agreed outcome. This does not close the project.', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { title: 'Follow published service cycles', description: 'See the service periods and progress your team has made available to you.', requiredPermissions: ['viewDeliveryTracker'] },
    ],
    detailsLabel: 'See all updates', backLabel: 'Back to summary', acknowledgeLabel: 'Continue to AiTask',
  },
};

const chineseCopy: Record<ReleaseNoticePersona, ReleaseNoticeCopy> = {
  admin: {
    eyebrow: '最新更新',
    title: '项目和团队工作更容易跟进',
    description: '最新更新让项目负责人、审核工作和月度交付一目了然。',
    highlights: [
      { title: '查看项目负责人和里程碑', description: '在“公司”中打开项目，查看项目状态、团队、任务、里程碑和关闭清单。', requiredPermissions: ['viewProjects'] },
      { title: '发现需要跟进的工作', description: '使用管理仪表板和报表跟进截止日期、审核和月度交付。', requiredPermissions: ['viewDashboard', 'viewReports'] },
      { title: '管理员工访问权限', description: '在“审批”中审核访问申请和角色权限。', requiredPermissions: ['viewApprovals'] },
    ],
    detailsTitle: '本次更新的更多内容', detailsDescription: '这些更新让项目负责人、审核工作和客户交付的联系更清晰。',
    detailedHighlights: [
      { title: '明确项目职责', description: '查看已分配的项目团队，以及每个项目关联的工作。', requiredPermissions: ['viewProjects'] },
      { title: '跟进部门交接', description: '查看任务负责人，以及工作在团队中流转时的审核步骤。', requiredPermissions: ['viewTasks'] },
      { title: '跟进服务周期和续约', description: '查看已发布的交付周期、即将到来的日期和客户可见进度。', requiredPermissions: ['viewDeliveryTracker'] },
      { title: '使用报表安排跟进', description: '查看每份汇总所采用的报告时间范围和工作数据。', requiredPermissions: ['viewReports'] },
    ],
    detailsLabel: '查看全部更新', backLabel: '返回摘要', acknowledgeLabel: '继续使用 AiTask',
  },
  projectManager: {
    eyebrow: '最新更新',
    title: '项目负责人和下一步更明确',
    description: '最新更新让您更轻松地协调项目团队、交接任务并跟进交付进度。',
    highlights: [
      { title: '查看项目健康状况和里程碑', description: '在“公司”中打开项目，查看项目状态、团队、任务、里程碑和关闭清单。', requiredPermissions: ['viewProjects'] },
      { title: '将工作交接给合适的部门', description: '创建任务时选择部门，并依照项目分配规则安排负责人。', requiredPermissions: ['viewTasks', 'createTasks'] },
      { title: '发现待审核工作和交付风险', description: '使用仪表板和报表查找截止日期、待审核事项和需要跟进的工作。', requiredPermissions: ['viewDashboard', 'viewReports'] },
    ],
    detailsTitle: '本次更新的更多内容', detailsDescription: '使用项目和客户工作区，在同一背景下安排计划、分配工作并跟进交付。',
    detailedHighlights: [
      { title: '协调项目团队', description: '查看项目成员和分配给各团队的职责。', requiredPermissions: ['viewProjects'] },
      { title: '确认下一项任务由谁负责', description: '任务分配会依照所选项目及其符合条件的部门和成员处理。', requiredPermissions: ['viewTasks', 'createTasks'] },
      { title: '跟进内部审核和客户反馈', description: '内部审批与客户验收是由不同审核人处理的独立步骤。', requiredPermissions: ['viewTasks'] },
      { title: '规划持续性的客户工作', description: '查看您负责范围内客户的服务方案、月度周期和续约日期。', requiredPermissions: ['viewProjects', 'viewDeliveryTracker', 'manageClientPlans'] },
      { title: '使用报表安排跟进', description: '分享进度摘要前，先确认报告时间范围和交付指标。', requiredPermissions: ['viewReports'] },
    ],
    detailsLabel: '查看全部更新', backLabel: '返回摘要', acknowledgeLabel: '继续使用 AiTask',
  },
  hod: {
    eyebrow: '最新更新',
    title: '部门交接更容易跟进',
    description: '查找部门工作、分配符合条件的员工，并清楚跟进审核结果。',
    highlights: [
      { title: '从部门工作开始', description: '查看分配给您和您部门可见的任务。', requiredPermissions: ['viewTasks'] },
      { title: '分配符合条件的员工', description: '只有当任务状态、项目、部门和员工均符合条件时，才能重新分配工作。', requiredPermissions: ['viewTasks', 'manageCreatedTasks'] },
      { title: '审核已提交的工作', description: '查看文件和评论，并在审核步骤允许时批准或请求修改。', requiredPermissions: ['viewTasks'] },
    ],
    detailsTitle: '本次更新的更多内容', detailsDescription: '可用的分配和审核操作取决于 AiTask 中显示的任务与项目设置。',
    detailedHighlights: [
      { title: '交接前先查看任务', description: '先查看任务说明、截止日期、项目、部门和当前负责人。', requiredPermissions: ['viewTasks'] },
      { title: '遵循任务分配规则', description: '符合条件的员工可以接手“待处理”“进行中”或“修订”状态的工作。', requiredPermissions: ['viewTasks', 'manageCreatedTasks'] },
      { title: '了解何时无法重新分配', description: '等待审批、已批准、已完成或已取消的任务不能重新分配。', requiredPermissions: ['viewTasks'] },
      { title: '在可用时执行审核', description: '项目审批设置决定下一步由谁审核提交内容。', requiredPermissions: ['viewTasks'] },
      { title: '跟进团队更新', description: '在收件箱中查看任务分配、审核交接和修改请求的通知。' },
    ],
    detailsLabel: '查看全部更新', backLabel: '返回摘要', acknowledgeLabel: '继续使用 AiTask',
  },
  staff: {
    eyebrow: '最新更新',
    title: '分配给您的工作更容易跟进',
    description: '查找截止日期、分享进度，并了解下一步需要处理什么。',
    highlights: [
      { title: '查看分配给您的任务', description: '“我的工作”集中显示您的任务、截止日期和修订请求。', requiredPermissions: ['viewTasks'] },
      { title: '在任务中记录更新', description: '添加评论或文件、更新进度，并在准备好审核时提交工作。', requiredPermissions: ['viewTasks'] },
      { title: '回应修改请求', description: '阅读审核意见，更新工作，并在收到修订请求后重新提交。', requiredPermissions: ['viewTasks'] },
    ],
    detailsTitle: '本次更新的更多内容', detailsDescription: '查看任务说明和审核意见，了解下一步要做什么。',
    detailedHighlights: [
      { title: '先查看任务说明', description: '开始工作前，先查看要求、截止日期和所属项目。', requiredPermissions: ['viewTasks'] },
      { title: '边工作边分享进度', description: '在任务中添加工作说明或文件，让下一位负责人看到最新进度。', requiredPermissions: ['viewTasks'] },
      { title: '提交工作供审核', description: '要求的工作和相关证据准备好后，再将任务提交审核。', requiredPermissions: ['viewTasks'] },
      { title: '查看通知', description: '在收件箱中查看任务分配、审核交接和修订请求。' },
    ],
    detailsLabel: '查看全部更新', backLabel: '返回摘要', acknowledgeLabel: '继续使用 AiTask',
  },
  client: {
    eyebrow: '最新更新',
    title: '共享交付更容易跟进',
    description: '查看团队分享的工作，并在交付成果准备好审核时作出回应。',
    highlights: [
      { title: '跟进已发布的交付', description: '团队分享交付内容后，您可以查看交付周期、文件和进度。', requiredPermissions: ['viewDeliveryTracker'] },
      { title: '审核并回复', description: '交付成果进入客户审核后，您可以提供反馈或记录验收。', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { title: '查看分享给您的服务信息', description: '查看团队向贵公司开放的服务和交付详情。', requiredPermissions: ['viewDeliveryTracker'] },
    ],
    detailsTitle: '本次更新的更多内容', detailsDescription: '客户视图展示已分享的信息，并保护内部团队详情。',
    detailedHighlights: [
      { title: '查看已分享的文件和更新', description: '打开交付成果，查看可用文件、日期和客户可见的备注。', requiredPermissions: ['viewDeliveryTracker'] },
      { title: '在客户审核期间提供反馈', description: '交付成果开放审核时，您可以评论或请求修改。', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { title: '记录验收结果', description: '交付成果符合约定结果时，您可以验收。这不会关闭项目。', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { title: '跟进已发布的服务周期', description: '查看团队向您开放的服务周期和进度。', requiredPermissions: ['viewDeliveryTracker'] },
    ],
    detailsLabel: '查看全部更新', backLabel: '返回摘要', acknowledgeLabel: '继续使用 AiTask',
  },
};

const noHighlights: Record<ReleaseNoticeLocale, ReleaseNoticeHighlight> = {
  en: { title: 'Your workspace follows your access', description: 'The pages and actions available to you depend on your role and project access.' },
  zh: { title: '工作区内容依照您的访问权限显示', description: '您可以使用的页面和操作取决于您的角色和项目访问权限。' },
};

export const getReleaseNoticePersona = (
  user: User | null | undefined,
  customRoles: CustomRole[] = [],
): ReleaseNoticePersona => {
  if (isBossKoo(user)) return 'admin';
  if (user?.role === 'Project Manager') return 'projectManager';
  if (user?.role === 'Client') return 'client';
  if (isHodUser(user, customRoles)) return 'hod';
  return 'staff';
};

export const getReleaseNoticeCopy = (
  user: User,
  locale: ReleaseNoticeLocale,
  permissions?: RolePermissions,
  customRoles: CustomRole[] = [],
): ReleaseNoticeCopy => {
  const copy = (locale === 'zh' ? chineseCopy : englishCopy)[getReleaseNoticePersona(user, customRoles)];
  const filterHighlights = (items: ReleaseNoticeHighlight[]) => items.filter(item => (
    !permissions || (item.requiredPermissions || []).every(permission => permissions[permission])
  ));
  const highlights = filterHighlights(copy.highlights);
  const detailedHighlights = filterHighlights(copy.detailedHighlights);
  return {
    ...copy,
    highlights: highlights.length ? highlights : [noHighlights[locale]],
    detailedHighlights: detailedHighlights.length ? detailedHighlights : [noHighlights[locale]],
  };
};

export const getLocalReleaseNoticeKey = (userId: string, noticeId = RELEASE_NOTICE_ID) => `aitask:release-notice:${noticeId}:${userId}`;

export const hasLocalReleaseNoticeAcknowledgement = (userId: string, noticeId = RELEASE_NOTICE_ID) => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(getLocalReleaseNoticeKey(userId, noticeId)) === 'acknowledged';
  } catch {
    return false;
  }
};

export const acknowledgeLocalReleaseNotice = (userId: string, noticeId = RELEASE_NOTICE_ID) => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(getLocalReleaseNoticeKey(userId, noticeId), 'acknowledged');
    return true;
  } catch {
    return false;
  }
};
