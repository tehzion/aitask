import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project, Task, User } from '../types';
import { canEditTask } from '../lib/access';
import { useStore } from './index';

const initialState = useStore.getState();
const pm: User = { id: 'pm-a', name: 'PM A', role: 'Project Manager', departments: [] };
const otherPm: User = { id: 'pm-b', name: 'PM B', role: 'Project Manager', departments: [] };
const project: Project = {
  id: 'project-a', clientName: 'Client', projectName: 'Launch', services: ['Design'],
  startDate: '2026-10-01', deadline: '2026-11-01', projectManagerIds: [pm.id],
  status: 'Active', milestones: [],
};
const task: Task = {
  id: 'task-a', title: 'Open work', clientName: 'Client', projectId: project.id,
  status: 'In Progress', dueDate: '2026-10-01', assignedTo: 'staff-a',
} as Task;

describe('project management store authority', () => {
  beforeEach(() => useStore.setState({
    ...initialState,
    currentUser: pm,
    users: [pm, otherPm],
    projects: [project],
    tasks: [],
    backend: { ...initialState.backend, hasLocalChanges: false, pendingMutations: 0, isSaving: false },
  }, true));
  afterEach(() => useStore.setState(initialState, true));

  it('lets an assigned PM complete, close, and reopen a project', () => {
    expect(useStore.getState().setProjectStatus(project.id, 'Completed').ok).toBe(true);
    expect(useStore.getState().setProjectStatus(project.id, 'Closed').ok).toBe(true);
    expect(useStore.getState().projects[0].closedBy).toBe(pm.id);
    expect(useStore.getState().setProjectStatus(project.id, 'Active').ok).toBe(true);
    expect(useStore.getState().projects[0].reopenedBy).toBe(pm.id);
  });

  it('blocks another PM from lifecycle and milestone changes', () => {
    useStore.setState({ currentUser: otherPm });
    expect(useStore.getState().setProjectStatus(project.id, 'Completed').ok).toBe(false);
    expect(useStore.getState().saveProjectMilestone(project.id, { name: 'Build', targetDate: '2026-10-30', status: 'Not Started' }).ok).toBe(false);
  });

  it('creates and edits optional milestones', () => {
    const created = useStore.getState().saveProjectMilestone(project.id, { name: 'Build', targetDate: '2026-10-30', status: 'Not Started' });
    expect(created.ok).toBe(true);
    const changed = useStore.getState().saveProjectMilestone(project.id, { id: created.id, name: 'Build ready', targetDate: '2026-10-31', status: 'In Progress' });
    expect(changed.ok).toBe(true);
    expect(useStore.getState().projects[0].milestones?.[0]).toMatchObject({ name: 'Build ready', status: 'In Progress' });
  });

  it('prevents ordinary task editing while a project is closed', () => {
    const closed = { ...project, status: 'Closed' as const };
    expect(canEditTask(pm, task, [], { projects: [closed] })).toBe(false);
  });
});
