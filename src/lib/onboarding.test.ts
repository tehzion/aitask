import { afterEach, describe, expect, it } from 'vitest';
import type { User } from '../types';
import {
  clearOnboardingStatus,
  getHelpCopy,
  getOnboardingPersona,
  getOnboardingRecord,
  getOnboardingSteps,
  getAllTutorialProgress,
  markTutorialCompleted,
  markTutorialStarted,
  markTutorialViewed,
  shouldAutoOpenOnboarding,
  setOnboardingStatus,
} from './onboarding';

const user = (overrides: Partial<User> = {}) => ({
  id: 'onboarding-user',
  name: 'Onboarding user',
  role: 'Staff',
  departments: ['Designer'],
  ...overrides,
} as User);

afterEach(() => clearOnboardingStatus('onboarding-user'));

describe('onboarding persona routing', () => {
  it('routes built-in and custom HOD users to the HOD guide', () => {
    expect(getOnboardingPersona(user({ role: 'HOD' }))).toBe('hod');
    expect(getOnboardingPersona(user({ customRoleId: 'builtin-hod' }))).toBe('hod');
  });

  it('keeps the client guide separate from internal work', () => {
    expect(getOnboardingPersona(user({ role: 'Client', companyName: 'Client Co' }))).toBe('client');
    expect(getOnboardingPersona(user({ role: 'Project Manager' }))).toBe('projectManager');
    expect(getOnboardingPersona(user({ isSuperAdmin: true }))).toBe('admin');
  });
});

describe('onboarding content and persistence', () => {
  it('provides bilingual role-specific steps with real target names', () => {
    const english = getOnboardingSteps('projectManager', 'en');
    const chinese = getOnboardingSteps('projectManager', 'zh');
    expect(english.length).toBeGreaterThan(4);
    expect(english.some(step => step.target === 'create-task')).toBe(true);
    expect(english.find(step => step.id === 'workflow')?.title).toContain('handoff');
    expect(chinese.find(step => step.id === 'workflow')?.title).toContain('交接');
  });

  it('gives every persona a route for each first-login onboarding step', () => {
    const targets = new Set([
      'dashboard-overview', 'projects-overview', 'create-task', 'approvals-overview', 'reports-overview',
      'tasks-overview', 'help-overview', 'clients-overview', 'delivery-search',
    ]);

    (['admin', 'projectManager', 'hod', 'staff', 'client'] as const).forEach(persona => {
      getOnboardingSteps(persona, 'en').forEach(step => {
        expect(step.path).toMatch(/^\//);
        expect(targets.has(step.target)).toBe(true);
      });
    });
  });

  it('stores completion separately by user and exposes client privacy guidance', () => {
    expect(getOnboardingRecord('onboarding-user')).toBeNull();
    setOnboardingStatus('onboarding-user', 'completed');
    expect(getOnboardingRecord('onboarding-user')?.status).toBe('completed');
    expect(getOnboardingRecord('another-user')).toBeNull();
    expect(getHelpCopy('client', 'en').steps.join(' ')).toContain('stay private');
  });

  it('does not interrupt seeded demo fixtures while keeping fresh users eligible', () => {
    expect(shouldAutoOpenOnboarding('u-boss')).toBe(false);
    expect(shouldAutoOpenOnboarding('new-onboarding-user')).toBe(true);
  });

  it('keeps tutorial progress private to each user and records the latest step', () => {
    const firstUser = 'tutorial-progress-user-a';
    const secondUser = 'tutorial-progress-user-b';
    markTutorialStarted(firstUser, 'create-task');
    markTutorialViewed(firstUser, 'create-task', 1);
    expect(getAllTutorialProgress(firstUser)['create-task']?.lastStep).toBe(1);
    expect(getAllTutorialProgress(secondUser)['create-task']).toBeUndefined();

    markTutorialCompleted(firstUser, 'create-task', 2);
    expect(getAllTutorialProgress(firstUser)['create-task']?.completedAt).toBeTruthy();
    expect(getAllTutorialProgress(firstUser)['create-task']?.lastStep).toBe(2);
  });
});
