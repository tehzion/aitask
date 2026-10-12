import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './I18nProvider';
import { MemoryRouter } from 'react-router-dom';
import { DeliveryProgress } from './DeliveryProgress';
import DeliveryReviewPanel from './DeliveryReviewPanel';
import { useStore } from '../store';
import { defaultRolePermissions } from '../lib/access';
import type { User, Task, ServiceCycle, ClientProfile } from '../types';
vi.mock('../store', async importOriginal => {
  const actual = await importOriginal<typeof import('../store')>();
  const useStore = Object.assign((selector?: (state: ReturnType<typeof actual.useStore.getState>) => unknown) =>
    selector ? selector(actual.useStore.getState()) : actual.useStore.getState(), actual.useStore);
  return { ...actual, useStore };
});
vi.mock('../hooks/useLocalToday', () => ({ useLocalToday: () => new Date(2026, 9, 12) }));
const initial = useStore.getState();
afterEach(() => useStore.setState(initial, true));
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter><I18nProvider>{node}</I18nProvider></MemoryRouter>);
describe('delivery progress empty states', () => {
  it('never renders a percentage or progressbar for missing or empty published cycles', () => {
    for (const props of [{ published: false, draft: true }, { published: false }, { published: true }]) {
      const html = render(<DeliveryProgress {...props} total={0} delivered={0} />);
      expect(html).not.toContain('role="progressbar"');
      expect(html).not.toContain('0%');
    }
  });
  it('renders confirmed published progress only', () => {
    expect(render(<DeliveryProgress published total={2} delivered={1} />)).toContain('50%');
  });
});
describe('role-specific delivery review', () => {
  for (const role of ['Project Manager', 'HOD', 'Staff', 'Client'] as const) it(`${role} does not expose unrelated task details`, () => {
    const actor = { id: 'actor', name: 'Actor', role, departments: ['Designer'], companyName: 'Company' } as User;
    const tasks = [
      { id: 'own', clientId: 'client', clientName: 'Company', title: 'Owned completed work', assignedTo: 'actor', createdBy: 'actor', department: 'Designer', status: 'Completed', visibility: 'internal' },
      { id: 'secret', clientId: 'other', clientName: 'Other Company', title: 'Hidden internal work', assignedTo: 'other', createdBy: 'other', department: 'Management', status: 'Completed', visibility: 'internal' },
    ] as Task[];
    useStore.setState({ currentUser: actor, users: [actor], tasks, clients: [], projects: [], deliverables: [], serviceCycles: [], rolePermissions: [] });
    const html = render(<DeliveryReviewPanel />);
    expect(html).not.toContain('Hidden internal work');
    if (role === 'Client') expect(html).toBe('');
    else expect(html).toContain('Owned completed work');
  });
  it('respects permission overrides and leaves current drafts read-only', () => {
    const actor = { id: 'actor', name: 'Actor', role: 'HOD', departments: ['Designer'], permissions: { ...defaultRolePermissions.HOD, viewAssignedServiceClients: true, manageServiceCycles: false, editTasks: false } } as User;
    useStore.setState({ currentUser: actor, rolePermissions: [], users: [actor], projects: [],
      tasks: [{ id: 't', clientId: 'client', clientName: 'Company', title: 'Completed', assignedTo: actor.id, createdBy: actor.id, status: 'Completed', department: 'Designer' } as Task],
      clients: [{ id: 'client', clientName: 'Company' } as ClientProfile], deliverables: [],
      serviceCycles: [{ id: 'draft', clientId: 'client', clientName: 'Company', status: 'Draft', periodStart: '2026-10-01', periodEnd: '2026-10-31' } as ServiceCycle] });
    const html = render(<DeliveryReviewPanel />);
    expect(html).toContain('Awaiting publication');
    expect(html).not.toContain('>Publish<');
    expect(html).not.toContain('<select');
  });
  it('shows explicit publication to the Super Admin without publishing during render', () => {
    const actor = { id: 'boss', name: 'Boss', role: 'Project Manager', departments: [], isSuperAdmin: true } as User;
    useStore.setState({ currentUser: actor, users: [actor], tasks: [], clients: [], projects: [], deliverables: [], rolePermissions: [],
      serviceCycles: [{ id: 'draft', clientId: 'client', clientName: 'Company', status: 'Draft', periodStart: '2026-10-01', periodEnd: '2026-10-31' } as ServiceCycle] });
    expect(render(<DeliveryReviewPanel />)).toContain('>Publish<');
    expect(useStore.getState().serviceCycles[0].status).toBe('Draft');
  });
});
