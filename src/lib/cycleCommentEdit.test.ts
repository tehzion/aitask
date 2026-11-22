import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { canEditCycleComment } from './access';

const user = (role: User['role'], id = role.toLowerCase()) => ({ id, name: role, role, departments: [], department: 'Designer' }) as unknown as User;
const own = (author: string) => ({ userId: author });

describe('who may edit an activity', () => {
  it('lets a PM edit anyone’s entry in scope, and Boss too', () => {
    expect(canEditCycleComment(user('Project Manager'), own('someone-else'))).toBe(true);
    expect(canEditCycleComment({ ...user('Project Manager', 'boss'), isSuperAdmin: true }, own('someone-else'))).toBe(true);
  });

  it('lets a HOD edit only their own entry', () => {
    expect(canEditCycleComment(user('HOD', 'h1'), own('h1'))).toBe(true);
    expect(canEditCycleComment(user('HOD', 'h1'), own('other'))).toBe(false);
  });

  it('keeps plain Staff and clients out, matching the database rule', () => {
    expect(canEditCycleComment(user('Staff', 's1'), own('s1'))).toBe(false);
    expect(canEditCycleComment(user('Client', 'c1'), own('c1'))).toBe(false);
    expect(canEditCycleComment(null, own('x'))).toBe(false);
  });
});
