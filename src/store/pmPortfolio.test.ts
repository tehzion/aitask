import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './index';
import type { ClientServicePlan, Task, User } from '../types';
import { snapshotWorkflow, SHORT_VIDEO_WORKFLOW_TEMPLATE } from '../lib/serviceManagement';
import { defaultRolePermissions } from '../lib/access';

const initial = useStore.getState();
const pm: User = { id: 'audit-pm', name: 'PM', role: 'Project Manager', departments: [] };
const other: User = { ...pm, id: 'audit-other', name: 'Other PM' };
const input = { planName: 'Plan', origin: 'custom' as const, serviceItems: [{ id: 'video', name: 'Video', platforms: [], unit: 'video', quantity: 1, unitPriceMinor: 100, workflow: snapshotWorkflow(SHORT_VIDEO_WORKFLOW_TEMPLATE) }], startDate: '2026-10-01', billingDay: 1, discountType: 'none' as const, discountValue: 0, taxRateBps: 0 };

beforeEach(() => useStore.setState({ ...initial, currentUser: other, users: [pm, other], rolePermissions: [], clients: [], projects: [], tasks: [], clientPlans: [], serviceCycles: [], deliverables: [], addons: [], cycleComments: [], servicePricingSnapshots: [], notifications: [], backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 } }, true));
afterEach(() => useStore.setState(initial, true));

describe('PM portfolio mutation boundaries', () => {
  it('rejects workflow generation when task creation has been revoked', () => {
    const created = useStore.getState().createClientWithPlan({ ...input, clientName: 'Own company' });
    expect(useStore.getState().activateClientPlan(created.planId!).ok).toBe(true);
    useStore.setState({ currentUser: { ...other, permissions: { ...defaultRolePermissions['Project Manager'], createTasks: false } } });
    const before = useStore.getState();
    expect(before.generateDeliverableTaskChain(before.deliverables[0].id).ok).toBe(false);
    expect(useStore.getState().tasks).toEqual(before.tasks);
    expect(useStore.getState().deliverables).toEqual(before.deliverables);
  });

  it('rejects every service action after company ownership is transferred away', () => {
    const created = useStore.getState().createClientWithPlan({ ...input, clientName: 'Foreign company' });
    expect(created.ok).toBe(true);
    const activation = useStore.getState().activateClientPlan(created.planId!);
    expect(activation.ok).toBe(true);
    const comment = useStore.getState().addCycleComment(activation.cycleId!, 'Existing activity', 'internal');
    const addon = useStore.getState().addAddon({ clientId: created.clientId!, clientName: 'Foreign company', planId: created.planId!, name: 'Extra', platforms: [], quantity: 1, unitPriceMinor: 100, billingMode: 'monthly', effectiveFrom: '2026-10-01', isActive: true });
    expect(addon.ok).toBe(true);
    // Retain old local data while the actor loses access, as can happen during refresh.
    useStore.setState({ clients: useStore.getState().clients.map(client => ({ ...client, createdBy: pm.id })) });
    const before = useStore.getState();
    const results = [
      before.createClientPlan(created.clientId!, input),
      before.createClientPlanRevision(created.planId!),
      before.updateActivePlanDates(created.planId!, { billingDay: 9 }),
      before.setClientPlanStatus(created.planId!, 'Paused'),
      before.setServiceCycleStatus(activation.cycleId!, 'Published'),
      before.updateDeliverableStatus(before.deliverables[0].id, 'Delivered'),
      before.generateDeliverableTaskChain(before.deliverables[0].id),
      before.addCycleComment(activation.cycleId!, 'Unauthorized activity', 'internal'),
      before.addCycleCommentAttachment(comment.id!, { id: 'file', bucket: 'client-service-files', path: 'file.pdf', fileName: 'file.pdf', sizeBytes: 1, mimeType: 'application/pdf', uploadedBy: other.id, uploadedAt: '2026-10-01' }),
      before.addAddon({ clientId: created.clientId!, clientName: 'Foreign company', planId: created.planId!, name: 'Unauthorized', platforms: [], quantity: 1, unitPriceMinor: 100, billingMode: 'monthly', effectiveFrom: '2026-10-01', isActive: true }),
      before.setAddonActive(addon.id!, false),
    ];
    expect(results.map(result => result.ok)).toEqual(results.map(() => false));
    for (const key of ['clients', 'clientPlans', 'serviceCycles', 'deliverables', 'addons', 'cycleComments', 'servicePricingSnapshots', 'tasks'] as const) expect(useStore.getState()[key]).toEqual(before[key]);
  });

  it('rejects editing and activating foreign draft plans', () => {
    const created = useStore.getState().createClientWithPlan({ ...input, clientName: 'Foreign company' });
    useStore.setState({ currentUser: pm });
    expect(useStore.getState().updateDraftClientPlan(created.planId!, { name: 'Hijacked' }).ok).toBe(false);
    expect(useStore.getState().activateClientPlan(created.planId!).ok).toBe(false);
  });

  it('denies service access to a duplicate-named company owned by another PM', () => {
    const ownClient = { id: 'dup-own', clientName: 'Acme', createdBy: pm.id, createdAt: '', updatedAt: '' };
    const foreignClient = { id: 'dup-foreign', clientName: 'Acme', createdBy: other.id, createdAt: '', updatedAt: '' };
    const foreignPlan = {
      id: 'dup-plan', clientId: 'dup-foreign', clientName: 'Acme', revision: 1, status: 'Draft', origin: 'custom',
      name: 'Acme plan', serviceItems: [], startDate: '2026-10-01', billingDay: 1, discountType: 'none',
      discountValue: 0, taxRateBps: 0, currency: 'MYR', createdAt: '', updatedAt: '',
    } as unknown as ClientServicePlan;
    useStore.setState({ currentUser: pm, clients: [ownClient, foreignClient], clientPlans: [foreignPlan] });
    // Matching by name would wrongly authorize against this PM's own "Acme".
    expect(useStore.getState().setClientPlanStatus('dup-plan', 'Paused').ok).toBe(false);
  });

  it('rejects a one-off add-on targeting another company without changing its cycle', () => {
    const foreign = useStore.getState().createClientWithPlan({ ...input, clientName: 'Foreign company' });
    const cycle = useStore.getState().activateClientPlan(foreign.planId!);
    useStore.setState({ currentUser: pm });
    const own = useStore.getState().createClientWithPlan({ ...input, clientName: 'Own company' });
    const before = useStore.getState();
    expect(before.addAddon({ clientId: own.clientId!, clientName: 'Own company', planId: own.planId!, name: 'Extra', platforms: [], quantity: 1, unitPriceMinor: 100, billingMode: 'one_off', targetCycleId: cycle.cycleId!, effectiveFrom: '2026-10-01', isActive: true }).ok).toBe(false);
    expect(useStore.getState().addons).toEqual(before.addons);
    expect(useStore.getState().serviceCycles).toEqual(before.serviceCycles);
  });

  it('lets the new company PM edit and create work in an inherited project', () => {
    const client = { id: 'transferred', clientName: 'Transferred', createdBy: pm.id, createdAt: '', updatedAt: '' };
    const project = { id: 'inherited', clientId: client.id, clientName: client.clientName, projectName: 'Campaign', createdBy: other.id, services: ['Design'], startDate: '2026-10-01', deadline: '' };
    const task: Task = { id: 'inherited-task', title: 'Inherited task', clientId: client.id, clientName: client.clientName, projectId: project.id, projectName: project.projectName, serviceType: 'Design', description: '', department: 'Designer', createdBy: other.id, assignedTo: '', status: 'Pending', startDate: '2026-10-01', dueDate: '', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false };
    useStore.setState({ currentUser: pm, clients: [client], projects: [project], tasks: [task] });
    expect(useStore.getState().updateTask(task.id, { priority: 'High' })).toEqual({ ok: true });
    const { id: _id, ...draft } = task;
    void _id;
    expect(useStore.getState().addTask({ ...draft, createdBy: pm.id, title: 'New portfolio task' })).toBeTruthy();
  });

  it('rejects standalone task creation and company changes outside the current portfolio', () => {
    const task: Task = { id: 'owned-task', title: 'Own work', clientId: 'own', clientName: 'Own company', serviceType: 'Design', description: '', department: 'Designer', createdBy: pm.id, assignedTo: '', status: 'Pending', startDate: '2026-10-01', dueDate: '', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false };
    useStore.setState({ currentUser: pm, clients: [
      { id: 'own', clientName: 'Own company', createdBy: pm.id, createdAt: '', updatedAt: '' },
      { id: 'foreign', clientName: 'Foreign company', createdBy: other.id, createdAt: '', updatedAt: '' },
    ], tasks: [task] });
    const { id: _id, ...draft } = task;
    void _id;
    const before = useStore.getState();
    expect(before.addTask({ ...draft, clientId: 'foreign', clientName: 'Foreign company' })).toBe('');
    expect(before.addTask({ ...draft, clientId: 'foreign' })).toBe('');
    expect(before.updateTask(task.id, { clientId: 'foreign', clientName: 'Foreign company' }).ok).toBe(false);
    expect(before.updateTask(task.id, { clientId: 'foreign' }).ok).toBe(false);
    expect(useStore.getState().tasks).toEqual(before.tasks);
    expect(useStore.getState().notifications).toEqual(before.notifications);
    expect(before.addTask(draft)).toBeTruthy();
  });

  it('keeps canonical company identity when moving ordinary work between accessible companies', () => {
    const task: Task = { id: 'move-task', title: 'Move work', clientId: 'own', clientName: 'Own company', serviceType: 'Design', description: '', department: 'Designer', createdBy: pm.id, assignedTo: '', status: 'Pending', startDate: '2026-10-01', dueDate: '', priority: 'Medium', completionPercentage: 0, isCompleted: false, revisionCount: 0, clientApprovalStatus: 'Pending', isRecurring: false };
    useStore.setState({ currentUser: pm, clients: [
      { id: 'own', clientName: 'Own company', createdBy: pm.id, createdAt: '', updatedAt: '' },
      { id: 'second', clientName: 'Second company', createdBy: pm.id, createdAt: '', updatedAt: '' },
    ], tasks: [task] });
    expect(useStore.getState().updateTask(task.id, { clientName: 'Second company' }).ok).toBe(true);
    expect(useStore.getState().tasks[0]).toMatchObject({ clientId: 'second', clientName: 'Second company' });
  });
});
