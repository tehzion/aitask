import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import {
  RELEASE_NOTICE_ID,
  acknowledgeLocalReleaseNotice,
  getLocalReleaseNoticeKey,
  getReleaseNoticeCopy,
  getReleaseNoticeAudience,
  hasLocalReleaseNoticeAcknowledgement,
} from './releaseNotice';

const user = (overrides: Partial<User> = {}): User => ({
  id: 'member-1',
  name: 'Demo member',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
  ...overrides,
});

const localStorage = new Map<string, string>();

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => localStorage.get(key) ?? null,
      setItem: (key: string, value: string) => localStorage.set(key, value),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('release notice audiences', () => {
  it('speaks to boss, PM, HOD, Staff and client separately', () => {
    expect(getReleaseNoticeAudience(user({ role: 'Project Manager', isSuperAdmin: true, departments: ['Management'], department: 'Management' }))).toBe('boss');
    expect(getReleaseNoticeAudience(user({ role: 'Project Manager', departments: ['Management'], department: 'Management' }))).toBe('projectManager');
    expect(getReleaseNoticeAudience(user({ role: 'HOD', customRoleId: 'builtin-hod' }))).toBe('hod');
    expect(getReleaseNoticeAudience(user({ departments: ['Operation'], department: 'Operation' }))).toBe('staff');
    expect(getReleaseNoticeAudience(user({ departments: ['Account & Finance'], department: 'Account & Finance' }))).toBe('staff');
    expect(getReleaseNoticeAudience(user())).toBe('staff');
    expect(getReleaseNoticeAudience(user({ role: 'Client', departments: ['Client'], department: 'Client', companyName: 'UrbanEats' }))).toBe('client');
  });

  it('keeps client copy to client-safe changes and translates every notice', () => {
    const client = user({ role: 'Client', departments: ['Client'], department: 'Client', companyName: 'UrbanEats' });
    const english = getReleaseNoticeCopy(client, 'en');
    const chinese = getReleaseNoticeCopy(client, 'zh');
    expect(english.title).toBe('Your progress is easier to read');
    expect(english.highlights.flatMap(item => [item.title, item.description]).join(' ')).not.toMatch(/price|pricing|internal|staff|approve several/i);
    expect(chinese.title).toBe('进度更容易查看');
    expect(chinese.acknowledgeLabel).toBe('开始工作吧');
    const staff = getReleaseNoticeCopy(user(), 'en').highlights.map(item => item.title).join(' ');
    expect(staff).not.toMatch(/Approve several|Staffing gaps|Assign from the list/);
    for (const member of [user({ role: 'Project Manager', isSuperAdmin: true }), user({ role: 'Project Manager' }), user({ role: 'HOD', customRoleId: 'builtin-hod' }), user(), client]) {
      const en = getReleaseNoticeCopy(member, 'en');
      const zh = getReleaseNoticeCopy(member, 'zh');
      expect(zh.highlights).toHaveLength(en.highlights.length);
      expect(zh.title).not.toBe(en.title);
    }
  });
});

describe('local release notice acknowledgement', () => {
  it('is versioned and scoped to the signed-in local account', () => {
    expect(RELEASE_NOTICE_ID).toBe('2026-11-everyday-saves');
    expect(hasLocalReleaseNoticeAcknowledgement('member-1')).toBe(false);
    expect(acknowledgeLocalReleaseNotice('member-1')).toBe(true);
    expect(hasLocalReleaseNoticeAcknowledgement('member-1')).toBe(true);
    expect(hasLocalReleaseNoticeAcknowledgement('member-2')).toBe(false);
    expect(getLocalReleaseNoticeKey('member-1')).toContain(RELEASE_NOTICE_ID);
  });
});
