import { describe, expect, it } from 'vitest';
import type { ClientServicePlan, Deliverable, Project, ServiceCycle, Task, User } from '../types';
import {
  getManagementAttentionItems,
  getManagementSnapshot,
  getMonthlyOperationalReport,
  getOverdueDeliverables,
  getSharedEmployeeWorkload,
} from './managementIntelligence';

const now = new Date('2026-10-21T12:00:00.000Z');

const user = (id: string, role: User['role'], name = id): User => ({
  id,
  name,
  email: `${id}@example.test`,
  role,
  departments: ['Operation'],
});

const project = (id: string, status: Project['status'] = 'Active', projectManagerIds = ['pm-a']): Project => ({
  id,
  clientId: `client-${id}`,
  clientName: `Client ${id}`,
  projectName: `Project ${id}`,
  services: ['Social Media'],
  startDate: '2026-10-01',
  deadline: '2026-11-30',
  status,
  projectManagerIds,
});

const task = (id: string, projectId: string, overrides: Partial<Task> = {}): Task => ({
  id,
  clientId: `client-${projectId}`,
  projectId,
  clientName: `Client ${projectId}`,
  projectName: `Project ${projectId}`,
  serviceType: 'Social Media',
  title: `Task ${id}`,
  description: '',
  department: 'Operation',
  assignedTo: 'staff-a',
  createdBy: 'pm-a',
  startDate: '2026-10-01',
  dueDate: '2026-10-20',
  priority: 'High',
  status: 'In Progress',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  ...overrides,
});

const plan = (id: string, overrides: Partial<ClientServicePlan> = {}): ClientServicePlan => ({
  id,
  clientId: `client-${id}`,
  clientName: `Client ${id}`,
  name: `Monthly ${id}`,
  origin: 'custom',
  revision: 1,
  status: 'Active',
  currency: 'MYR',
  serviceItems: [],
  discountType: 'none',
  discountValue: 0,
  taxRateBps: 0,
  startDate: '2026-10-01',
  billingDay: 30,
  contractEndDate: '2026-10-24',
  createdBy: 'boss',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const cycle = (id: string, clientId: string, periodEnd: string): ServiceCycle => ({
  id,
  clientId,
  clientName: clientId,
  planId: `plan-${clientId}`,
  planRevision: 1,
  periodStart: '2026-10-01',
  periodEnd,
  status: 'Published',
  currency: 'MYR',
  serviceItems: [],
  addonSnapshots: [],
  discountType: 'none',
  discountValue: 0,
  taxRateBps: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const deliverable = (id: string, clientId: string, cycleId: string, overrides: Partial<Deliverable> = {}): Deliverable => ({
  id,
  clientId,
  clientName: clientId,
  planId: `plan-${clientId}`,
  cycleId,
  serviceItemId: 'service-1',
  sequence: 1,
  title: `Deliverable ${id}`,
  status: 'In Progress',
  taskIds: [],
  attachments: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('management intelligence', () => {
  it('counts company metrics from visible records and counts multi-PM projects once', () => {
    const projects = [project('a', 'Active', ['pm-a', 'pm-b']), project('b', 'Completed', ['pm-b'])];
    const tasks = [task('late', 'a'), task('waiting', 'a', { status: 'Waiting Approval', dueDate: '2026-10-25' })];
    const snapshot = getManagementSnapshot({
      projects,
      tasks,
      deliverables: [],
      clientPlans: [plan('a')],
      serviceCycles: [],
      users: [user('pm-a', 'Project Manager', 'PM A'), user('pm-b', 'Project Manager', 'PM B')],
      now,
    });

    expect(snapshot.activeProjects).toBe(1);
    expect(snapshot.completedProjects).toBe(1);
    expect(snapshot.atRiskProjects).toBe(1);
    expect(snapshot.overdueTasks).toBe(1);
    expect(snapshot.pendingApprovals).toBe(1);
    expect(snapshot.projectManagers.find(row => row.member.id === 'pm-a')).toMatchObject({ projects: 1, overdueTasks: 1 });
    expect(snapshot.projectManagers.find(row => row.member.id === 'pm-b')).toMatchObject({ projects: 2, overdueTasks: 1 });
  });

  it('uses cycle end dates for overdue deliverables', () => {
    const overdue = deliverable('late', 'client-a', 'cycle-a');
    const current = deliverable('current', 'client-a', 'cycle-b');
    expect(getOverdueDeliverables([overdue, current], [cycle('cycle-a', 'client-a', '2026-10-20'), cycle('cycle-b', 'client-a', '2026-10-30')], now).map(item => item.id)).toEqual(['late']);
  });

  it('deduplicates attention items across risk, review, and renewal signals', () => {
    const items = getManagementAttentionItems({
      persona: 'boss',
      projects: [project('a')],
      tasks: [task('late', 'a')],
      deliverables: [],
      clientPlans: [plan('a')],
      serviceCycles: [],
      now,
    });
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    expect(items.some(item => item.id === 'project-risk:a')).toBe(true);
    expect(items.some(item => item.id === 'renewal:a')).toBe(true);
  });

  it('keeps PM signals scoped and surfaces waiting reviews for production roles', () => {
    const pmItems = getManagementAttentionItems({
      persona: 'projectManager',
      userId: 'pm-a',
      projects: [project('a')],
      tasks: [task('review', 'a', { status: 'Waiting Approval', dueDate: '2026-10-25' })],
      deliverables: [],
      clientPlans: [plan('a')],
      serviceCycles: [],
      now,
    });
    expect(pmItems.every(item => !item.title.includes('Project b'))).toBe(true);

    const staffItems = getManagementAttentionItems({
      persona: 'production',
      userId: 'staff-a',
      projects: [],
      tasks: [task('review', 'a', { status: 'Waiting Approval', dueDate: '2026-11-20' })],
      deliverables: [],
      clientPlans: [],
      serviceCycles: [],
      now,
    });
    expect(staffItems.some(item => item.id === 'task:review' && item.detail === 'Waiting review')).toBe(true);
  });

  it('keeps shared workload aggregate and labels deadline pressure as estimated', () => {
    const summaries = getSharedEmployeeWorkload(
      [task('one', 'a', { assignedTo: 'staff-a', dueDate: '2026-10-22' }), task('two', 'b', { assignedTo: 'staff-a', dueDate: '2026-10-23' })],
      [user('staff-a', 'Staff', 'Staff A')],
      now,
    );
    expect(summaries[0]).toMatchObject({ open: 2, dueSoon: 2, projects: 2, signal: 'busy' });
  });

  it('keeps monthly report boundaries inclusive and prevents duplicate project rows', () => {
    const report = getMonthlyOperationalReport({
      month: now,
      projects: [project('a')],
      tasks: [
        task('completed', 'a', { isCompleted: true, status: 'Completed', completedAt: '2026-10-01T10:00:00.000Z', dueDate: '2026-10-01' }),
        task('open', 'a', { dueDate: '2026-10-31' }),
      ],
      deliverables: [deliverable('delivered', 'client-a', 'cycle-a', { status: 'Delivered', deliveredAt: '2026-10-31T12:00:00.000Z' })],
      clientPlans: [plan('a', { nextCycleStart: '2026-10-30' })],
      serviceCycles: [cycle('cycle-a', 'client-a', '2026-10-31')],
      now,
    });
    expect(report.completedTasks).toBe(1);
    expect(report.outstandingTasks).toBe(1);
    expect(report.completedDeliverables).toBe(1);
    expect(report.renewals).toBe(1);
    expect(report.projectRows).toHaveLength(1);
  });
});

