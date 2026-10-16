import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Deliverable, ServiceCycle, Task, User } from '../types';
import { useStore } from './index';

const initial = useStore.getState();
const actor = { id: 'delivery-auditor', name: 'Delivery Auditor', role: 'Project Manager', isSuperAdmin: true, departments: ['Management'] } as User;
const output = { id: 'audit-output', clientId: 'audit-client', clientName: 'Audit Co', cycleId: 'audit-cycle', serviceItemId: 'design', status: 'Planned', taskIds: [], attachments: [] } as unknown as Deliverable;
const cycle = { id: 'audit-cycle', clientId: output.clientId, clientName: output.clientName, status: 'Published', serviceItems: [{ id: 'design', name: 'Design', workflow: { templateId: 'audit-workflow', templateRevision: 1, steps: [
  { id: 'design-step', kind: 'work', department: 'Designer', order: 1, required: true },
  { id: 'publish-step', kind: 'publishing', department: 'Designer', order: 2, required: true },
] } }] } as unknown as ServiceCycle;
const work = { id: 'audit-task', clientId: output.clientId, clientName: output.clientName, serviceCycleId: cycle.id, deliverableId: output.id,
  title: 'Design work', serviceType: 'Design', department: 'Designer', assignedTo: actor.id, createdBy: actor.id,
  status: 'Completed', isCompleted: true, completionPercentage: 100, revisionCount: 0, clientApprovalStatus: 'Approved',
  generatedFromDeliverable: true, workflowStepId: 'design-step', workflowStepKind: 'work', workflowStepRequired: true,
  workflowTemplateId: 'audit-workflow', workflowTemplateRevision: 1, predecessorTaskIds: [],
} as Task;

beforeEach(() => useStore.setState({ ...initial, currentUser: actor, users: [actor], rolePermissions: [], clients: [], projects: [], tasks: [],
  deliverables: [structuredClone(output)], serviceCycles: [structuredClone(cycle)],
  backend: { ...initial.backend, mode: 'local', status: 'local', hasLocalChanges: false, pendingMutations: 0 },
}, true));
afterEach(() => useStore.setState(initial, true));

describe('delivery status audit regressions', () => {
  it('does not confirm delivery before the frozen required workflow has been generated', () => {
    expect(useStore.getState().updateDeliverableStatus(output.id, 'In Progress').ok).toBe(true);
    expect(useStore.getState().updateDeliverableStatus(output.id, 'Delivered').ok).toBe(false);
    expect(useStore.getState().deliverables[0].status).toBe('In Progress');
    expect(useStore.getState().serviceCycles[0].status).toBe('Published');
  });

  it('does not confirm a partially generated workflow when the existing task is completed', () => {
    useStore.setState({ tasks: [structuredClone(work)] });
    expect(useStore.getState().updateDeliverableStatus(output.id, 'Delivered').ok).toBe(false);
    expect(useStore.getState().serviceCycles[0].status).toBe('Published');
  });

  it('does not substitute a manually linked task for required frozen workflow steps', () => {
    useStore.setState({ tasks: [{ ...work, generatedFromDeliverable: false, workflowStepId: undefined }] });
    expect(useStore.getState().updateDeliverableStatus(output.id, 'Delivered').ok).toBe(false);
  });

  it('allows delivery when a workflow contains only completed optional steps', () => {
    const optionalCycle = structuredClone(cycle);
    optionalCycle.serviceItems[0].workflow!.steps = [{ ...optionalCycle.serviceItems[0].workflow!.steps[0], required: false }];
    useStore.setState({ tasks: [{ ...work, workflowStepRequired: false }], serviceCycles: [optionalCycle] });
    expect(useStore.getState().updateDeliverableStatus(output.id, 'Delivered').ok).toBe(true);
    expect(useStore.getState().serviceCycles[0].status).toBe('Completed');
  });

  it('rejects detaching a generated task from its frozen workflow before changing local state', () => {
    useStore.setState({ tasks: [structuredClone(work)], deliverables: [{ ...output, taskIds: [work.id] }] });
    const before = structuredClone(useStore.getState().tasks);
    expect(useStore.getState().linkTaskToDeliverable(work.id).ok).toBe(false);
    expect(useStore.getState().tasks).toEqual(before);
    expect(useStore.getState().deliverables[0].taskIds).toEqual([work.id]);
  });

  it('lets an assigned hosted worker confirm canonical readiness with a partially visible workflow', () => {
    const worker: User = { ...actor, role: 'Staff', isSuperAdmin: false, departments: ['Designer'], department: 'Designer' };
    useStore.setState({ currentUser: worker, users: [worker], tasks: [structuredClone(work)],
      deliverables: [{ ...output, status: 'Ready', taskIds: [work.id, 'hidden-publishing-task'] }],
      backend: { ...initial.backend, mode: 'supabase', status: 'live', hasLocalChanges: false, pendingMutations: 0 },
    });
    expect(useStore.getState().updateDeliverableStatus(output.id, 'Delivered').ok).toBe(true);
    expect(useStore.getState().deliverables[0].status).toBe('Delivered');
    // Cycle completion is computed after the server validates the full chain.
    expect(useStore.getState().serviceCycles[0].status).toBe('Published');
  });

  it('does not overwrite another hosted workflow from a partial task snapshot', () => {
    useStore.setState({ tasks: [{ ...work, generatedFromDeliverable: false, workflowStepId: undefined }],
      deliverables: [{ ...output, status: 'In Progress', taskIds: [work.id, 'hidden-publishing-task'] }],
      backend: { ...initial.backend, mode: 'supabase', status: 'live', hasLocalChanges: false, pendingMutations: 0 },
    });
    expect(useStore.getState().updateTask(work.id, { notes: 'Private delivery note' }).ok).toBe(true);
    expect(useStore.getState().deliverables[0].status).toBe('In Progress');
  });

  it('derives paired hosted task-link writes when the full task snapshot is visible', () => {
    const plainCycle = structuredClone(cycle);
    plainCycle.serviceItems[0].workflow = undefined;
    useStore.setState({ tasks: [{ ...work, deliverableId: undefined, serviceCycleId: undefined, generatedFromDeliverable: false, workflowStepId: undefined }],
      serviceCycles: [plainCycle],
      backend: { ...initial.backend, mode: 'supabase', status: 'live', hasLocalChanges: false, pendingMutations: 0 },
    });
    expect(useStore.getState().linkTaskToDeliverable(work.id, cycle.id, output.id).ok).toBe(true);
    expect(useStore.getState().deliverables[0]).toMatchObject({ status: 'Ready', taskIds: [work.id] });
  });

  it('recomputes the linked deliverable when the assignee accepts work', () => {
    const plainCycle = structuredClone(cycle);
    plainCycle.serviceItems[0].workflow = undefined;
    const pending = { ...work, status: 'Pending', isCompleted: false, completionPercentage: 0, generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined } as Task;
    useStore.setState({ tasks: [pending], deliverables: [{ ...output, status: 'Planned', taskIds: [pending.id] }], serviceCycles: [plainCycle] });
    expect(useStore.getState().updateTaskWork(pending.id, { kind: 'accept' }).ok).toBe(true);
    expect(useStore.getState().deliverables[0].status).toBe('In Progress');
  });

  it('recomputes the linked deliverable back to Planned when work is unassigned', () => {
    const plainCycle = structuredClone(cycle);
    plainCycle.serviceItems[0].workflow = undefined;
    const started = { ...work, status: 'Pending', isCompleted: false, completionPercentage: 30, generatedFromDeliverable: false, workflowStepId: undefined, workflowStepKind: undefined } as Task;
    useStore.setState({ tasks: [started], deliverables: [{ ...output, status: 'In Progress', taskIds: [started.id] }], serviceCycles: [plainCycle] });
    expect(useStore.getState().updateTaskAssignee(started.id, '').ok).toBe(true);
    expect(useStore.getState().deliverables[0].status).toBe('Planned');
  });
});
