import { isBossKoo, isHodUser } from '../../../shared/authorization/access';
import type { AppLocale } from '../../../shared/i18n/i18n';
import type { Role, RolePermissionKey, RolePermissions, User } from '../../../shared/types/index';

export type OnboardingPersona = 'admin' | 'projectManager' | 'hod' | 'staff' | 'client';
export type OnboardingStatus = 'skipped' | 'completed';

export interface OnboardingRecord {
  status: OnboardingStatus;
  updatedAt: string;
}

export interface TutorialProgressRecord {
  startedAt?: string;
  completedAt?: string;
  lastViewedAt?: string;
  lastStep?: number;
}

export interface OnboardingStep {
  id: string;
  target: string;
  path?: string;
  title: string;
  body: string;
}

export const ONBOARDING_START_EVENT = 'aitask-start-onboarding';
const ONBOARDING_STORAGE_KEY = 'aitask:onboarding:v1';
const TUTORIAL_PROGRESS_STORAGE_KEY = 'aitask:tutorial-progress:v1';
const memoryRecords = new Map<string, OnboardingRecord>();
const memoryTutorialProgress = new Map<string, Record<string, TutorialProgressRecord>>();
const SEEDED_DEMO_USER_IDS = new Set([
  'u-boss',
  'u-admin',
  'u-staff-demo-local',
  'u-hod-demo-local',
  'u-client-urban',
  'local-demo-operation',
  'local-demo-account',
]);

export const isSeededDemoUserId = (userId: string | undefined | null) => Boolean(userId && SEEDED_DEMO_USER_IDS.has(userId));

const readRecords = (): Record<string, OnboardingRecord> => {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, OnboardingRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeRecord = (userId: string, record: OnboardingRecord) => {
  memoryRecords.set(userId, record);
  try {
    const records = readRecords();
    records[userId] = record;
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // The in-memory record still prevents repeated prompts in this session.
  }
};

export const getOnboardingRecord = (userId: string | undefined | null): OnboardingRecord | null => {
  if (!userId) return null;
  const memory = memoryRecords.get(userId);
  if (memory) return memory;
  const record = readRecords()[userId];
  if (!record || (record.status !== 'skipped' && record.status !== 'completed')) return null;
  memoryRecords.set(userId, record);
  return record;
};

export const shouldAutoOpenOnboarding = (userId: string | undefined | null) => Boolean(userId && !isSeededDemoUserId(userId) && !getOnboardingRecord(userId));

export const setOnboardingStatus = (userId: string, status: OnboardingStatus) => {
  writeRecord(userId, { status, updatedAt: new Date().toISOString() });
};

export const clearOnboardingStatus = (userId: string | undefined | null) => {
  if (!userId) return;
  memoryRecords.delete(userId);
  try {
    const records = readRecords();
    delete records[userId];
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage may be unavailable; the next explicit start still works.
  }
};

const readTutorialProgress = (): Record<string, Record<string, TutorialProgressRecord>> => {
  try {
    const raw = window.localStorage.getItem(TUTORIAL_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, TutorialProgressRecord>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeTutorialProgress = (userId: string, tutorialId: string, patch: TutorialProgressRecord) => {
  const current = memoryTutorialProgress.get(userId) || {};
  const next = { ...current, [tutorialId]: { ...(current[tutorialId] || {}), ...patch } };
  memoryTutorialProgress.set(userId, next);
  try {
    const records = readTutorialProgress();
    records[userId] = next;
    window.localStorage.setItem(TUTORIAL_PROGRESS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // The in-memory record still supports progress during this session.
  }
};

export const getTutorialProgress = (userId: string | undefined | null, tutorialId: string): TutorialProgressRecord | null => {
  if (!userId) return null;
  const memory = memoryTutorialProgress.get(userId);
  if (memory?.[tutorialId]) return memory[tutorialId];
  const record = readTutorialProgress()[userId]?.[tutorialId];
  if (!record || typeof record !== 'object') return null;
  const next = { ...(memory || {}), [tutorialId]: record };
  memoryTutorialProgress.set(userId, next);
  return record;
};

export const getAllTutorialProgress = (userId: string | undefined | null): Record<string, TutorialProgressRecord> => {
  if (!userId) return {};
  const memory = memoryTutorialProgress.get(userId);
  if (memory) return memory;
  const records = readTutorialProgress()[userId] || {};
  memoryTutorialProgress.set(userId, records);
  return records;
};

export const markTutorialStarted = (userId: string, tutorialId: string) => {
  const now = new Date().toISOString();
  const existing = getTutorialProgress(userId, tutorialId);
  writeTutorialProgress(userId, tutorialId, { startedAt: existing?.startedAt || now, lastViewedAt: now });
};

export const markTutorialViewed = (userId: string, tutorialId: string, lastStep?: number) => {
  const now = new Date().toISOString();
  const existing = getTutorialProgress(userId, tutorialId);
  writeTutorialProgress(userId, tutorialId, {
    startedAt: existing?.startedAt || now,
    lastViewedAt: now,
    ...(typeof lastStep === 'number' ? { lastStep } : {}),
  });
};

export const markTutorialCompleted = (userId: string, tutorialId: string, lastStep?: number) => {
  const now = new Date().toISOString();
  const existing = getTutorialProgress(userId, tutorialId);
  writeTutorialProgress(userId, tutorialId, {
    startedAt: existing?.startedAt || now,
    completedAt: now,
    lastViewedAt: now,
    ...(typeof lastStep === 'number' ? { lastStep } : {}),
  });
};

export const getOnboardingPersona = (user: User | null | undefined, customRoles: Parameters<typeof isHodUser>[1] = []): OnboardingPersona => {
  if (isBossKoo(user)) return 'admin';
  if (user?.role === 'Project Manager') return 'projectManager';
  if (user?.role === 'Client') return 'client';
  if (isHodUser(user, customRoles)) return 'hod';
  return 'staff';
};

const onboardingPaths: Record<OnboardingPersona, Record<string, string>> = {
  admin: { dashboard: '/', companies: '/projects', tasks: '/', approvals: '/approvals', reports: '/reports' },
  projectManager: { dashboard: '/', company: '/projects', task: '/', monitor: '/tasks', reports: '/reports', workflow: '/help' },
  hod: { dashboard: '/', tasks: '/tasks', assign: '/tasks', review: '/tasks', workflow: '/help' },
  staff: { dashboard: '/', tasks: '/tasks', updates: '/tasks', revision: '/tasks', workflow: '/help' },
  client: { dashboard: '/', deliveries: '/clients', feedback: '/clients', visibility: '/help' },
};

const localizedSteps = (
  persona: OnboardingPersona,
  locale: AppLocale,
  definitions: Array<[string, string, string, string, string, string]>,
): OnboardingStep[] => definitions.map(([id, target, en, zh, bodyEn, bodyZh]) => ({
  id,
  target,
  ...(onboardingPaths[persona][id] ? { path: onboardingPaths[persona][id] } : {}),
  title: locale === 'zh' ? zh : en,
  body: locale === 'zh' ? bodyZh : bodyEn,
}));

const stepsByPersona: Record<OnboardingPersona, Array<[string, string, string, string, string, string]>> = {
  admin: [
    ['dashboard', 'dashboard-overview', 'Review organization activity', '查看机构运营情况', 'Use the dashboard to follow project activity, deadlines, reviews, and work that needs attention.', '通过仪表板跟进项目活动、截止日期、审核和需要关注的工作。'],
    ['companies', 'projects-overview', 'Set up companies and projects', '设置公司和项目', 'Companies hold the client relationship. Projects give the team a clear delivery scope and owner.', '公司记录客户关系。项目用于明确交付范围和负责人。'],
    ['tasks', 'create-task', 'Set up a clear task handoff', '创建清晰的任务交接', 'Add the requirement, deadline, department, and next responsible person. AiTask applies the project’s assignment rules.', '填写任务要求、截止日期、部门和下一位负责人。AiTask 会依照项目分配规则处理。'],
    ['approvals', 'approvals-overview', 'Manage members and access', '管理员工和访问权限', 'Review registrations and role permissions in Approvals. Each person’s access determines which information and actions are available.', '在“审批”中审核注册申请和角色权限。每个人的访问权限决定其可查看的信息和可执行的操作。'],
    ['reports', 'reports-overview', 'Follow delivery and reports', '跟进交付和报表', 'Use available reports and service plans to review deadlines, monthly delivery, and work that needs attention.', '使用可访问的报表和服务方案查看截止日期、月度交付和需要关注的工作。'],
  ],
  projectManager: [
    ['dashboard', 'dashboard-overview', 'Review your portfolio', '查看您的项目组合', 'Use the dashboard to follow deadlines, review work, and delivery progress across projects in your scope.', '通过仪表板跟进您负责项目中的截止日期、待审核工作和交付进度。'],
    ['company', 'projects-overview', 'Open a client company and project', '查看客户公司和项目', 'Companies hold the client relationship. Open a project to check its owner, service scope, and dates.', '公司记录客户关系。打开项目即可查看负责人、服务范围和日期。'],
    ['task', 'create-task', 'Hand work to the right department', '将工作交接给合适的部门', 'Write the requirement, set the deadline, choose the department, and follow the project’s assignment rules for the next owner.', '填写任务要求和截止日期，选择部门，并依照项目分配规则确定下一位负责人。'],
    ['monitor', 'tasks-overview', 'Follow progress and reviews', '跟进进度和审核', 'Track due work and submissions. Available review actions follow the project’s approval settings; client acceptance is a separate decision.', '跟进待办和提交内容。可用的审核操作取决于项目审批设置；客户验收是独立的决定。'],
    ['reports', 'reports-overview', 'Plan recurring client work', '规划持续性的客户工作', 'Use available reports, service plans, and monthly cycles to follow delivery progress and upcoming renewals.', '使用可访问的报表、服务方案和月度周期跟进交付进度及即将到来的续约。'],
    ['workflow', 'help-overview', 'Check the review steps', '查看审核步骤', 'The project settings decide whether internal review is required. Client acceptance is separate and applies to work shared for client review.', '项目设置决定是否需要内部审核。客户验收是独立步骤，仅适用于分享给客户审核的工作。'],
  ],
  hod: [
    ['dashboard', 'dashboard-overview', 'Start with department work', '从部门工作开始', 'Follow tasks assigned to you and work visible to your department.', '跟进分配给您的任务和您部门可见的工作。'],
    ['tasks', 'tasks-overview', 'Read the handoff first', '先阅读交接内容', 'Check the requirement, deadline, department, and project before assigning work.', '分配工作前，先检查任务要求、截止日期、部门和项目。'],
    ['assign', 'tasks-overview', 'Assign eligible staff', '分配给符合条件的员工', 'You can assign a task in Pending, In Progress, or Revision when the staff member is eligible for its department and project.', '任务处于“待处理”“进行中”或“修订”时，如果员工符合部门和项目条件，您可以分配任务。'],
    ['review', 'tasks-overview', 'Review submitted work', '审核已提交的工作', 'Check the files and comments. Request a revision when allowed; an internal review decision is separate from client acceptance.', '检查文件和评论。在权限允许时请求修订；内部审核决定与客户验收不同。'],
    ['workflow', 'help-overview', 'Check your review steps', '查看审核步骤', 'The project’s settings and your access determine which review actions are available and who receives the work next.', '项目设置和您的访问权限决定可执行哪些审核操作，以及下一步由谁处理。'],
  ],
  staff: [
    ['dashboard', 'dashboard-overview', 'Find work that needs you', '查找需要您处理的工作', 'My Work shows assigned tasks, deadlines, revision requests, and completed work in your scope.', '“我的工作”显示您负责范围内的任务、截止日期、修订请求和已完成工作。'],
    ['tasks', 'tasks-overview', 'Start with the task brief', '先查看任务说明', 'Read the requirement and deadline, then start the task and keep its progress current as you work.', '先阅读任务要求和截止日期，再开始工作，并及时更新进度。'],
    ['updates', 'tasks-overview', 'Share progress and submit work', '分享进度并提交工作', 'Add comments or files, ask for help when context is missing, and submit the work when it is ready for review.', '添加评论或文件；缺少背景时请求协助；工作准备好审核后再提交。'],
    ['revision', 'tasks-overview', 'Respond to a revision request', '回应修订请求', 'Read the reviewer’s note, make the requested change, and submit the updated work again.', '阅读审核意见，完成所需修改，然后再次提交更新后的工作。'],
    ['workflow', 'help-overview', 'Check what happens next', '查看下一步流程', 'The task status and review settings show who will receive your work after you submit it.', '任务状态和审核设置会说明提交后由谁接收您的工作。'],
  ],
  client: [
    ['dashboard', 'dashboard-overview', 'Start from your client workspace', '从客户工作区开始', 'Home shows only the projects, deliveries, and updates your team has shared with your company.', '首页只显示团队与贵公司分享的项目、交付和更新。'],
    ['deliveries', 'clients-overview', 'Review shared deliveries', '查看已分享的交付', 'Open Deliveries to see published work, expected dates, and files shared for your review.', '打开“交付”查看已发布的工作、预计日期和分享给您审核的文件。'],
    ['feedback', 'delivery-search', 'Give feedback on shared work', '反馈已分享的工作', 'Comment, request changes, or record your acceptance when a delivery is ready for client review. This does not close the project.', '交付成果进入客户审核后，您可以评论、请求修改或记录验收。这不会关闭项目。'],
    ['visibility', 'help-overview', 'See what is shared with you', '了解分享给您的内容', 'Internal notes, staff assignments, and team-only review steps stay with the operations team.', '内部备注、员工分配和团队内部审核步骤仅供运营团队查看。'],
  ],
};

const onboardingTargetPermissions: Partial<Record<string, RolePermissionKey[]>> = {
  'dashboard-overview': ['viewDashboard'],
  'projects-overview': ['viewProjects'],
  'create-task': ['viewTasks', 'createTasks'],
  'tasks-overview': ['viewTasks'],
  'approvals-overview': ['viewApprovals'],
  'reports-overview': ['viewReports'],
  'clients-overview': ['viewDeliveryTracker'],
  'delivery-search': ['viewDeliveryTracker'],
};

const onboardingStepPermissions: Partial<Record<string, RolePermissionKey[]>> = {
  approvals: ['manageUsers'],
  assign: ['manageCreatedTasks'],
  feedback: ['clientReview'],
};

export const getOnboardingSteps = (
  persona: OnboardingPersona,
  locale: AppLocale,
  permissions?: RolePermissions,
): OnboardingStep[] => {
  const available = localizedSteps(persona, locale, stepsByPersona[persona]).filter(step => {
    if (!permissions) return true;
    const requiredPermissions = [
      ...(onboardingTargetPermissions[step.target] || []),
      ...(onboardingStepPermissions[step.id] || []),
    ];
    return requiredPermissions.every(permission => permissions[permission]);
  });
  if (available.length) return available;
  return [{
    id: 'help',
    target: 'help-overview',
    path: '/help',
    title: locale === 'zh' ? '从帮助中心开始' : 'Start with Help & tutorials',
    body: locale === 'zh'
      ? '查看适用于您角色的说明，了解可用页面和下一步操作。'
      : 'Find guidance for your role and learn which pages and actions are available to you.',
  }];
};

export const getRoleLabel = (persona: OnboardingPersona, locale: AppLocale) => {
  const labels: Record<OnboardingPersona, [string, string]> = {
    admin: ['Super Admin', '超级管理员'],
    projectManager: ['Project Manager', '项目经理'],
    hod: ['Head of Department', '部门主管'],
    staff: ['Staff', '员工'],
    client: ['Client', '客户'],
  };
  return locale === 'zh' ? labels[persona][1] : labels[persona][0];
};

export const getOnboardingWelcome = (persona: OnboardingPersona, locale: AppLocale) => {
  const role = getRoleLabel(persona, locale);
  return locale === 'zh'
    ? { eyebrow: `${role} · AiTask`, title: '欢迎使用 AiTask', body: '我们用几步带您了解日常工作。您可以现在开始，也可以先自行探索。', start: '开始教程', explore: '自行探索' }
    : { eyebrow: `${role} · AiTask`, title: 'Welcome to AiTask', body: 'Let’s take a quick look at how you can manage your daily work. Start now or explore on your own.', start: 'Start tutorial', explore: 'Explore on my own' };
};

export const getOnboardingUi = (locale: AppLocale) => locale === 'zh'
  ? { step: '步骤', of: '共', back: '上一步', next: '下一步', skip: '跳过', finish: '完成', close: '关闭教程', fallback: '此界面元素目前不可用。您仍可继续查看教程，或稍后从帮助中心重新开始。', progress: '教程进度' }
  : { step: 'Step', of: 'of', back: 'Back', next: 'Next', skip: 'Skip', finish: 'Finish', close: 'Close tutorial', fallback: 'This interface element is not available right now. You can continue the guide or restart it later from Help.', progress: 'Tutorial progress' };

export const getHelpCopy = (persona: OnboardingPersona, locale: AppLocale, permissions?: RolePermissions) => {
  const zh = locale === 'zh';
  const roleGuides: Record<OnboardingPersona, { title: string; intro: string; steps: Array<{ text: string; requiredPermissions?: RolePermissionKey[] }> }> = {
    admin: { title: zh ? '超级管理员指南' : 'Super Admin guide', intro: zh ? '设置机构、管理成员访问权限，并跟进项目和运营情况。' : 'Set up the organization, manage member access, and follow project operations.', steps: zh ? [
      { text: '查看项目活动和需要关注的工作。', requiredPermissions: ['viewDashboard'] },
      { text: '在“审批”中管理成员、注册申请和角色权限。', requiredPermissions: ['viewApprovals', 'manageUsers'] },
      { text: '设置公司和项目，并创建清晰的任务交接。', requiredPermissions: ['viewProjects', 'createClients', 'createProjects', 'viewTasks', 'createTasks'] },
      { text: '使用报表和服务方案跟进交付。', requiredPermissions: ['viewReports', 'manageClientPlans'] },
    ] : [
      { text: 'Review project activity and work that needs attention.', requiredPermissions: ['viewDashboard'] },
      { text: 'Manage members, registration requests, and role permissions in Approvals.', requiredPermissions: ['viewApprovals', 'manageUsers'] },
      { text: 'Set up companies and projects, then create clear task handoffs.', requiredPermissions: ['viewProjects', 'createClients', 'createProjects', 'viewTasks', 'createTasks'] },
      { text: 'Use reports and service plans to follow delivery.', requiredPermissions: ['viewReports', 'manageClientPlans'] },
    ] },
    projectManager: { title: zh ? '项目经理指南' : 'Project Manager guide', intro: zh ? '规划您负责的项目，协调团队，并跟进审核和交付进度。' : 'Plan projects in your portfolio, coordinate the team, and follow reviews and delivery.', steps: zh ? [
      { text: '查看项目截止日期、审核和待跟进工作。', requiredPermissions: ['viewDashboard'] },
      { text: '在权限范围内查看公司和项目。', requiredPermissions: ['viewProjects'] },
      { text: '写清任务要求，并按项目规则交接给合适的部门。', requiredPermissions: ['viewTasks', 'createTasks'] },
      { text: '使用报表和月度周期跟进交付及续约。', requiredPermissions: ['viewReports', 'viewDeliveryTracker'] },
    ] : [
      { text: 'Check project deadlines, reviews, and follow-ups.', requiredPermissions: ['viewDashboard'] },
      { text: 'Review companies and projects within your access.', requiredPermissions: ['viewProjects'] },
      { text: 'Write clear task requirements and use project rules for department handoffs.', requiredPermissions: ['viewTasks', 'createTasks'] },
      { text: 'Use reports and monthly delivery views to follow progress and renewals.', requiredPermissions: ['viewReports', 'viewDeliveryTracker'] },
    ] },
    hod: { title: zh ? '部门主管指南' : 'HOD guide', intro: zh ? '协调部门任务、分配符合条件的员工，并审核提交内容。' : 'Coordinate department tasks, assign eligible staff, and review submitted work.', steps: zh ? [
      { text: '查看分配给您和您部门的任务。', requiredPermissions: ['viewTasks'] },
      { text: '在任务允许分配时交给符合条件的员工。', requiredPermissions: ['viewTasks', 'manageCreatedTasks'] },
      { text: '检查员工提交的文件和评论；在允许时请求修订。', requiredPermissions: ['viewTasks'] },
      { text: '根据项目审核设置将工作交给下一位审核人。', requiredPermissions: ['viewTasks'] },
    ] : [
      { text: 'Review tasks assigned to you and work visible to your department.', requiredPermissions: ['viewTasks'] },
      { text: 'Assign eligible staff when the task allows a handoff.', requiredPermissions: ['viewTasks', 'manageCreatedTasks'] },
      { text: 'Check submitted files and comments; request a revision when permitted.', requiredPermissions: ['viewTasks'] },
      { text: 'Pass work to the next reviewer according to the project’s review settings.', requiredPermissions: ['viewTasks'] },
    ] },
    staff: { title: zh ? '员工指南' : 'Staff guide', intro: zh ? '查看分配给您的工作，更新进度，并按要求提交成果。' : 'Find assigned work, update progress, and submit deliverables when they are ready.', steps: zh ? [
      { text: '打开任务，阅读要求和截止日期。', requiredPermissions: ['viewTasks'] },
      { text: '开始工作并及时更新进度。', requiredPermissions: ['viewTasks'] },
      { text: '添加评论或文件；需要帮助时联系任务负责人。', requiredPermissions: ['viewTasks'] },
      { text: '提交工作供审核；收到修订请求后更新并重新提交。', requiredPermissions: ['viewTasks'] },
    ] : [
      { text: 'Open a task and read its requirements and deadline.', requiredPermissions: ['viewTasks'] },
      { text: 'Start the work and keep its progress up to date.', requiredPermissions: ['viewTasks'] },
      { text: 'Add comments or files; contact the task owner when you need help.', requiredPermissions: ['viewTasks'] },
      { text: 'Submit work for review, then update and resubmit if revisions are requested.', requiredPermissions: ['viewTasks'] },
    ] },
    client: { title: zh ? '客户指南' : 'Client guide', intro: zh ? '查看团队分享的项目和交付，并在需要时提供反馈或验收。' : 'View projects and deliveries your team has shared, then give feedback or accept them when asked.', steps: zh ? [
      { text: '从首页查看分享给贵公司的项目、交付和更新。', requiredPermissions: ['viewDashboard'] },
      { text: '打开交付成果，查看文件、日期和评论。', requiredPermissions: ['viewDeliveryTracker'] },
      { text: '在客户审核时提供反馈或记录验收；这不会关闭项目。', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { text: '内部备注、员工分配和团队审核步骤仅供内部团队查看。' },
    ] : [
      { text: 'Use Home to see projects, deliveries, and updates shared with your company.', requiredPermissions: ['viewDashboard'] },
      { text: 'Open a delivery to review its files, dates, and comments.', requiredPermissions: ['viewDeliveryTracker'] },
      { text: 'Give feedback or record acceptance during client review; this does not close the project.', requiredPermissions: ['viewDeliveryTracker', 'clientReview'] },
      { text: 'Internal notes, staff assignments, and team review steps stay private.' },
    ] },
  };
  const guide = roleGuides[persona];
  const steps = guide.steps
    .filter(step => !permissions || (step.requiredPermissions || []).every(permission => permissions[permission]))
    .map(step => step.text);
  return {
    ...guide,
    steps: steps.length ? steps : [zh ? '下方教程会根据您的访问权限显示可用功能。' : 'The guides below show features available with your current access.'],
  };
};

export const getWorkflowCopy = (locale: AppLocale) => locale === 'zh'
  ? {
      title: '典型任务流程',
      intro: '实际步骤取决于项目设置、任务范围和当前负责人。内部审核与客户验收是不同的决定。',
      stages: [
        ['项目经理', '在负责范围内创建任务，写清要求、截止日期和部门，并按项目规则安排交接。'],
        ['部门主管', '如任务需要部门交接，查看要求并分配给符合条件的员工。'],
        ['员工', '开始工作、更新进度、分享文件，并在准备好后提交审核。'],
        ['内部审核', '如果项目要求内部审核，由当前指定的审核人检查提交内容并决定下一步。'],
        ['客户审核', '交付成果分享给客户审核时，客户可以反馈或验收；这与内部审核和任务完成分开记录。'],
      ] as [string, string][],
    }
  : {
      title: 'Typical task workflow',
      intro: 'The route depends on project settings, task scope, and the current owner. Internal review and client acceptance are separate decisions.',
      stages: [
        ['Project Manager', 'Creates tasks within their scope, writes the requirement and deadline, and follows the project’s assignment rules.'],
        ['HOD', 'When a department handoff is required, checks the brief and assigns an eligible staff member.'],
        ['Staff', 'Starts the work, updates progress, shares files, and submits it when ready for review.'],
        ['Internal review', 'If the project requires internal review, the assigned reviewer checks the submission and decides what happens next.'],
        ['Client review', 'When work is shared for client review, the client can give feedback or accept it. This is separate from internal review and task completion.'],
      ] as [string, string][],
    };

export const getStatusCopy = (locale: AppLocale) => locale === 'zh'
  ? {
      title: '任务状态和分配限制',
      intro: '状态决定任务下一步可以由谁处理。',
      assignable: { title: '可以分配', items: ['Pending · 待处理', 'In Progress · 进行中', 'Revision · 修订'] },
      locked: { title: '锁定分配', items: ['Waiting Approval · 等待审批', 'Approved · 已批准', 'Completed · 已完成', 'Cancelled · 已取消'] },
      note: '只有当前工作流程和用户权限允许时，才会显示 Request Revision（请求修订）。',
    }
  : {
      title: 'Task statuses and assignment restrictions',
      intro: 'The current status tells AiTask which handoff is allowed next.',
      assignable: { title: 'Assignment allowed', items: ['Pending', 'In Progress', 'Revision'] },
      locked: { title: 'Assignment locked', items: ['Waiting Approval', 'Approved', 'Completed', 'Cancelled'] },
      note: 'Request Revision appears only when the current workflow and the user’s permissions allow it.',
    };

export const getPersonaForRole = (role: Role): OnboardingPersona => {
  if (role === 'Project Manager') return 'projectManager';
  if (role === 'Client') return 'client';
  if (role === 'HOD') return 'hod';
  return 'staff';
};
