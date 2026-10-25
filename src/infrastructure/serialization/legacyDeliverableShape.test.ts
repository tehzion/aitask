import { describe, expect, it } from 'vitest';
import { resolveDeliverableStatus } from '../../modules/services/domain/serviceManagement';
import { hasTaskEvidence, isTaskLinkedToDeliverable } from '../../modules/tasks/domain/staffWorkflow';
import { getTaskOutputAttachments } from '../../modules/tasks/domain/taskOutputEvidence';
import type { Deliverable, Task } from '../../shared/types/index';

// Legacy/DB rows may omit `taskIds` even though the type marks it required.
const legacyDeliverable = { id: 'd1', clientId: 'c1', cycleId: 'cy1', attachments: [], status: 'Planned' } as unknown as Deliverable;
const task = { id: 't1', clientId: 'c1', status: 'Pending', completionPercentage: 0, revisionCount: 0, outputAttachments: [] } as unknown as Task;

describe('legacy deliverable rows without taskIds', () => {
  it('does not throw when taskIds is missing', () => {
    expect(isTaskLinkedToDeliverable(task, [legacyDeliverable])).toBe(false);
    expect(() => hasTaskEvidence(task, [legacyDeliverable], [task])).not.toThrow();
    expect(() => resolveDeliverableStatus(legacyDeliverable, [task], [])).not.toThrow();
    expect(() => getTaskOutputAttachments(task, [legacyDeliverable])).not.toThrow();
  });
});
