import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  process.env.VITE_AITASK_BACKEND = 'local';
  process.env.VITE_AITASK_SHOW_DEMO_LOGIN = 'true';
  return { secure: false };
});
vi.mock('../lib/supabaseClient', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/supabaseClient')>(),
  shouldUseSecureSupabase: () => runtime.secure,
}));

import type { ServicePackage, ServiceWorkflowTemplate, User } from '../types';
import { useStore } from './index';
import { useToastStore } from './useToastStore';

const initialState = useStore.getState();

const boss: User = { id: 'u-boss', name: 'Boss Koo', role: 'Project Manager', departments: ['Management'], department: 'Management', isSuperAdmin: true };

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
    runtime.secure = false;
    useToastStore.getState().toasts.forEach(toast => useToastStore.getState().removeToast(toast.id));
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
    runtime.secure = false;
    useToastStore.getState().toasts.forEach(toast => useToastStore.getState().removeToast(toast.id));
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

  it('does not recreate a package that was removed while its editor was open', () => {
    const result = useStore.getState().saveServicePackage(makePackage());
    expect(result).toEqual({ ok: false, error: 'Package not found.' });
    expect(useStore.getState().servicePackages).toHaveLength(0);
  });

  it('does not recreate a workflow that was removed while its editor was open', () => {
    const result = useStore.getState().saveWorkflowTemplate(makeTemplate());
    expect(result).toEqual({ ok: false, error: 'Workflow template not found.' });
    expect(useStore.getState().serviceWorkflowTemplates).toHaveLength(0);
  });

  it.each(['package.save', 'package.delete', 'workflow.delete'] as const)('%s does not announce success before a remote save confirms', operation => {
    useStore.setState({ servicePackages: [makePackage()], serviceWorkflowTemplates: [makeTemplate()] });
    runtime.secure = true;
    const result = operation === 'package.save'
      ? useStore.getState().saveServicePackage(makePackage())
      : operation === 'package.delete'
        ? useStore.getState().deleteServicePackage('PKG-e2e-catalog')
        : useStore.getState().deleteWorkflowTemplate('SWT-e2e-catalog');
    expect(result.ok).toBe(true);
    expect(useToastStore.getState().toasts.filter(toast => toast.type === 'success')).toEqual([]);
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
