import { describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import {
  canAccessPath, canAssignTasksToOthers, canCreateClientProfiles, canCreateTasks, canCreateTasksFromAnywhere,
  canCreateUsers, canDeleteClientProfiles, canEditTask, canManageClientPlans, canManageProjects,
  canManageServiceCycles, canManageUsers, canViewServicePrices, canViewTask,
} from './access';
import { getNavigationSections } from './navigation';

/**
 * The agreed role model, written down once so any drift fails loudly:
 * - Boss Koo (super admin) administers everything.
 * - A Project Manager is the highest working role: creates tasks anywhere,
 *   adds companies, manages company details, plans, projects and prices, and
 *   hands work to an HOD.
 * - An HOD receives that work, accepts it and delegates to Staff inside the
 *   department; creates tasks only inside a project they belong to. An HOD may
 *   also add and delete company profiles (confirmed by the owner, 19 Nov 2026).
 * - Staff receive assigned work and update it. They create nothing.
 * - A Client only reviews their own company's client-visible work.
 */
const member = (id: string, role: User['role'], extra: Partial<User> = {}): User => (
  { id, name: id, role, departments: ['Designer'], department: 'Designer', ...extra } as User
);
const actors = {
  boss: member('boss', 'Project Manager', { isSuperAdmin: true, departments: ['Management'], department: 'Management' }),
  pm: member('pm', 'Project Manager', { departments: ['Management'], department: 'Management' }),
  hod: member('hod', 'HOD'),
  staff: member('staff', 'Staff'),
  client: member('client', 'Client', { companyName: 'Acme', departments: ['Client'], department: 'Client' }),
} as const;
type Actor = keyof typeof actors;
const ALL: Actor[] = ['boss', 'pm', 'hod', 'staff', 'client'];

const who = (...allowed: Actor[]) => allowed;
const expectOnly = (check: (user: User) => unknown, allowed: Actor[]) => {
  for (const actor of ALL) expect(Boolean(check(actors[actor])), actor).toBe(allowed.includes(actor));
};

const task = { id: 't', title: 't', clientName: 'Acme', department: 'Designer', assignedTo: 'staff', createdBy: 'pm', status: 'Pending', isCompleted: false, visibility: 'internal' } as unknown as Task;
const scope = {
  clients: [{ id: 'c', clientName: 'Acme', createdBy: 'pm' }],
  projects: [{ id: 'p', clientId: 'c', clientName: 'Acme', projectName: 'P', createdBy: 'pm', projectManagerIds: ['pm'], hodMemberIds: ['hod'] }] as unknown as Project[],
  users: Object.values(actors),
} as never;

describe('role capability matrix', () => {
  it('limits who administers members', () => {
    expectOnly(user => canManageUsers(user), who('boss'));
    expectOnly(user => canCreateUsers(user), who('boss'));
  });
  it('gives creating and handing out work to the PM, with the HOD limited to projects', () => {
    expectOnly(user => canCreateTasks(user), who('boss', 'pm', 'hod'));
    expectOnly(user => canCreateTasksFromAnywhere(user), who('boss', 'pm'));
    expectOnly(user => canAssignTasksToOthers(user), who('boss', 'pm', 'hod'));
  });
  it('keeps company, plan, project and price management with the PM', () => {
    expectOnly(user => canManageProjects(user), who('boss', 'pm'));
    expectOnly(user => canManageClientPlans(user), who('boss', 'pm'));
    expectOnly(user => canManageServiceCycles(user), who('boss', 'pm'));
    expectOnly(user => canViewServicePrices(user), who('boss', 'pm'));
    expectOnly(user => canCreateClientProfiles(user), who('boss', 'pm', 'hod'));
    expectOnly(user => canDeleteClientProfiles(user), who('boss', 'pm', 'hod'));
  });
  it('lets the people on a task see and work on it, and never the Client', () => {
    expectOnly(user => canViewTask(user, task, [], scope), who('boss', 'pm', 'hod', 'staff'));
    expectOnly(user => canEditTask(user, task, [], scope), who('boss', 'pm', 'hod', 'staff'));
  });
  it('restricts the approvals page to the PM and Boss', () => {
    expectOnly(user => canAccessPath(user, '/approvals'), who('boss', 'pm'));
    for (const path of ['/', '/tasks', '/calendar', '/clients', '/projects', '/reports', '/settings']) {
      for (const actor of ALL) expect(canAccessPath(actors[actor], path), `${actor} ${path}`).toBe(true);
    }
  });
  it('never offers a navigation entry the role cannot open', () => {
    for (const actor of ALL) {
      const sections = getNavigationSections(actors[actor]);
      for (const item of [...sections.primary, ...sections.secondary, ...(sections.mobilePrimary || [])]) {
        if (item.path === '/notifications' || item.path === '/help') continue;
        expect(canAccessPath(actors[actor], item.path), `${actor} ${item.path}`).toBe(true);
      }
    }
  });
  it('puts the daily destinations of each working role in the main menu', () => {
    const paths = (actor: Actor) => getNavigationSections(actors[actor]).primary.map(item => item.path);
    expect(paths('pm')).toContain('/tasks');
    expect(paths('hod')).toEqual(expect.arrayContaining(['/', '/tasks']));
    expect(paths('staff')).toEqual(expect.arrayContaining(['/', '/tasks']));
    expect(paths('staff')).not.toContain('/approvals');
  });
});
