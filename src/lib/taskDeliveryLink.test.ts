import { describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { canLinkTaskDelivery } from './access';

const pm: User = { id: 'pm', name: 'PM', role: 'Project Manager', departments: ['Management'] };
const hod: User = { id: 'hod', name: 'HOD', role: 'HOD', departments: ['Designer'] };
const staff: User = { id: 'staff', name: 'Staff', role: 'Staff', departments: ['Designer'] };
const project = { id: 'proj', clientId: 'co', clientName: 'Company', projectName: 'Retainer', createdBy: 'pm', projectManagerIds: ['pm'], hodMemberIds: ['hod'], staffMemberIds: ['staff'], status: 'Active' } as unknown as Project;
const task = { id: 't', clientId: 'co', clientName: 'Company', projectId: 'proj', department: 'Designer', createdBy: 'pm', assignedBy: 'pm', status: 'In Progress', isCompleted: false } as Task;
const scope = { users: [pm, hod, staff], clients: [{ id: 'co', clientName: 'Company', createdBy: 'pm', createdAt: '', updatedAt: '' }], projects: [project] };

describe('delivery links follow the database rule', () => {
  it('lets the portfolio project manager link work', () => {
    expect(canLinkTaskDelivery(pm, { ...task, assignedTo: 'staff' }, [], scope)).toBe(true);
  });
  it('keeps Staff and HOD links read-only without the Edit tasks permission', () => {
    expect(canLinkTaskDelivery(staff, { ...task, assignedTo: 'staff' }, [], scope)).toBe(false);
    expect(canLinkTaskDelivery(hod, { ...task, assignedTo: 'hod' }, [], scope)).toBe(false);
  });
});
