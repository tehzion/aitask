import type { CustomRole, User } from '../types';
import { getDashboardPersona, isHodUser } from './access';

/** Bump for each release people should hear about; each id is acknowledged once per member. */
export const RELEASE_NOTICE_ID = '2026-11-everyday-saves';

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

const savesEn: ReleaseNoticeHighlight = { title: 'Changes save on their own', description: 'If the connection drops, your change is kept and saved automatically. A note beside the task shows Saving… and then Saved.' };
const savesZh: ReleaseNoticeHighlight = { title: '更改会自动保存', description: '网络中断时，您的更改会被保留并自动保存。任务旁会显示“保存中…”，然后显示“已保存”。' };
const rowsEn: ReleaseNoticeHighlight = { title: 'Next step on each row', description: 'Task lists offer the next step, such as Start work or Send for review, without opening the task.' };
const rowsZh: ReleaseNoticeHighlight = { title: '每行直接显示下一步', description: '任务列表直接提供下一步操作，例如“开始工作”或“提交审核”，无需打开任务。' };
const defaultsEn: ReleaseNoticeHighlight = { title: 'New task remembers your choices', description: 'New task reuses your last department and shows Last used, with Clear to start fresh.' };
const defaultsZh: ReleaseNoticeHighlight = { title: '新建任务会记住您的选择', description: '新建任务会沿用您上次的部门，并显示“上次使用”，可点击“清除”重新选择。' };

const eyebrowEn = 'What changed for you';
const eyebrowZh = '与您相关的更新';

const englishCopy: Record<ReleaseNoticeAudience, ReleaseNoticeCopy> = {
  boss: {
    eyebrow: eyebrowEn,
    title: 'Dependable saves and a clearer view of staffing',
    description: 'This update keeps changes from getting lost and shows where the team needs people.',
    highlights: [
      savesEn,
      { title: 'Staffing gaps lead to the team', description: 'Select a department in Staffing gaps to open its members, with pending sign-ups first.' },
      rowsEn,
      defaultsEn,
    ],
    acknowledgeLabel: 'Happy working',
  },
  projectManager: {
    eyebrow: eyebrowEn,
    title: 'Approve faster and stop worrying about saves',
    description: 'Fewer clicks for everyday reviews, and changes that save themselves.',
    highlights: [
      { title: 'Approve several at once', description: 'On your dashboard, tick submitted tasks and approve them together. To return work with a note, open the task.' },
      rowsEn,
      savesEn,
      defaultsEn,
    ],
    acknowledgeLabel: 'Happy working',
  },
  hod: {
    eyebrow: eyebrowEn,
    title: 'See what waits on you and hand it out faster',
    description: 'Your department’s assignments and reviews are easier to find and act on.',
    highlights: [
      { title: 'What waits on you', description: 'The badge on My work counts tasks to assign and reviews where you are the reviewer.' },
      { title: 'Assign from the list', description: 'Use Assign to… on a task row to hand work to your Staff without opening the task.' },
      { title: 'Do it myself', description: 'When your department has no Staff, take the task yourself in one click.' },
      savesEn,
    ],
    acknowledgeLabel: 'Happy working',
  },
  staff: {
    eyebrow: eyebrowEn,
    title: 'Your list now starts with what to do today',
    description: 'Urgent work comes first, and your changes save even on a weak connection.',
    highlights: [
      { title: 'Today first', description: 'Your list starts with overdue work, then due today, revisions and work in progress. Blocked work goes last.' },
      { title: 'Reviewer note on the card', description: 'When work comes back for a revision, the reviewer’s note shows on the task card.' },
      rowsEn,
      savesEn,
    ],
    acknowledgeLabel: 'Happy working',
  },
  client: {
    eyebrow: eyebrowEn,
    title: 'Your progress is easier to read',
    description: 'Your dashboard now shows each service’s progress for the month.',
    highlights: [
      { title: 'This month by service', description: 'See how far each service has come this month, such as 6 of 8 completed.' },
      { title: 'Ready counts as completed', description: 'Work your team has marked Ready now counts toward your completed total.' },
      { title: 'Your feedback is kept', description: 'If the connection drops while you leave feedback, it is kept and saved automatically.' },
    ],
    acknowledgeLabel: 'Happy working',
  },
};

const chineseCopy: Record<ReleaseNoticeAudience, ReleaseNoticeCopy> = {
  boss: {
    eyebrow: eyebrowZh,
    title: '保存更可靠，人员情况更清晰',
    description: '本次更新避免更改丢失，并显示团队哪里缺人。',
    highlights: [
      savesZh,
      { title: '从人员缺口直达团队', description: '在“人员缺口”中选择部门即可打开其成员，待审核的注册申请排在最前。' },
      rowsZh,
      defaultsZh,
    ],
    acknowledgeLabel: '开始工作吧',
  },
  projectManager: {
    eyebrow: eyebrowZh,
    title: '更快审批，不再担心保存',
    description: '日常审核步骤更少，更改也会自动保存。',
    highlights: [
      { title: '批量批准', description: '在您的仪表板中勾选已提交的任务并一次批准。如需附说明退回，请打开任务。' },
      rowsZh,
      savesZh,
      defaultsZh,
    ],
    acknowledgeLabel: '开始工作吧',
  },
  hod: {
    eyebrow: eyebrowZh,
    title: '看清待您处理的工作，更快分配',
    description: '部门的分配与审核更容易找到和处理。',
    highlights: [
      { title: '待您处理', description: '“我的工作”上的标记会统计待分配任务，以及由您审核的任务。' },
      { title: '在列表中分配', description: '在任务行使用“分配给…”，无需打开任务即可交给员工。' },
      { title: '我自己来做', description: '部门没有员工时，一键由您自己接手任务。' },
      savesZh,
    ],
    acknowledgeLabel: '开始工作吧',
  },
  staff: {
    eyebrow: eyebrowZh,
    title: '列表现在先显示今天要做的事',
    description: '紧急工作排在最前，网络不稳时您的更改也会保存。',
    highlights: [
      { title: '今天优先', description: '列表依次显示逾期工作、今天到期、修订和进行中的工作，被阻塞的工作排在最后。' },
      { title: '卡片上显示审核意见', description: '工作被退回修订时，审核人的意见会显示在任务卡片上。' },
      rowsZh,
      savesZh,
    ],
    acknowledgeLabel: '开始工作吧',
  },
  client: {
    eyebrow: eyebrowZh,
    title: '进度更容易查看',
    description: '您的仪表板现在会显示每项服务本月的进度。',
    highlights: [
      { title: '本月各项服务', description: '查看每项服务本月的进度，例如已完成 6/8。' },
      { title: '“待交付”计为已完成', description: '团队标记为“待交付”的工作现在会计入已完成总数。' },
      { title: '您的反馈会被保留', description: '留下反馈时如果网络中断，反馈会被保留并自动保存。' },
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
