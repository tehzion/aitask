import { describe, expect, it } from 'vitest';
import { dateChangeNoticeMessage, isBossMilestoneStatusMove, isLowClientRating, withoutRoutineBossNotice } from './notificationRules';

const users = [
  { id: 'boss', isSuperAdmin: true },
  { id: 'pm', isSuperAdmin: false },
  { id: 'staff', isSuperAdmin: undefined },
];

describe('Boss milestone status moves', () => {
  it('counts approval, completion, cancellation and sending work back', () => {
    expect(isBossMilestoneStatusMove('Waiting Approval', 'Approved')).toBe(true);
    expect(isBossMilestoneStatusMove('Approved', 'Completed')).toBe(true);
    expect(isBossMilestoneStatusMove('In Progress', 'Cancelled')).toBe(true);
    expect(isBossMilestoneStatusMove('Waiting Approval', 'Revision')).toBe(true);
    expect(isBossMilestoneStatusMove('Completed', 'In Progress')).toBe(true);
  });

  it('leaves everyday moves out', () => {
    expect(isBossMilestoneStatusMove('Pending', 'In Progress')).toBe(false);
    expect(isBossMilestoneStatusMove('In Progress', 'Waiting Approval')).toBe(false);
    expect(isBossMilestoneStatusMove('Revision', 'In Progress')).toBe(false);
    expect(isBossMilestoneStatusMove('In Progress', 'In Progress')).toBe(false);
  });
});

describe('withoutRoutineBossNotice', () => {
  it('removes only Boss Koo from an everyday move', () => {
    expect(withoutRoutineBossNotice(['boss', 'pm', 'staff'], users, 'Pending', 'In Progress')).toEqual(['pm', 'staff']);
  });

  it('keeps everyone for a milestone', () => {
    expect(withoutRoutineBossNotice(['boss', 'pm'], users, 'Waiting Approval', 'Approved')).toEqual(['boss', 'pm']);
  });
});

describe('client rating and date notices', () => {
  it('treats one and two stars as needing follow-up', () => {
    expect([1, 2].every(isLowClientRating)).toBe(true);
    expect([3, 4, 5, 0, undefined].some(stars => isLowClientRating(stars))).toBe(false);
  });

  it('adds a short reason to the date notice', () => {
    expect(dateChangeNoticeMessage('Poster', 'Mia')).toBe('The start date or due date for "Poster" was updated by Mia.');
    expect(dateChangeNoticeMessage('Poster', 'Mia', '  Client sent new copy  ')).toContain('Reason: Client sent new copy');
    expect(dateChangeNoticeMessage('Poster', 'Mia', 'x'.repeat(300))).toMatch(/Reason: x{199}…$/);
  });
});
