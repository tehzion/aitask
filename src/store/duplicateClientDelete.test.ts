import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'local';
});

import type { Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();
const boss: User = { id: 'u-boss', name: 'Boss Koo', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true };

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 't-base',
  clientId: '',
  clientName: '',
  title: '',
  description: '',
  serviceType: '',
  department: 'Designer',
  assignedTo: '',
  createdBy: boss.id,
  status: 'Pending',
  startDate: '',
  dueDate: '',
  priority: 'Medium',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  visibility: 'internal',
  ...overrides,
});

describe('deleteClientProfile with duplicate company names', () => {
  beforeEach(() => {
    useStore.setState({ ...initialState, currentUser: boss, users: [boss], rolePermissions: [], notifications: [] }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('only removes work bound to the deleted client id, never a same-named company', () => {
    useStore.setState({
      clients: [
        { id: 'a1', clientName: 'Acme', createdBy: boss.id, createdAt: '', updatedAt: '' },
        { id: 'a2', clientName: 'Acme', createdBy: boss.id, createdAt: '', updatedAt: '' },
      ],
      tasks: [
        makeTask({ id: 't1', clientId: 'a1', clientName: 'Acme' }),
        makeTask({ id: 't2', clientId: 'a2', clientName: 'Acme' }),
      ],
      projects: [],
    });

    expect(useStore.getState().deleteClientProfile('a1')).toEqual({ ok: true });

    const state = useStore.getState();
    expect(state.clients.map(client => client.id)).toEqual(['a2']);
    expect(state.tasks.map(task => task.id)).toEqual(['t2']);
  });

  it('refuses to delete a company a Project Manager does not own', () => {
    const pmA: User = { id: 'pm-a', name: 'PM A', role: 'Project Manager', departments: [] };
    useStore.setState({
      currentUser: pmA,
      users: [pmA],
      clients: [
        { id: 'a1', clientName: 'Acme', createdBy: 'pm-a', createdAt: '', updatedAt: '' },
        { id: 'a2', clientName: 'Acme', createdBy: 'pm-b', createdAt: '', updatedAt: '' },
      ],
      tasks: [],
      projects: [],
    });

    expect(useStore.getState().deleteClientProfile('a2')).toEqual({ ok: false, error: 'You need permission to delete this company.' });
    expect(useStore.getState().clients.map(client => client.id)).toEqual(['a1', 'a2']);
  });
});
