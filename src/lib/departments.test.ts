import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import {
  getMemberDepartments,
  isMemberInDepartment,
  normalizeDepartments,
  normalizeMemberDepartments,
} from './departments';

describe('member departments', () => {
  it('canonicalizes legacy labels, removes aliases, and keeps configured order', () => {
    expect(normalizeDepartments(['Designer', 'Editor', 'Video Editor', 'Videoshooting'])).toEqual([
      'Video Shooting',
      'Video Editor',
      'Designer',
    ]);
  });

  it('falls back to a legacy singular department for old member records', () => {
    expect(normalizeMemberDepartments('Staff', undefined, 'Editor')).toEqual(['Video Editor']);
  });

  it('keeps Client accounts isolated to Client', () => {
    expect(normalizeMemberDepartments('Client', ['Designer'], 'Designer')).toEqual(['Client']);
  });

  it('treats every selected internal department as assignment eligibility', () => {
    const member: User = {
      id: 'multi-department-staff',
      name: 'Multi Staff',
      role: 'Staff',
      departments: ['Designer', 'Video Editor'],
    };
    expect(getMemberDepartments(member)).toEqual(['Video Editor', 'Designer']);
    expect(isMemberInDepartment(member, 'Designer')).toBe(true);
    expect(isMemberInDepartment(member, 'Editor')).toBe(true);
    expect(isMemberInDepartment(member, 'Operation')).toBe(false);
  });
});
