import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientProfile, Project, Task, User } from '../types';
import { useStore } from './index';

const initialState = useStore.getState();

const staff: User = {
  id: 'staff-company-owner',
  name: 'Company Owner',
  role: 'Staff',
  departments: ['Designer'],
  department: 'Designer',
};

const otherStaff: User = {
  id: 'staff-company-other',
  name: 'Other Staff',
  role: 'Staff',
  departments: ['Video Editor'],
  department: 'Editor',
};

const company: Project = {
  id: 'company-owned',
  clientName: 'Acme',
  projectName: 'Acme',
  services: ['Design'],
  startDate: '2026-07-18',
  deadline: '',
  createdBy: staff.id,
};

const linkedTask: Task = {
  id: 'task-company-other',
  projectId: company.id,
  projectName: company.projectName,
  clientName: company.clientName,
  serviceType: 'Design',
  title: 'Assigned elsewhere',
  description: '',
  department: 'Editor',
  assignedTo: otherStaff.id,
  createdBy: staff.id,
  startDate: '2026-07-18',
  dueDate: '',
  priority: 'Medium',
  status: 'Pending',
  completionPercentage: 0,
  isCompleted: false,
  revisionCount: 0,
  clientApprovalStatus: 'Pending',
  isRecurring: false,
  recurrenceFrequency: 'None',
};

describe('company store authorization', () => {
  beforeEach(() => {
    useStore.setState({
      ...initialState,
      currentUser: staff,
      users: [staff, otherStaff],
      tasks: [linkedTask],
      projects: [company],
      rolePermissions: [],
    }, true);
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('allows an owner to update services without rewriting linked tasks', () => {
    const previousTask = useStore.getState().tasks[0];
    const result = useStore.getState().updateProject(company.id, { services: ['Design', 'SEO'] });

    expect(result.ok).toBe(true);
    expect(useStore.getState().projects[0]?.services).toEqual(['Design', 'SEO']);
    expect(useStore.getState().tasks[0]).toBe(previousTask);
  });

  it('blocks owner rename and deletion when linked tasks belong to other staff', () => {
    const rename = useStore.getState().updateProject(company.id, {
      clientName: 'Acme Global',
      projectName: 'Acme Global',
    });
    const deletion = useStore.getState().deleteProject(company.id);

    expect(rename).toEqual({
      ok: false,
      error: 'Only a Project Manager or Boss Koo can edit this project while it contains tasks assigned to other staff.',
    });
    expect(deletion).toEqual({
      ok: false,
      error: 'Only a Project Manager or Boss Koo can delete this project while it contains tasks assigned to other staff.',
    });
    expect(useStore.getState().projects[0]?.clientName).toBe('Acme');
    expect(useStore.getState().tasks[0]?.projectId).toBe(company.id);
  });

  it('allows an owner to rename and delete when every linked task is assigned to them', () => {
    useStore.setState({ tasks: [{ ...linkedTask, assignedTo: staff.id }] });

    expect(useStore.getState().updateProject(company.id, {
      clientName: 'Acme Global',
      projectName: 'Acme Global',
    }).ok).toBe(true);
    expect(useStore.getState().tasks[0]?.clientName).toBe('Acme Global');
    expect(useStore.getState().deleteProject(company.id).ok).toBe(true);
    expect(useStore.getState().tasks[0]?.projectId).toBeUndefined();
  });

  it('creates separately named projects for an existing client and rejects duplicates', () => {
    const admin: User = { id: 'admin-project-owner', name: 'Project Manager', role: 'Project Manager', departments: ['Management'], department: 'Management' };
    const client: ClientProfile = { id: 'client-project-owner', clientName: 'Acme', createdBy: admin.id, createdAt: '2026-09-10', updatedAt: '2026-09-10' };
    useStore.setState({
      ...initialState,
      currentUser: admin,
      users: [admin],
      clients: [client],
      projects: [],
      tasks: [],
      rolePermissions: [],
    }, true);

    const projectId = useStore.getState().addProject({
      clientId: client.id,
      clientName: client.clientName,
      projectName: 'Q4 Launch',
      services: ['Design'],
      startDate: '2026-09-10',
      deadline: '2026-09-30',
    });
    expect(projectId).toBeTruthy();
    expect(useStore.getState().projects[0]?.projectName).toBe('Q4 Launch');
    expect(useStore.getState().addProject({
      clientId: client.id,
      clientName: client.clientName,
      projectName: 'q4 launch',
      services: ['Design'],
      startDate: '2026-10-01',
      deadline: '',
    })).toBe('');
    expect(useStore.getState().addProject({
      clientName: client.clientName,
      projectName: 'Missing client link',
      services: ['Design'],
      startDate: '2026-10-01',
      deadline: '',
    })).toBe('');
  });

  it('limits Project Managers to assigned projects and HOD membership changes to their own project', () => {
    const pmA: User = { id: 'scope-pm-a', name: 'PM A', role: 'Project Manager', departments: [] };
    const pmB: User = { id: 'scope-pm-b', name: 'PM B', role: 'Project Manager', departments: [] };
    const hod: User = { id: 'scope-hod', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' };
    const projectA: Project = { ...company, id: 'scope-project-a', projectName: 'Project A', projectManagerIds: [pmA.id], hodMemberIds: [] };
    const projectB: Project = { ...company, id: 'scope-project-b', projectName: 'Project B', projectManagerIds: [pmB.id], hodMemberIds: [] };
    useStore.setState({
      ...initialState,
      currentUser: pmA,
      users: [pmA, pmB, hod],
      projects: [projectA, projectB],
      clients: [{ id: 'scope-client', clientName: 'Acme', createdBy: pmA.id, createdAt: '', updatedAt: '' }],
      tasks: [],
      rolePermissions: [],
    }, true);

    expect(useStore.getState().updateProject(projectA.id, { hodMemberIds: [hod.id] })).toMatchObject({ ok: true });
    expect(useStore.getState().updateProject(projectB.id, { projectName: 'Hijack' }).ok).toBe(false);
    expect(useStore.getState().updateProject(projectA.id, { projectManagerIds: [pmB.id] }).ok).toBe(false);
    expect(useStore.getState().projects.find(project => project.id === projectA.id)?.hodMemberIds).toEqual([hod.id]);
  });

  it('does not let a non-PM project creator edit HOD project membership', () => {
    const hod: User = { id: 'scope-hod-creator', name: 'HOD', role: 'HOD', departments: ['Designer'], department: 'Designer' };
    const project: Project = { ...company, id: 'staff-created-hod-project', createdBy: staff.id, hodMemberIds: [] };
    useStore.setState({ ...initialState, currentUser: staff, users: [staff, hod], projects: [project], tasks: [], rolePermissions: [] }, true);

    expect(useStore.getState().updateProject(project.id, { hodMemberIds: [hod.id] })).toMatchObject({
      ok: false,
      error: 'Only Boss Koo or a Project Manager can change HOD project membership.',
    });
  });

  it('preserves custom project names when the client is renamed', () => {
    const admin: User = { id: 'admin-project-rename', name: 'Project Manager', role: 'Project Manager', departments: ['Management'], department: 'Management' };
    const client: ClientProfile = { id: 'client-project-rename', clientName: 'Acme', createdBy: admin.id, createdAt: '2026-09-10', updatedAt: '2026-09-10' };
    const customProject: Project = { ...company, id: 'custom-project', clientId: client.id, clientName: 'Acme', projectName: 'Q4 Launch', createdBy: admin.id };
    useStore.setState({ ...initialState, currentUser: admin, users: [admin], clients: [client], projects: [customProject], tasks: [], rolePermissions: [] }, true);

    expect(useStore.getState().renameClient('Acme', 'Acme Global').ok).toBe(true);
    expect(useStore.getState().projects[0]).toMatchObject({ clientName: 'Acme Global', projectName: 'Q4 Launch' });
  });
});
