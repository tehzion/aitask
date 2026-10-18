import type { AppLocale } from './i18n';
import type { Role, User } from '../types';
import { isBossKoo, isHodUser } from './access';

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
    ['dashboard', 'dashboard-overview', 'Start with the operations dashboard', '从运营仪表板开始', 'Use the dashboard to see workload, approvals, overdue work, and the health of the workspace.', '使用仪表板查看工作量、审批、逾期任务和工作区状态。'],
    ['companies', 'projects-overview', 'Set up companies and projects', '设置公司和项目', 'Companies hold the client relationship. Projects give the team a clear delivery scope and owner.', '公司记录客户关系。项目用于明确交付范围和负责人。'],
    ['tasks', 'create-task', 'Create work with a clear handoff', '创建清晰的工作交接', 'Add the requirement, deadline, department, and accountable person before the work starts.', '开始工作前，填写要求、截止日期、部门和负责人。'],
    ['approvals', 'approvals-overview', 'Keep access and approvals moving', '推进账号和审批', 'Review registrations and role permissions here. Access controls always remain in charge of what each person can see and do.', '在这里审核注册申请和角色权限。访问控制始终决定每个人可以查看和执行的内容。'],
    ['reports', 'reports-overview', 'Use reports to spot risk early', '用报表尽早发现风险', 'Reports and service plans help you understand delivery progress and the work that needs attention.', '报表和服务方案帮助您了解交付进度以及需要关注的工作。'],
  ],
  projectManager: [
    ['dashboard', 'dashboard-overview', 'Read your portfolio at a glance', '快速了解您的项目组合', 'The dashboard brings together deadlines, active companies, review risk, and commercial records in your portfolio.', '仪表板集中显示项目组合中的截止日期、活跃公司、审核风险和商业记录。'],
    ['company', 'projects-overview', 'Create the company and project', '创建公司和项目', 'Start with the client company, then add a project with a named owner, service scope, and deadline.', '先创建客户公司，再添加项目并填写负责人、服务范围和截止日期。'],
    ['task', 'create-task', 'Create a task for the right HOD', '为正确的部门主管创建任务', 'Write the requirement, set the deadline, choose the department, and assign the handoff to the appropriate HOD or eligible owner.', '填写任务要求和截止日期，选择部门，并分配给合适的部门主管或符合条件的负责人。'],
    ['monitor', 'tasks-overview', 'Monitor delivery and review work', '监控交付和审核工作', 'Use Tasks to follow progress, open requirements, submitted work, and permitted revision requests without changing the underlying workflow.', '在任务页面跟进进度、要求、已提交成果，并在权限允许时请求修订，不改变既定工作流程。'],
    ['reports', 'reports-overview', 'Check reports and service plans', '查看报表和服务方案', 'Reports show delivery patterns; service plans and cycles keep recurring client work visible and scheduled.', '报表显示交付情况；服务方案和周期让持续性的客户工作保持清晰并按计划进行。'],
    ['workflow', 'help-overview', 'Keep the handoff sequence in mind', '记住交接顺序', 'The usual path is Project Manager → HOD → Staff → HOD review → Client review. Open Help any time for the status rules.', '通常的流程是项目经理 → 部门主管 → 员工 → 部门主管审核 → 客户审核。随时打开帮助中心查看状态规则。'],
  ],
  hod: [
    ['dashboard', 'dashboard-overview', 'Start with department work', '从部门工作开始', 'Your dashboard focuses on work assigned to you and work visible in your departments.', '您的仪表板聚焦于分配给您的工作和您部门可见的工作。'],
    ['tasks', 'tasks-overview', 'Read the handoff before assigning', '分配前先阅读交接内容', 'Open a task to check its requirement, deadline, department, and the context supplied by the Project Manager.', '打开任务，检查项目经理提供的要求、截止日期、部门和背景。'],
    ['assign', 'tasks-overview', 'Assign only eligible staff', '只分配给符合条件的员工', 'You can assign while a task is Pending, In Progress, or Revision. Assignment is locked for Waiting Approval, Approved, Completed, and Cancelled.', '任务处于待处理、进行中或修订状态时可以分配。等待审批、已批准、已完成和已取消时不能重新分配。'],
    ['review', 'tasks-overview', 'Review submitted deliverables', '审核已提交的交付成果', 'When staff submit work, check the files and comments. Request a revision only when the current workflow and your permissions allow it.', '员工提交工作后，检查文件和评论。只有当前流程和您的权限允许时，才能请求修订。'],
    ['workflow', 'help-overview', 'Use Help for status rules', '使用帮助中心查看状态规则', 'The Help Centre explains your review gate, revision path, and the handoff to client review.', '帮助中心说明您的审核关卡、修订路径以及交接到客户审核的流程。'],
  ],
  staff: [
    ['dashboard', 'dashboard-overview', 'See what needs your attention', '查看需要您处理的工作', 'Your dashboard shows assigned work, deadlines, revision requests, and completed items for your workspace.', '您的仪表板显示分配给您的工作、截止日期、修订请求和已完成事项。'],
    ['tasks', 'tasks-overview', 'Open the assigned task', '打开分配给您的任务', 'Read the requirement and deadline before accepting the assignment. Keep the task status and progress current as you work.', '接受任务前先阅读要求和截止日期。工作过程中及时更新任务状态和进度。'],
    ['updates', 'tasks-overview', 'Keep the delivery record complete', '保持交付记录完整', 'Add comments, upload files or deliverables, and request assistance when context is missing. Submit completed work for approval.', '添加评论、上传文件或交付成果；缺少背景时请求协助。完成工作后提交审批。'],
    ['revision', 'tasks-overview', 'Respond to revision requests', '回应修订请求', 'A revision brings the work back into progress. Read the reviewer’s note, make the change, and submit the updated work again.', '修订会让工作回到进行中。阅读审核意见，完成修改，然后再次提交更新后的工作。'],
    ['workflow', 'help-overview', 'Use Help when a status is unclear', '不清楚状态时打开帮助中心', 'The Help Centre explains statuses, assignment boundaries, and how your work moves to department review.', '帮助中心说明任务状态、分配边界以及工作如何进入部门审核。'],
  ],
  client: [
    ['dashboard', 'dashboard-overview', 'Start from your client workspace', '从客户工作区开始', 'Your home view is limited to client-visible projects, tasks, updates, and deliveries for your company.', '首页只显示您公司可见的项目、任务、更新和交付成果。'],
    ['deliveries', 'clients-overview', 'Review visible deliveries', '查看可见的交付成果', 'Open Deliveries to see submitted work, expected dates, and the files the team has shared with you.', '打开交付页面查看已提交的工作、预计日期以及团队与您分享的文件。'],
    ['feedback', 'delivery-search', 'Give clear feedback', '提供清晰的反馈', 'Open a shared delivery to add comments, approve a final deliverable, or request revisions when the result needs changes.', '打开共享交付成果后，可添加评论；成果完成时批准；需要修改时请求修订。'],
    ['visibility', 'help-overview', 'Keep internal work private', '保持内部工作私密', 'Client onboarding only covers client-visible information. Internal notes, assignments, and team-only workflow details stay with the operations team.', '客户引导只涵盖客户可见信息。内部备注、分配信息和团队内部流程仅供运营团队使用。'],
  ],
};

export const getOnboardingSteps = (persona: OnboardingPersona, locale: AppLocale): OnboardingStep[] => localizedSteps(persona, locale, stepsByPersona[persona]);

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

export const getHelpCopy = (persona: OnboardingPersona, locale: AppLocale) => {
  const zh = locale === 'zh';
  const roleGuides: Record<OnboardingPersona, { title: string; intro: string; steps: string[] }> = {
    admin: { title: zh ? '超级管理员指南' : 'Super Admin guide', intro: zh ? '管理工作区、访问权限和运营节奏。' : 'Keep the workspace, access, and operating rhythm moving.', steps: zh ? ['查看运营仪表板和审批队列。', '创建公司、项目和任务，明确负责人和截止日期。', '在角色与权限中审核可用访问范围。', '使用报表和服务方案发现交付风险。'] : ['Read the operations dashboard and approval queue.', 'Create companies, projects, and tasks with clear owners and deadlines.', 'Review available access in Roles & Permissions.', 'Use reports and service plans to spot delivery risk.'] },
    projectManager: { title: zh ? '项目经理指南' : 'Project Manager guide', intro: zh ? '管理您负责的客户项目，从清晰的任务要求开始。' : 'Manage the client projects in your portfolio, starting with a clear brief.', steps: zh ? ['创建公司和项目，设置负责人、服务范围和截止日期。', '创建任务，选择部门，并交接给合适的部门主管。', '跟进任务进度、审核提交内容，并在允许时请求修订。', '从报表和服务方案查看项目组合健康度。'] : ['Create companies and projects with an owner, service scope, and deadline.', 'Create tasks, choose the department, and hand off to the right HOD.', 'Monitor progress, review submissions, and request revisions when permitted.', 'Use reports and service plans to understand portfolio health.'] },
    hod: { title: zh ? '部门主管指南' : 'HOD guide', intro: zh ? '把项目经理的要求转化为部门内清晰、可审核的工作。' : 'Turn the Project Manager handoff into clear, reviewable department work.', steps: zh ? ['查看项目经理分配的任务和要求。', '只在待处理、进行中或修订状态下分配给符合条件的部门员工。', '员工提交后审核交付成果，并在权限允许时请求修订。', '审核通过后，任务才会进入后续审批流程。'] : ['Open the tasks and requirements assigned by Project Managers.', 'Assign eligible department staff only in Pending, In Progress, or Revision.', 'Review submitted deliverables and request revisions when permitted.', 'Approve the work when it is ready for the next review stage.'] },
    staff: { title: zh ? '员工指南' : 'Staff guide', intro: zh ? '把分配给您的任务推进到可审核的完成状态。' : 'Move assigned work to a complete, reviewable handoff.', steps: zh ? ['打开分配给您的任务，先阅读要求和截止日期。', '接受任务，更新进度，添加评论并上传成果。', '需要背景或资源时请求协助。', '完成后提交审批；收到修订请求时按意见更新并重新提交。'] : ['Open assigned tasks and read the requirements and deadlines first.', 'Accept the assignment, update progress, comment, and upload deliverables.', 'Request assistance when you need context or resources.', 'Submit for approval, then update and resubmit when revisions are requested.'] },
    client: { title: zh ? '客户指南' : 'Client guide', intro: zh ? '只查看您公司可见的项目和交付成果，并提供反馈。' : 'Review the projects and deliverables your company can see, then give feedback.', steps: zh ? ['从客户工作区查看项目和任务。', '检查已提交的文件、预计日期和评论。', '成果符合要求时批准；需要调整时请求修订。', '内部备注、团队分配和内部流程不会显示给您。'] : ['Use the client workspace to view visible projects and tasks.', 'Check submitted files, expected dates, and comments.', 'Approve work that is ready or request revisions when it needs changes.', 'Internal notes, team assignments, and internal workflow stay private.'] },
  };
  return roleGuides[persona];
};

export const getWorkflowCopy = (locale: AppLocale) => locale === 'zh'
  ? {
      title: '典型任务流程',
      intro: 'AiTask 使用清晰的责任交接，让每个人知道下一步由谁处理。',
      stages: [
        ['项目经理', '创建公司、项目和任务，写清要求、截止日期和部门交接。'],
        ['部门主管', '查看要求，分配给本部门符合条件的员工，并审核提交内容。'],
        ['员工', '接受任务、推进工作、添加评论、上传成果并提交审批。'],
        ['部门主管审核', '审核交付成果；需要修改时请求修订，准备好后批准。'],
        ['客户审核', '客户查看可见成果、评论、请求修订或批准最终交付。'],
      ] as [string, string][],
    }
  : {
      title: 'Typical task workflow',
      intro: 'AiTask keeps ownership clear so each person knows who takes the next step.',
      stages: [
        ['Project Manager', 'Creates the company, project, and task with a clear requirement, deadline, and department handoff.'],
        ['HOD', 'Reads the brief, assigns eligible department staff, and reviews the submitted work.'],
        ['Staff', 'Accepts the task, does the work, comments, uploads deliverables, and submits for approval.'],
        ['HOD review', 'Checks the deliverable, requests a revision when needed, and approves when ready.'],
        ['Client review', 'Reviews client-visible work, comments, requests changes, or approves the final deliverable.'],
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
