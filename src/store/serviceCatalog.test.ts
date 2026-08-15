import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'local';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'true';
});

import type { ServicePackage, ServiceWorkflowTemplate, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const boss: User = { id: 'u-boss', name: 'Boss Koo', role: 'Admin', departments: ['Management'], department: 'Management', isSuperAdmin: true };

const makePackage = (overrides: Partial<ServicePackage> = {}): ServicePackage => ({
  id: 'PKG-e2e-catalog',
  name: 'Catalog Package',
  revision: 1,
  currency: 'MYR',
  serviceItems: [{
    id: 'SI-cat', name: 'Short Video', platforms: ['TikTok'], unit: 'video', quantity: 1, unitPriceMinor: 10000,
    workflow: { templateId: 'SWT-frozen', templateRevision: 1, templateName: 'Frozen Workflow', name: 'Frozen Workflow', steps: [{ id: 'S1', order: 1, title: 'Shoot', department: 'Video Shooting', kind: 'work', clientVisible: false, required: true }] },
  }],
  discountType: 'none',
  discountValue: 0,
  taxRateBps: 0,
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

const makeTemplate = (overrides: Partial<ServiceWorkflowTemplate> = {}): ServiceWorkflowTemplate => ({
  id: 'SWT-e2e-catalog',
  name: 'Catalog Workflow',
  revision: 1,
  isActive: true,
  serviceTypes: ['Short Video'],
  steps: [{ id: 'S1', order: 1, title: 'Shoot', department: 'Video Shooting', kind: 'work', clientVisible: false, required: true }],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

describe('service catalog deletion', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: boss,
      users: [boss],
      rolePermissions: [],
      servicePackages: [],
      serviceWorkflowTemplates: [],
      clientPlans: [],
      serviceCycles: [],
    });
  });

  afterEach(() => {
    useStore.setState(initialState);
  });

  it('deletes an unreferenced package and keeps client plan snapshots intact', () => {
    useStore.setState({ servicePackages: [makePackage()] });

    const result = useStore.getState().deleteServicePackage('PKG-e2e-catalog');

    expect(result).toEqual({ ok: true });
    expect(useStore.getState().servicePackages).toHaveLength(0);
  });

  it('rejects deleting a missing package', () => {
    const result = useStore.getState().deleteServicePackage('PKG-missing');
    expect(result).toEqual({ ok: false, error: 'Package not found.' });
  });

  it('blocks deleting a workflow template that is frozen into a package', () => {
    useStore.setState({
      serviceWorkflowTemplates: [makeTemplate({ id: 'SWT-frozen' })],
      servicePackages: [makePackage()],
    });

    const result = useStore.getState().deleteWorkflowTemplate('SWT-frozen');
    expect(result).toEqual({ ok: false, error: 'This workflow is frozen into existing packages or plans. Deactivate it instead of deleting.' });
    expect(useStore.getState().serviceWorkflowTemplates).toHaveLength(1);
  });

  it('deletes an unreferenced workflow template', () => {
    useStore.setState({ serviceWorkflowTemplates: [makeTemplate()] });

    const result = useStore.getState().deleteWorkflowTemplate('SWT-e2e-catalog');
    expect(result).toEqual({ ok: true });
    expect(useStore.getState().serviceWorkflowTemplates).toHaveLength(0);
  });
});
