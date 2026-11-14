import type { CustomRole, User } from '../types';
import { getDashboardPersona, isHodUser } from './access';

/** Bump for each release people should hear about; each id is acknowledged once per member. */
export const RELEASE_NOTICE_ID = '2026-11-start-wording';

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

/** Who the notice speaks to: only what changed for that role (role UX, 10 Nov 2026). */
export type ReleaseNoticeAudience = 'boss' | 'projectManager' | 'hod' | 'staff' | 'client';

type ReleaseNoticeLocale = 'en' | 'zh';

// 11 Nov 2026: "Activate" and "Publish" confused people, so plans and months now
// use Start / Running / Not started / In progress / Done (see serviceStatusLabels).
const startPlanEn: ReleaseNoticeHighlight = { title: 'Start plan', description: 'Replaces Activate plan. When the first month is already due, the button reads Start plan and this month.' };
const startPlanZh: ReleaseNoticeHighlight = { title: '启动方案', description: '取代“启用方案”。如果第一个月已经到期，按钮会显示“启动方案并开始本月”。' };
const startMonthEn: ReleaseNoticeHighlight = { title: 'Start month', description: 'Replaces Publish. The team can begin that month’s work, and the client sees its deliverables.' };
const startMonthZh: ReleaseNoticeHighlight = { title: '开始本月', description: '取代“发布”。团队即可开始当月工作，客户也会看到当月的交付物。' };
const statusesEn: ReleaseNoticeHighlight = { title: 'New status names', description: 'Plans show Running. Months show Not started, In progress or Done.' };
const statusesZh: ReleaseNoticeHighlight = { title: '新的状态名称', description: '方案显示“运行中”，月份显示“未开始”“进行中”或“已完成”。' };
const sameEn: ReleaseNoticeHighlight = { title: 'Only the words changed', description: 'Your plans, months, files and links work exactly as before.' };
const sameZh: ReleaseNoticeHighlight = { title: '只改了用词', description: '您的方案、月份、文件和链接一切照旧。' };

const eyebrowEn = 'What changed for you';
const eyebrowZh = '与您相关的更新';

const managerEn: ReleaseNoticeCopy = {
  eyebrow: eyebrowEn,
  title: 'Clearer words for plans and months',
  description: 'Activate and Publish are now Start, and every status says what is happening.',
  highlights: [startPlanEn, startMonthEn, statusesEn, sameEn],
  acknowledgeLabel: 'Happy working',
};
const managerZh: ReleaseNoticeCopy = {
  eyebrow: eyebrowZh,
  title: '方案与月份的用词更清晰',
  description: '“启用”和“发布”已改为“启动”和“开始”，每个状态都直接说明进展。',
  highlights: [startPlanZh, startMonthZh, statusesZh, sameZh],
  acknowledgeLabel: '开始工作吧',
};
const teamEn: ReleaseNoticeCopy = {
  eyebrow: eyebrowEn,
  title: 'Clearer names for client months',
  description: 'Client plans and months use plainer status names. Your own tasks have not changed.',
  highlights: [
    statusesEn,
    { title: 'Your tasks are unchanged', description: 'Task steps and buttons such as Start work and Send for review work as before.' },
  ],
  acknowledgeLabel: 'Happy working',
};
const teamZh: ReleaseNoticeCopy = {
  eyebrow: eyebrowZh,
  title: '客户月份的名称更清晰',
  description: '客户方案和月份使用更直白的状态名称。您自己的任务没有变化。',
  highlights: [
    statusesZh,
    { title: '您的任务保持不变', description: '“开始工作”“提交审核”等任务步骤和按钮照常使用。' },
  ],
  acknowledgeLabel: '开始工作吧',
};

const englishCopy: Record<ReleaseNoticeAudience, ReleaseNoticeCopy> = {
  boss: managerEn,
  projectManager: managerEn,
  hod: teamEn,
  staff: teamEn,
  client: {
    eyebrow: eyebrowEn,
    title: 'Clearer words for your monthly service',
    description: 'Your plan and months now use plainer status names.',
    highlights: [
      { title: 'Your plan', description: 'A plan that is underway shows Running.' },
      { title: 'Each month', description: 'Months show Not started, In progress or Done, so you can see where things stand.' },
      { title: 'Nothing else changed', description: 'Your deliveries, files and feedback are exactly where they were.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
};

const chineseCopy: Record<ReleaseNoticeAudience, ReleaseNoticeCopy> = {
  boss: managerZh,
  projectManager: managerZh,
  hod: teamZh,
  staff: teamZh,
  client: {
    eyebrow: eyebrowZh,
    title: '月度服务的用词更清晰',
    description: '您的方案和月份现在使用更直白的状态名称。',
    highlights: [
      { title: '您的方案', description: '正在进行的方案会显示“运行中”。' },
      { title: '每个月份', description: '月份会显示“未开始”“进行中”或“已完成”，方便您了解进展。' },
      { title: '其他一切不变', description: '您的交付、文件和反馈都保持原样。' },
    ],
    acknowledgeLabel: '开始工作吧',
  },
};

export const getReleaseNoticeAudience = (user: User, roles: CustomRole[] = []): ReleaseNoticeAudience => {
  const persona = getDashboardPersona(user);
  if (persona === 'boss' || persona === 'projectManager' || persona === 'client') return persona;
  return isHodUser(user, roles) ? 'hod' : 'staff';
};

export const getReleaseNoticeCopy = (
  user: User,
  locale: ReleaseNoticeLocale,
  roles: CustomRole[] = [],
): ReleaseNoticeCopy => (locale === 'zh' ? chineseCopy : englishCopy)[getReleaseNoticeAudience(user, roles)];

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
