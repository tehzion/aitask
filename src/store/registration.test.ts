import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'local';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'true';
});

import type { Registration, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const boss: User = { id: 'u-boss', name: 'Boss Koo', role: 'Admin', departments: ['Management'], department: 'Management', isSuperAdmin: true };

const makeRegistration = (overrides: Partial<Registration> = {}): Registration => ({
  id: 'reg-1',
  name: 'New Staff',
  email: 'new.staff@example.com',
  phone: '+6012-3456789',
  jobPosition: 'Designer',
  requestedRole: 'Staff',
  status: 'Pending',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('staff registration lifecycle', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: boss,
      users: [boss],
      registrations: [],
      notifications: [],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('rejects a duplicate pending registration email', async () => {
    const store = useStore.getState();
    useStore.setState({ registrations: [makeRegistration()] });

    await expect(store.registerUser({
      name: 'Another Staff',
      email: 'NEW.STAFF@example.com',
      phone: '+6012-1112222',
      jobPosition: 'Video Editor',
      requestedRole: 'Staff',
    })).resolves.toEqual({
      ok: false,
      error: 'This email already has a pending Staff registration.',
    });
  });

  it('rejects registration when the email belongs to an existing user', async () => {
    const store = useStore.getState();
    useStore.setState({ users: [{ ...boss, email: 'boss@example.com' }] });

    await expect(store.registerUser({
      name: 'Impostor',
      email: 'boss@example.com',
      phone: '+6012-3334444',
      jobPosition: 'Designer',
      requestedRole: 'Staff',
    })).resolves.toEqual({
      ok: false,
      error: 'An account with this name or email already exists.',
    });
  });

  it('rejects malformed phone numbers', async () => {
    const store = useStore.getState();

    await expect(store.registerUser({
      name: 'Bad Phone',
      email: 'phone@example.com',
      phone: 'not-a-phone',
      jobPosition: 'Designer',
      requestedRole: 'Staff',
    })).resolves.toEqual({
      ok: false,
      error: 'Enter a valid phone number.',
    });
  });

  it('carries email and phone onto the approved user and refuses re-approval', () => {
    const store = useStore.getState();
    useStore.setState({ registrations: [makeRegistration()] });

    store.approveRegistration('reg-1', 'Staff', ['Designer'], undefined, undefined);
    const state = useStore.getState();
    expect(state.registrations[0].status).toBe('Approved');
    const approvedUser = state.users.find(user => user.name === 'New Staff');
    expect(approvedUser).toBeDefined();
    expect(approvedUser?.email).toBe('new.staff@example.com');
    expect(approvedUser?.phone).toBe('+6012-3456789');
    expect(approvedUser?.mustResetPassword).toBe(true);

    const userCountAfterFirst = state.users.length;
    store.approveRegistration('reg-1', 'Staff', ['Designer'], undefined, undefined);
    expect(useStore.getState().users.length).toBe(userCountAfterFirst);
  });
});
