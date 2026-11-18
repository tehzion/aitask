import { describe, expect, it } from 'vitest';
import type { ClientProfile, Project, Task, User } from '../types';
import { getVisibleTasks } from './access';

/**
 * Client-side task visibility must equal what the database lets each member
 * read. The same fixture and the same expected lists live in
 * supabase/tests/database/visibility_parity.test.sql; change both together.
 */
const member = (id: string, role: User['role'], departments: string[]): User => (
  { id, name: id, role, departments, department: departments[0] } as unknown as User
);
const pmA = member('par-pm-a', 'Project Manager', ['Management']);
const pmB = member('par-pm-b', 'Project Manager', ['Management']);
const hod = member('par-hod', 'HOD', ['Designer']);
const staff1 = member('par-staff-1', 'Staff', ['Designer']);
const staff2 = member('par-staff-2', 'Staff', ['Video Editor']);
const users = [pmA, pmB, hod, staff1, staff2];

const clients = [
  { id: 'par-c-a', clientName: 'Alpha Co', createdBy: pmA.id },
  { id: 'par-c-b', clientName: 'Beta Co', createdBy: pmB.id },
] as unknown as ClientProfile[];
const projects = [
  { id: 'par-p-a', clientId: 'par-c-a', clientName: 'Alpha Co', projectName: 'A', createdBy: pmA.id, projectManagerIds: [pmA.id], hodMemberIds: [hod.id] },
  { id: 'par-p-b', clientId: 'par-c-b', clientName: 'Beta Co', projectName: 'B', createdBy: pmB.id, projectManagerIds: [pmB.id], hodMemberIds: [] },
] as unknown as Project[];

const task = (id: string, values: Partial<Task>) => ({ id, title: id, status: 'Pending', isCompleted: false, visibility: 'internal', ...values }) as unknown as Task;
const tasks = [
  task('par-t1', { clientId: 'par-c-a', clientName: 'Alpha Co', projectId: 'par-p-a', department: 'Designer', assignedTo: staff1.id, responsibleHodId: hod.id, createdBy: pmA.id }),
  task('par-t2', { clientId: 'par-c-a', clientName: 'Alpha Co', projectId: 'par-p-a', department: 'Designer', createdBy: pmA.id }),
  task('par-t3', { clientId: 'par-c-b', clientName: 'Beta Co', projectId: 'par-p-b', department: 'Video Editor', assignedTo: staff2.id, createdBy: pmB.id }),
  task('par-t4', { clientId: 'par-c-a', clientName: 'Alpha Co', department: 'Designer', createdBy: pmA.id }),
  task('par-t5', { clientId: 'par-c-b', clientName: 'Beta Co', projectId: 'par-p-b', department: 'Designer', assignedTo: staff1.id, createdBy: pmB.id }),
  task('par-t6', { clientId: 'par-c-b', clientName: 'Beta Co', department: 'Designer', assignedTo: hod.id, createdBy: pmB.id }),
];

const expectedVisibleTaskIds: Record<string, string[]> = {
  'par-pm-a': ['par-t1', 'par-t2', 'par-t4'],
  'par-pm-b': ['par-t3', 'par-t5', 'par-t6'],
  'par-hod': ['par-t1', 'par-t2', 'par-t4', 'par-t6'],
  'par-staff-1': ['par-t1', 'par-t5'],
  'par-staff-2': ['par-t3'],
};

describe('client and database task visibility parity', () => {
  it.each(users)('$id sees the tasks the database lets them read', user => {
    const ids = getVisibleTasks(user, tasks, [], { clients, projects, users }).map(item => item.id).sort();
    expect(ids).toEqual(expectedVisibleTaskIds[user.id]);
  });
});
