import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import {
  RELEASE_NOTICE_ID,
  acknowledgeLocalReleaseNotice,
  getLocalReleaseNoticeKey,
  getReleaseNoticeCopy,
  getReleaseNoticePersona,
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

describe('release notice personas', () => {
  it('uses the same persona rules as the role workbenches', () => {
    expect(getReleaseNoticePersona(user({ role: 'Admin', isSuperAdmin: true, departments: ['Management'], department: 'Management' }))).toBe('boss');
    expect(getReleaseNoticePersona(user({ role: 'Admin', departments: ['Management'], department: 'Management' }))).toBe('admin');
    expect(getReleaseNoticePersona(user({ departments: ['Operation'], department: 'Operation' }))).toBe('operation');
    expect(getReleaseNoticePersona(user({ departments: ['Account & Finance'], department: 'Account & Finance' }))).toBe('account');
    expect(getReleaseNoticePersona(user())).toBe('production');
    expect(getReleaseNoticePersona(user({ role: 'Client', departments: ['Client'], department: 'Client', companyName: 'UrbanEats' }))).toBe('client');
  });

  it('keeps client copy limited to client-safe features and translates the full notice', () => {
    const client = user({ role: 'Client', departments: ['Client'], department: 'Client', companyName: 'UrbanEats' });
    const english = getReleaseNoticeCopy(client, 'en');
    const chinese = getReleaseNoticeCopy(client, 'zh');

    expect(english.title).toContain('client workspace');
    expect(english.highlights.flatMap(item => [item.title, item.description]).join(' ')).not.toMatch(/price|pricing|internal task/i);
    expect(chinese.title).toContain('客户工作区');
    expect(chinese.acknowledgeLabel).toBe('开始工作吧');
  });
});

describe('local release notice acknowledgement', () => {
  it('is versioned and scoped to the signed-in local account', () => {
    expect(RELEASE_NOTICE_ID).toBe('2026-08-service-operations');
    expect(hasLocalReleaseNoticeAcknowledgement('member-1')).toBe(false);
    expect(acknowledgeLocalReleaseNotice('member-1')).toBe(true);
    expect(hasLocalReleaseNoticeAcknowledgement('member-1')).toBe(true);
    expect(hasLocalReleaseNoticeAcknowledgement('member-2')).toBe(false);
    expect(getLocalReleaseNoticeKey('member-1')).toContain(RELEASE_NOTICE_ID);
  });
});
