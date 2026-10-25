import { isWorkspaceMutationLocked, pendingMutationMessage } from '../../../infrastructure/commands/mutationGuard';
import {
  canDeleteProject,
  canEditProject,
  canManageProjects,
  canViewAllClients,
  getVisibleClientNames,
  isBossKoo,
  isHodUser
} from '../../../shared/authorization/access';
import { useToastStore } from '../../../shared/feedback/useToastStore';
import { msg } from '../../../shared/i18n/messages';
import { canManageProjectLifecycle, getProjectClosureWarnings, hasProjectClosureWarnings, isClosedProject, makeMilestoneId } from '../../../shared/rules/projectManagement';
import {
  type Project,
  type ProjectMilestone
} from '../../../shared/types/index';
import { type StoreState, type WorkspaceGet, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { getTodayInputDate } from '../../../shared/utils/utils';
import { isValidIsoDate, nowId } from '../../../shared/validation/workspaceInput';
import { normalizeClientKey } from '../../clients/application/clientScope';
export const createProjectsActions = (set: WorkspaceSet, get: WorkspaceGet): Pick<StoreState, "addProject" | "updateProject" | "setProjectStatus" | "saveProjectMilestone" | "deleteProjectMilestone" | "deleteProject"> => ({
  addProject: (projectData) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) {
      useToastStore.getState().addToast(pendingMutationMessage, 'warning');
      return '';
    }
    const currentUser = state.currentUser;
    if (!currentUser || !canManageProjects(currentUser, state.rolePermissions)) return '';

    const clientName = projectData.clientName.trim();
    const projectName = projectData.projectName.trim();
    const services = Array.from(new Map(
      projectData.services.map(service => [service.trim().toLowerCase(), service.trim()])
    ).values()).filter(Boolean);
    const startDate = projectData.startDate || getTodayInputDate();
    const deadline = projectData.deadline?.trim() || '';

    if (!clientName || !projectName || services.length === 0) return '';
    if (!isValidIsoDate(startDate)) return '';
    if (deadline && (!isValidIsoDate(deadline) || new Date(deadline) < new Date(startDate))) return '';
    if (!projectData.clientId) return '';
    const client = state.clients.find(item => item.id === projectData.clientId && !item.discovered);
    const visibleClientKeys = new Set(getVisibleClientNames(currentUser, state.tasks, state.projects, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects }).map(normalizeClientKey));
    if (!client || normalizeClientKey(client.clientName) !== normalizeClientKey(clientName) || (!canViewAllClients(currentUser, state.rolePermissions) && !visibleClientKeys.has(normalizeClientKey(clientName)))) return '';
    if (state.projects.some(item => {
      const sameClient = projectData.clientId && item.clientId
        ? item.clientId === projectData.clientId
        : normalizeClientKey(item.clientName) === normalizeClientKey(clientName);
      return sameClient && normalizeClientKey(item.projectName) === normalizeClientKey(projectName);
    })) return '';

    const newProject: Project = {
      ...projectData,
      clientName,
      projectName,
      services,
      startDate,
      deadline,
      projectManagerIds: isBossKoo(currentUser)
        ? Array.from(new Set((projectData.projectManagerIds || []).filter(id => state.users.some(user => user.id === id && user.role === 'Project Manager' && !isBossKoo(user)))))
        : currentUser.role === 'Project Manager' ? [currentUser.id] : [],
      hodMemberIds: Array.from(new Set((projectData.hodMemberIds || []).filter(id => state.users.some(user => user.id === id && isHodUser(user, state.rolePermissions))))),
      staffMemberIds: Array.from(new Set((projectData.staffMemberIds || []).filter(id => state.users.some(user => user.id === id && user.role === 'Staff' && !isHodUser(user, state.rolePermissions))))),
      memberResponsibilities: Object.fromEntries(Object.entries(projectData.memberResponsibilities || {})
        .filter(([id, responsibility]) => state.users.some(user => user.id === id) && typeof responsibility === 'string' && responsibility.trim())
        .map(([id, responsibility]) => [id, responsibility.trim().slice(0, 160)])),
      status: projectData.status || 'Active',
      defaultApprovalMode: projectData.defaultApprovalMode,
      requireClearClosureChecklist: Boolean(projectData.requireClearClosureChecklist),
      milestones: projectData.milestones || [],
      createdBy: currentUser.id,
      id: nowId('P'),
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({ projects: [...state.projects, newProject] }));
    useToastStore.getState().addToast(msg('project.created', { name: projectName }), 'success');
    return newProject.id;
  },
  updateProject: (projectId, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const project = state.projects.find(item => item.id === projectId);
    if (!currentUser || !project || !canEditProject(currentUser, project, state.rolePermissions)) {
      return { ok: false, error: 'You do not have permission to edit this project.' };
    }
    if (data.projectManagerIds !== undefined && !isBossKoo(currentUser)) {
      return { ok: false, error: 'Only Boss Koo can change Project Manager assignments.' };
    }
    if (data.hodMemberIds !== undefined && !isBossKoo(currentUser) && currentUser.role !== 'Project Manager') {
      return { ok: false, error: 'Only Boss Koo or a Project Manager can change HOD project membership.' };
    }
    if ((data.staffMemberIds !== undefined || data.memberResponsibilities !== undefined)
      && !isBossKoo(currentUser) && currentUser.role !== 'Project Manager') {
      return { ok: false, error: 'Only Boss Koo or an assigned Project Manager can change project team membership.' };
    }

    const clientName = data.clientName !== undefined ? data.clientName.trim() : project.clientName;
    const projectName = data.projectName !== undefined ? data.projectName.trim() : project.projectName;
    const services = data.services !== undefined
      ? Array.from(new Map(data.services.map(service => [service.trim().toLowerCase(), service.trim()])).values()).filter(Boolean)
      : project.services;
    const startDate = data.startDate || project.startDate || getTodayInputDate();
    const deadline = data.deadline !== undefined ? data.deadline.trim() : project.deadline;

    if (!clientName) return { ok: false, error: 'Company or brand name is required.' };
    if (!projectName) return { ok: false, error: 'Project name is required.' };
    if (services.length === 0) return { ok: false, error: 'Select or add at least one service.' };
    if (!isValidIsoDate(startDate)) return { ok: false, error: 'Start date must be a valid date.' };
    if (deadline && (!isValidIsoDate(deadline) || new Date(deadline) < new Date(startDate))) {
      return { ok: false, error: 'Deadline cannot be earlier than the start date.' };
    }
    const nextClientId = data.clientId !== undefined ? data.clientId : project.clientId;
    if (nextClientId) {
      const client = state.clients.find(item => item.id === nextClientId && !item.discovered);
      const visibleClientKeys = new Set(getVisibleClientNames(currentUser, state.tasks, state.projects, state.rolePermissions, { users: state.users, clients: state.clients, projects: state.projects }).map(normalizeClientKey));
      if (!client || normalizeClientKey(client.clientName) !== normalizeClientKey(clientName) || (!canViewAllClients(currentUser, state.rolePermissions) && !visibleClientKeys.has(normalizeClientKey(clientName)))) {
        return { ok: false, error: 'You can only link this project to a company you can access.' };
      }
    }
    if (state.projects.some(item => {
      if (item.id === projectId) return false;
      const sameClient = nextClientId && item.clientId
        ? item.clientId === nextClientId
        : normalizeClientKey(item.clientName) === normalizeClientKey(clientName);
      return sameClient && normalizeClientKey(item.projectName) === normalizeClientKey(projectName);
    })) {
      return { ok: false, error: 'A project with that name already exists for this company.' };
    }

    const updatedProject: Project = {
      ...project,
      clientId: nextClientId,
      clientName,
      projectName,
      services,
      startDate,
      deadline,
      ...(data.projectManagerIds === undefined ? {} : {
        projectManagerIds: Array.from(new Set(data.projectManagerIds.filter(id => state.users.some(user => user.id === id && user.role === 'Project Manager' && !isBossKoo(user))))),
      }),
      ...(data.hodMemberIds === undefined ? {} : {
        hodMemberIds: Array.from(new Set(data.hodMemberIds.filter(id => state.users.some(user => user.id === id && isHodUser(user, state.rolePermissions))))),
      }),
      ...(data.staffMemberIds === undefined ? {} : {
        staffMemberIds: Array.from(new Set(data.staffMemberIds.filter(id => state.users.some(user => user.id === id && user.role === 'Staff' && !isHodUser(user, state.rolePermissions))))),
      }),
      ...(data.memberResponsibilities === undefined ? {} : {
        memberResponsibilities: Object.fromEntries(Object.entries(data.memberResponsibilities)
          .filter(([id, responsibility]) => state.users.some(user => user.id === id) && typeof responsibility === 'string' && responsibility.trim())
          .map(([id, responsibility]) => [id, responsibility.trim().slice(0, 160)])),
      }),
      ...(data.defaultApprovalMode === undefined ? {} : { defaultApprovalMode: data.defaultApprovalMode }),
      ...(data.requireClearClosureChecklist === undefined ? {} : { requireClearClosureChecklist: Boolean(data.requireClearClosureChecklist) }),
      updatedAt: new Date().toISOString(),
    };

    const identityChanged = clientName !== project.clientName || projectName !== project.projectName || updatedProject.clientId !== project.clientId;
    const linkedTasks = state.tasks.filter(task => task.projectId === projectId);
    // Task creator access does not grant Staff/HOD project-identity
    // control. Renaming a company/project rewrites every linked task, so
    // only a Project Manager/Boss or a member whose linked tasks are all
    // assigned to them may perform that broader mutation.
    const canRewriteLinkedTaskIdentity = isBossKoo(currentUser)
      || currentUser.role === 'Project Manager'
      || linkedTasks.every(task => task.assignedTo === currentUser.id);
    if (identityChanged && !canRewriteLinkedTaskIdentity) {
      return {
        ok: false,
        error: 'Only a Project Manager or Boss Koo can edit this project while it contains tasks assigned to other staff.',
      };
    }

    const now = new Date().toISOString();

    set(current => ({
      projects: current.projects.map(item => item.id === projectId ? updatedProject : item),
      tasks: identityChanged
        ? current.tasks.map(task => task.projectId === projectId
          ? { ...task, clientId: updatedProject.clientId, clientName, projectName, updatedAt: now }
          : task
        )
        : current.tasks,
    }));
    useToastStore.getState().addToast(msg('project.updated', { name: projectName }), 'success');
    return { ok: true };
  },
  setProjectStatus: (projectId, status, confirmWarnings = false) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    const project = state.projects.find(item => item.id === projectId);
    if (!actor || !project || !canManageProjectLifecycle(actor, project)) {
      return { ok: false, error: 'Only an assigned Project Manager or Boss Koo can change the project status.' };
    }
    const currentStatus = project.status || 'Active';
    const valid = currentStatus === status
      || (currentStatus === 'Active' && status === 'Completed')
      || (currentStatus === 'Completed' && ['Active', 'Closed'].includes(status))
      || (currentStatus === 'Closed' && status === 'Active');
    if (!valid) return { ok: false, error: `Move the project through Active, Completed, and Closed in order.` };
    if (currentStatus === status) return { ok: true };
    const now = new Date().toISOString();
    const warnings = getProjectClosureWarnings(project, state.tasks, new Date(now));
    if (status === 'Closed' && hasProjectClosureWarnings(warnings) && project.requireClearClosureChecklist) {
      return { ok: false, error: 'Resolve the configured closure checklist before closing this project.' };
    }
    if (status === 'Closed' && hasProjectClosureWarnings(warnings) && !confirmWarnings) {
      return { ok: false, error: 'Confirm closure with the outstanding checklist warnings.' };
    }
    const updated: Project = {
      ...project,
      status,
      ...(status === 'Completed' ? { completedAt: now, completedBy: actor.id } : {}),
      ...(status === 'Closed' ? {
        closedAt: now,
        closedBy: actor.id,
        closureWarningsAcknowledged: hasProjectClosureWarnings(warnings),
        closureWarningSnapshot: { ...warnings, confirmedAt: now },
      } : {}),
      ...(currentStatus === 'Closed' && status === 'Active' ? {
        reopenedAt: now,
        reopenedBy: actor.id,
        closedAt: undefined,
        closedBy: undefined,
      } : {}),
      updatedAt: now,
    };
    set(current => ({ projects: current.projects.map(item => item.id === projectId ? updated : item) }));
    return { ok: true };
  },
  saveProjectMilestone: (projectId, input) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    const project = state.projects.find(item => item.id === projectId);
    if (!actor || !project || !canManageProjectLifecycle(actor, project)) return { ok: false, error: 'You cannot manage milestones for this project.' };
    if (isClosedProject(project)) return { ok: false, error: 'Reopen the project before changing milestones.' };
    const name = input.name.trim();
    if (!name) return { ok: false, error: 'Milestone name is required.' };
    if (!isValidIsoDate(input.targetDate)) return { ok: false, error: 'Choose a valid milestone target date.' };
    if (input.responsiblePersonId && !state.users.some(user => user.id === input.responsiblePersonId)) return { ok: false, error: 'Choose a valid responsible person.' };
    const now = new Date().toISOString();
    const id = input.id || makeMilestoneId();
    const existing = (project.milestones || []).find(item => item.id === id);
    const milestone: ProjectMilestone = {
      id,
      name: name.slice(0, 160),
      description: input.description?.trim().slice(0, 2000) || undefined,
      targetDate: input.targetDate,
      responsiblePersonId: input.responsiblePersonId || undefined,
      status: input.status,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    set(current => ({
      projects: current.projects.map(item => item.id === projectId ? {
        ...item,
        milestones: existing
          ? (item.milestones || []).map(value => value.id === id ? milestone : value)
          : [...(item.milestones || []), milestone],
        updatedAt: now,
      } : item)
    }));
    return { ok: true, id };
  },
  deleteProjectMilestone: (projectId, milestoneId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const actor = state.currentUser;
    const project = state.projects.find(item => item.id === projectId);
    if (!actor || !project || !canManageProjectLifecycle(actor, project)) return { ok: false, error: 'You cannot manage milestones for this project.' };
    if (isClosedProject(project)) return { ok: false, error: 'Reopen the project before changing milestones.' };
    if (state.tasks.some(task => task.projectId === projectId && task.milestoneId === milestoneId)) return { ok: false, error: 'Unlink related tasks before deleting this milestone.' };
    set(current => ({
      projects: current.projects.map(item => item.id === projectId
        ? { ...item, milestones: (item.milestones || []).filter(milestone => milestone.id !== milestoneId), updatedAt: new Date().toISOString() }
        : item)
    }));
    return { ok: true };
  },
  deleteProject: (projectId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const project = state.projects.find(item => item.id === projectId);
    if (!currentUser || !project || !canDeleteProject(currentUser, project, state.rolePermissions)) {
      return { ok: false, error: 'You do not have permission to delete this project.' };
    }
    const linkedTasks = state.tasks.filter(task => task.projectId === projectId);
    const canDetachLinkedTasks = isBossKoo(currentUser)
      || currentUser.role === 'Project Manager'
      || linkedTasks.every(task => task.assignedTo === currentUser.id);
    if (!canDetachLinkedTasks) {
      return {
        ok: false,
        error: 'Only a Project Manager or Boss Koo can delete this project while it contains tasks assigned to other staff.',
      };
    }

    set(current => ({
      projects: current.projects.filter(item => item.id !== projectId),
      tasks: current.tasks.map(task => task.projectId === projectId
        ? { ...task, projectId: undefined, projectName: undefined, updatedAt: new Date().toISOString() }
        : task
      ),
    }));
    useToastStore.getState().addToast(msg('project.deleted', { name: project.projectName }), 'success');
    return { ok: true };
  }
});
