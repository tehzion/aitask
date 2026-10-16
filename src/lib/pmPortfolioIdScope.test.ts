import { describe, expect, it } from 'vitest';
import type { ClientProfile, Task, User } from '../types';
import {
  canCreateClientProfiles,
  canDeleteClientProfile,
  canDeleteClientProfiles,
  canDeleteTask,
  canEditTask,
  canViewTask,
  defaultRolePermissions,
  isTaskInOwnedPortfolio,
} from './access';

const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: [] };
const otherPm: User = { id: 'other-pm', name: 'Other PM', role: 'Project Manager', departments: [] };
const clients: ClientProfile[] = [
  { id: 'A', clientName: 'Lumea Skin Lab', createdBy: 'pm', createdAt: '', updatedAt: '' },
  { id: 'B', clientName: 'LUMEA SKIN LAB', createdBy: 'other-pm', createdAt: '', updatedAt: '' },
];
const scope = { clients, projects: [], users: [pm, otherPm] };

const makeTask = (values: Partial<Task>): Task => ({
  id: 'task', clientId: 'A', clientName: 'Lumea Skin Lab', title: 'Task', description: '', serviceType: 'Design',
  department: 'Designer', assignedTo: '', createdBy: 'other-pm', status: 'Pending', startDate: '2026-10-01', dueDate: '',
  priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending',
  isRecurring: false, visibility: 'client-visible', ...values,
});

describe('Project Manager portfolio id isolation', () => {
  it('matches owned companies by canonical id, not by a shared name', () => {
    const ownedTask = makeTask({ id: 'owned', clientId: 'A', clientName: 'Lumea Skin Lab' });
    const duplicateNameForeignTask = makeTask({ id: 'foreign', clientId: 'B', clientName: 'LUMEA SKIN LAB' });
    expect(canViewTask(pm, ownedTask, [], scope)).toBe(true);
    expect(canViewTask(pm, duplicateNameForeignTask, [], scope)).toBe(false);
    expect(canEditTask(pm, duplicateNameForeignTask, [], scope)).toBe(false);
    expect(canDeleteTask(pm, duplicateNameForeignTask, [], scope)).toBe(false);
    expect(isTaskInOwnedPortfolio(pm, duplicateNameForeignTask, scope)).toBe(false);
  });

  it('keeps a legacy id-less task matching by name', () => {
    const legacy = makeTask({ id: 'legacy', clientId: undefined, clientName: 'Lumea Skin Lab' });
    expect(canViewTask(pm, legacy, [], scope)).toBe(true);
  });

  it('does not let a delegated Project Manager destroy a foreign task', () => {
    const delegated = makeTask({ id: 'delegated', clientId: 'B', clientName: 'LUMEA SKIN LAB', assignedTo: 'pm', createdBy: 'other-pm' });
    expect(canEditTask(pm, delegated, [], scope)).toBe(true);
    expect(canDeleteTask(pm, delegated, [], scope)).toBe(false);
  });
});

describe('Project Manager company permission overrides', () => {
  it('honors a revoked createClients / deleteClients override', () => {
    const revoked: User = {
      ...pm,
      permissions: { ...defaultRolePermissions['Project Manager'], createClients: false, deleteClients: false },
    };
    expect(canCreateClientProfiles(revoked, [])).toBe(false);
    expect(canDeleteClientProfiles(revoked, [])).toBe(false);
    expect(canDeleteClientProfile(revoked, 'Lumea Skin Lab', clients, [], [])).toBe(false);
  });

  it('keeps the default Project Manager capability', () => {
    expect(canCreateClientProfiles(pm, [])).toBe(true);
    expect(canDeleteClientProfile(pm, 'Lumea Skin Lab', clients, [], [])).toBe(true);
  });
});
