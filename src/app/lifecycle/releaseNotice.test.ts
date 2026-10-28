import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../shared/types/index';
import { allPermissions, defaultRolePermissions } from '../../shared/authorization/access';
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
  it('uses the same role personas as first-time onboarding', () => {
    expect(getReleaseNoticePersona(user({ role: 'Project Manager', isSuperAdmin: true }))).toBe('admin');
    expect(getReleaseNoticePersona(user({ role: 'Project Manager' }))).toBe('projectManager');
    expect(getReleaseNoticePersona(user({ role: 'HOD' }))).toBe('hod');
    expect(getReleaseNoticePersona(user())).toBe('staff');
    expect(getReleaseNoticePersona(user({ role: 'Client', companyName: 'UrbanEats' }))).toBe('client');
  });

  it('keeps client copy limited to client-safe features in both languages', () => {
    const client = user({ role: 'Client', companyName: 'UrbanEats' });
    const english = getReleaseNoticeCopy(client, 'en', defaultRolePermissions.Client);
    const chinese = getReleaseNoticeCopy(client, 'zh', defaultRolePermissions.Client);

    expect(english.title).toBe('Shared deliveries are easier to follow');
    expect(english.highlights.flatMap(item => [item.title, item.description]).join(' ')).not.toMatch(/price|pricing|member access|internal task/i);
    expect(english.highlights.some(item => item.title === 'Review and respond')).toBe(true);
    expect(chinese.title).toBe('共享交付更容易跟进');
    expect(chinese.acknowledgeLabel).toBe('继续使用 AiTask');
  });

  it('hides updates when the user does not have the permission they describe', () => {
    const client = user({ role: 'Client' });
    const permissions = { ...defaultRolePermissions.Client, clientReview: false };
    const copy = getReleaseNoticeCopy(client, 'en', permissions);

    expect(copy.highlights.some(item => item.title === 'Review and respond')).toBe(false);
    expect(copy.detailedHighlights.some(item => item.title === 'Record your acceptance')).toBe(false);
    expect(copy.highlights.length).toBeGreaterThan(0);
  });

  it('keeps each translated release notice concise and complete', () => {
    const personas: User[] = [
      user({ role: 'Project Manager', isSuperAdmin: true }),
      user({ role: 'Project Manager' }),
      user({ role: 'HOD' }),
      user({ role: 'Staff' }),
      user({ role: 'Client', companyName: 'UrbanEats' }),
    ];
    for (const member of personas) {
      for (const locale of ['en', 'zh'] as const) {
        const copy = getReleaseNoticeCopy(member, locale);
        expect(copy.eyebrow).toBeTruthy();
        expect(copy.title).toBeTruthy();
        expect(copy.description).toBeTruthy();
        expect(copy.highlights.length).toBeGreaterThanOrEqual(1);
        expect(copy.highlights.length).toBeLessThanOrEqual(5);
        expect(copy.highlights.every(item => item.title && item.description)).toBe(true);
        expect(copy.detailedHighlights.length).toBeGreaterThan(0);
        expect(copy.detailsLabel).toBeTruthy();
        expect(copy.backLabel).toBeTruthy();
        expect(copy.acknowledgeLabel).toBeTruthy();
      }
    }
  });

  it('filters the detailed copy by effective role permissions', () => {
    const clientCopy = getReleaseNoticeCopy(user({ role: 'Client' }), 'en', defaultRolePermissions.Client);
    const adminCopy = getReleaseNoticeCopy(user({ role: 'Project Manager', isSuperAdmin: true }), 'en', allPermissions);
    expect(clientCopy.detailedHighlights.some(item => /member access|role permissions/i.test(`${item.title} ${item.description}`))).toBe(false);
    expect(adminCopy.highlights.some(item => item.title === 'Manage member access')).toBe(true);
  });
});

describe('local release notice acknowledgement', () => {
  it('is versioned and scoped to the signed-in local account', () => {
    expect(RELEASE_NOTICE_ID).toBe('2026-10-project-workflows');
    expect(hasLocalReleaseNoticeAcknowledgement('member-1')).toBe(false);
    expect(acknowledgeLocalReleaseNotice('member-1')).toBe(true);
    expect(hasLocalReleaseNoticeAcknowledgement('member-1')).toBe(true);
    expect(hasLocalReleaseNoticeAcknowledgement('member-2')).toBe(false);
    expect(getLocalReleaseNoticeKey('member-1')).toContain(RELEASE_NOTICE_ID);
  });
});
