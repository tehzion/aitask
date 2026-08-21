import type { User } from '../types';
import { getDashboardPersona, type DashboardPersona } from './access';

export const RELEASE_NOTICE_ID = '2026-08-service-operations';

export interface ReleaseNoticeHighlight {
  title: string;
  description: string;
}

export interface ReleaseNoticeCopy {
  eyebrow: string;
  title: string;
  description: string;
  highlights: ReleaseNoticeHighlight[];
  acknowledgeLabel: string;
}

type ReleaseNoticeLocale = 'en' | 'zh';

const englishCopy: Record<DashboardPersona, ReleaseNoticeCopy> = {
  boss: {
    eyebrow: 'What’s new',
    title: 'Service operations are now in one calm workspace',
    description: 'AiTask now connects client scope, monthly delivery, and team execution without changing your existing work.',
    highlights: [
      { title: 'Build client plans your way', description: 'Start from a standard package, duplicate and customise it, or create a fully custom scope.' },
      { title: 'Keep every agreement intact', description: 'Saved plan, service, workflow, and pricing snapshots stay frozen for that client.' },
      { title: 'Run monthly delivery with clarity', description: 'Track cycles, deliverables, revisions, progress, and renewal dates from the client workspace.' },
      { title: 'See the right internal picture', description: 'Role workbenches and protected management values keep operational and financial access separate.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
  admin: {
    eyebrow: 'What’s new',
    title: 'Service operations are now in one calm workspace',
    description: 'AiTask now connects client scope, monthly delivery, and team execution without changing your existing work.',
    highlights: [
      { title: 'Build client plans your way', description: 'Start from a standard package, duplicate and customise it, or create a fully custom scope.' },
      { title: 'Keep every agreement intact', description: 'Saved plan, service, workflow, and pricing snapshots stay frozen for that client.' },
      { title: 'Run monthly delivery with clarity', description: 'Track cycles, deliverables, revisions, progress, and renewal dates from the client workspace.' },
      { title: 'See the right internal picture', description: 'Role workbenches and protected management values keep operational and financial access separate.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
  operation: {
    eyebrow: 'What’s new',
    title: 'A clearer way to run client delivery',
    description: 'Your operations workspace now keeps each client’s recurring work, execution steps, and approvals together.',
    highlights: [
      { title: 'Plan monthly delivery', description: 'Work from client service cycles, deliverable slots, and Included, Completed, and Remaining progress.' },
      { title: 'Generate per-service task chains', description: 'Create the defined task steps for a deliverable, then assign the right people and keep dependencies visible.' },
      { title: 'Publish with confidence', description: 'Move work through internal review and client approval before publishing a cycle for the client portal.' },
      { title: 'Stay inside your delivery scope', description: 'You can work with assigned clients and deliverables while commercial details remain protected.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
  production: {
    eyebrow: 'What’s new',
    title: 'Your production work is easier to follow',
    description: 'Assigned delivery work now carries its service context and the steps needed to take it from idea to output.',
    highlights: [
      { title: 'Work from clear task steps', description: 'See your assigned content, scripting, production, editing, review, revision, and posting work in order.' },
      { title: 'Keep dependencies visible', description: 'Soft dependency prompts show what is still waiting without preventing you from starting when needed.' },
      { title: 'See the delivery context', description: 'Tasks stay linked to the client cycle and deliverable so each output has a clear purpose.' },
      { title: 'Share the right status', description: 'Internal review and client-visible steps are clearly distinguished for the right audience.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
  account: {
    eyebrow: 'What’s new',
    title: 'A clearer account view of client service',
    description: 'Your workspace now brings package scope, renewal planning, and production output into one account-focused view.',
    highlights: [
      { title: 'Review active client packages', description: 'See the agreed service scope alongside each client’s active plan and delivery progress.' },
      { title: 'Plan ahead for renewals', description: 'Contract end dates and renewal reminders are visible where you manage the relationship.' },
      { title: 'Understand management value', description: 'Permitted internal monthly management values remain separate from day-to-day delivery work.' },
      { title: 'Follow production output', description: 'Use delivered work and completed tasks to understand team and supplier output.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
  client: {
    eyebrow: 'What’s new',
    title: 'Your client workspace is easier to follow',
    description: 'AiTask now gives you a clearer view of the service work your team has published for your company.',
    highlights: [
      { title: 'See your active service scope', description: 'Review the services included in your active plan without internal commercial details.' },
      { title: 'Follow published monthly delivery', description: 'See current cycles, deliverables, and progress once your agency publishes them.' },
      { title: 'Review the right work', description: 'Client-visible task steps and approval points make it clear when your feedback is needed.' },
      { title: 'Find updates in one place', description: 'Read client-visible comments and download shared files from the activity area.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
};

const chineseCopy: Record<DashboardPersona, ReleaseNoticeCopy> = {
  boss: {
    eyebrow: '最新更新',
    title: '客户服务运营现已集中在一个清晰的工作区',
    description: 'AiTask 现可将客户服务范围、月度交付与团队执行连接在一起，同时保留您原有的工作方式。',
    highlights: [
      { title: '按需要建立客户方案', description: '可使用标准配套、复制后自定义，或从零建立完全自定义的服务范围。' },
      { title: '保留每一份约定', description: '已保存方案、服务、任务步骤与价格快照会为该客户冻结保留。' },
      { title: '清晰管理月度交付', description: '可在客户工作区追踪周期、交付物、修订、进度与续约日期。' },
      { title: '查看合适的内部信息', description: '不同岗位工作台与受保护的管理数值，让运营及财务访问保持分隔。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
  admin: {
    eyebrow: '最新更新',
    title: '客户服务运营现已集中在一个清晰的工作区',
    description: 'AiTask 现可将客户服务范围、月度交付与团队执行连接在一起，同时保留您原有的工作方式。',
    highlights: [
      { title: '按需要建立客户方案', description: '可使用标准配套、复制后自定义，或从零建立完全自定义的服务范围。' },
      { title: '保留每一份约定', description: '已保存方案、服务、任务步骤与价格快照会为该客户冻结保留。' },
      { title: '清晰管理月度交付', description: '可在客户工作区追踪周期、交付物、修订、进度与续约日期。' },
      { title: '查看合适的内部信息', description: '不同岗位工作台与受保护的管理数值，让运营及财务访问保持分隔。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
  operation: {
    eyebrow: '最新更新',
    title: '以更清晰的方式管理客户交付',
    description: '运营工作区现可将每位客户的周期性工作、执行步骤与审批集中管理。',
    highlights: [
      { title: '规划月度交付', description: '依据客户服务周期、交付物槽位和包含、完成、剩余进度开展工作。' },
      { title: '为每项服务生成任务链', description: '为交付物生成已定义的任务步骤，再分配合适的成员并保持依赖关系可见。' },
      { title: '安心发布', description: '在向客户门户发布周期前，完成内部审核及客户审批。' },
      { title: '只处理自己的交付范围', description: '可处理已分配客户与交付物，同时商务资料会受到保护。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
  production: {
    eyebrow: '最新更新',
    title: '制作工作更容易跟进',
    description: '已分配的交付工作现在会带有服务背景，以及从创意到成品所需的任务步骤。',
    highlights: [
      { title: '按清晰步骤完成任务', description: '可依序查看已分配的内容、脚本、制作、剪辑、审核、修改及发布工作。' },
      { title: '保持依赖关系可见', description: '软依赖提示会说明仍在等待的前置工作，但不会在需要时阻止您开始。' },
      { title: '了解交付背景', description: '任务会关联到客户周期和交付物，让每项产出都有明确目的。' },
      { title: '分享正确的状态', description: '内部审核和客户可见步骤会被清楚区分，并向合适的对象展示。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
  account: {
    eyebrow: '最新更新',
    title: '更清晰地掌握客户服务',
    description: '您的工作区现可将服务配套、续约规划与制作产出集中在以客户关系为核心的视图中。',
    highlights: [
      { title: '查看启用中的客户配套', description: '可在客户的启用方案与交付进度旁查看已约定的服务范围。' },
      { title: '提前规划续约', description: '在管理客户关系的位置即可查看合同结束日期与续约提醒。' },
      { title: '了解管理服务价值', description: '获授权的内部月度管理数值会与日常交付工作保持分隔。' },
      { title: '追踪制作产出', description: '通过已交付工作和已完成任务了解团队与供应商的产出。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
  client: {
    eyebrow: '最新更新',
    title: '您的客户工作区更容易跟进',
    description: 'AiTask 现在可让您更清楚地查看团队已为贵公司发布的服务工作。',
    highlights: [
      { title: '查看启用中的服务范围', description: '可查看启用方案中包含的服务，但不会显示内部商务资料。' },
      { title: '跟进已发布的月度交付', description: '团队发布后，您可以查看当前周期、交付物和进度。' },
      { title: '审阅需要您参与的工作', description: '客户可见任务步骤和审批节点会清楚说明何时需要您的反馈。' },
      { title: '在一个位置找到更新', description: '可在动态区域查看客户可见评论并下载共享文件。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
};

export const getReleaseNoticePersona = (user: User): DashboardPersona => getDashboardPersona(user);

export const getReleaseNoticeCopy = (
  user: User,
  locale: ReleaseNoticeLocale,
): ReleaseNoticeCopy => (locale === 'zh' ? chineseCopy : englishCopy)[getReleaseNoticePersona(user)];

export const getLocalReleaseNoticeKey = (userId: string, noticeId = RELEASE_NOTICE_ID) => (
  `aitask:release-notice:${noticeId}:${userId}`
);

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
