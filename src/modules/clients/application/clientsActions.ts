import { isWorkspaceMutationLocked, pendingMutationMessage } from '../../../infrastructure/commands/mutationGuard';
import { safeHttpsUrl } from '../../../infrastructure/serialization/security';
import {
  canCreateClientProfiles,
  canCreateUsers,
  canDeleteClientProfile,
  canEditClientProfile,
  canRenameClient,
  isHodUser
} from '../../../shared/authorization/access';
import { queueActionFeedback } from '../../../shared/feedback/actionFeedback';
import { msg } from '../../../shared/i18n/messages';
import {
  type ClientProfile
} from '../../../shared/types/index';
import { type StoreState, type WorkspaceGet, type WorkspaceSet } from '../../../shared/types/workspaceStore';
import { cleanProfileText, isValidIsoDate, nowId, PHONE_PATTERN, profileEmailPattern } from '../../../shared/validation/workspaceInput';
import { normalizeClientKey } from './clientScope';
export const createClientsActions = (set: WorkspaceSet, get: WorkspaceGet): Pick<StoreState, "createClientProfile" | "upsertClientProfile" | "renameClient" | "assignClientOwner" | "deleteClientProfile"> => ({
  createClientProfile: (data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canCreateClientProfiles(currentUser, state.rolePermissions)) {
      return { ok: false, error: 'You need permission to add companies.' };
    }

    const name = data.clientName.trim();
    if (!name) return { ok: false, error: 'Company name is required.' };
    if (name.length > 240) return { ok: false, error: 'Company name must be 240 characters or less.' };
    if (state.clients.some(client => !client.discovered && normalizeClientKey(client.clientName) === normalizeClientKey(name))) {
      return { ok: false, error: 'This company already exists in the Companies database.' };
    }
    if (data.email?.trim() && !profileEmailPattern.test(data.email.trim())) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    if (data.phone?.trim() && !PHONE_PATTERN.test(data.phone.trim())) {
      return { ok: false, error: 'Enter a valid phone number.' };
    }
    const website = data.website?.trim() ? safeHttpsUrl(data.website) : undefined;
    const facebookPage = data.facebookPage?.trim() ? safeHttpsUrl(data.facebookPage) : undefined;
    if (data.website?.trim() && !website) return { ok: false, error: 'Website must be a valid HTTPS URL.' };
    if (data.facebookPage?.trim() && !facebookPage) return { ok: false, error: 'Facebook page must be a valid HTTPS URL.' };
    const clientSince = data.clientSince?.trim() || undefined;
    if (clientSince && !isValidIsoDate(clientSince)) return { ok: false, error: 'Choose a valid client since date.' };

    const now = new Date().toISOString();
    const client: ClientProfile = {
      id: nowId('CL'),
      clientName: name,
      createdBy: currentUser.id,
      clientSince,
      contactPerson: cleanProfileText(data.contactPerson, 160),
      email: cleanProfileText(data.email, 320),
      phone: cleanProfileText(data.phone, 80),
      address: cleanProfileText(data.address, 1000),
      website,
      facebookPage,
      notes: cleanProfileText(data.notes, 5000),
      createdAt: now,
      updatedAt: now,
    };
    set(current => ({ clients: [...current.clients, client] }));
    queueActionFeedback(currentUser.id, `company:${client.id}:create`, msg('client.companyAdded', { name }), saved => saved.clients.some(item => item.id === client.id && item.clientName === name));
    return { ok: true, id: client.id };
  },
  upsertClientProfile: (clientName, data) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canEditClientProfile(currentUser, clientName, state.tasks, state.rolePermissions, state.clients)) {
      return { ok: false, error: 'You need Manage assigned clients permission and a direct task assignment to edit this client.' };
    }

    const name = clientName.trim();
    if (!name) return { ok: false, error: 'Client or brand name is required.' };
    if (name.length > 240) return { ok: false, error: 'Client or brand name must be 240 characters or less.' };

    const website = data.website?.trim() ? safeHttpsUrl(data.website) : undefined;
    const facebookPage = data.facebookPage?.trim() ? safeHttpsUrl(data.facebookPage) : undefined;
    if (data.website?.trim() && !website) return { ok: false, error: 'Website must be a valid HTTPS URL.' };
    if (data.facebookPage?.trim() && !facebookPage) return { ok: false, error: 'Facebook page must be a valid HTTPS URL.' };

    const existing = state.clients.find(client => normalizeClientKey(client.clientName) === normalizeClientKey(name));
    const clientSince = data.clientSince !== undefined ? (data.clientSince.trim() || undefined) : existing?.clientSince;
    if (clientSince && !isValidIsoDate(clientSince)) return { ok: false, error: 'Choose a valid client since date.' };
    const now = new Date().toISOString();
    const profile: ClientProfile = {
      id: existing?.id || nowId('CL'),
      clientName: existing?.clientName || name,
      createdBy: existing?.createdBy || currentUser?.id,
      clientSince,
      contactPerson: cleanProfileText(data.contactPerson, 160),
      email: cleanProfileText(data.email, 320),
      phone: cleanProfileText(data.phone, 80),
      address: cleanProfileText(data.address, 1000),
      website,
      facebookPage,
      notes: cleanProfileText(data.notes, 5000),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    set((current) => ({
      clients: existing
        ? current.clients.map(client => client.id === existing.id ? profile : client)
        : [...current.clients, profile],
    }));

    return { ok: true, id: profile.id };
  },
  renameClient: (oldClientName, newClientName) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const oldName = oldClientName.trim();
    const nextName = newClientName.trim();
    const oldKey = normalizeClientKey(oldName);
    const nextKey = normalizeClientKey(nextName);

    if (!oldName) return { ok: false, error: 'Choose a client to rename.' };
    if (!nextName) return { ok: false, error: 'New client name is required.' };
    if (nextName.length > 240) return { ok: false, error: 'Client name must be 240 characters or less.' };
    if (oldKey === nextKey) return { ok: false, error: 'New client name must be different.' };
    if (!canRenameClient(currentUser, oldName, state.clients)) {
      return { ok: false, error: 'Only Project Managers can rename their own companies.' };
    }

    const duplicateExists = [
      ...state.clients.map(client => client.clientName),
      ...state.tasks.map(task => task.clientName),
      ...state.projects.map(project => project.clientName),
      ...state.users.filter(user => user.role === 'Client').map(user => user.companyName || ''),
    ].some(name => normalizeClientKey(name) === nextKey);
    if (duplicateExists) {
      return { ok: false, error: 'Another client already uses that name.' };
    }

    const hasOldClient = [
      ...state.clients.map(client => client.clientName),
      ...state.tasks.map(task => task.clientName),
      ...state.projects.map(project => project.clientName),
      ...state.users.filter(user => user.role === 'Client').map(user => user.companyName || ''),
    ].some(name => normalizeClientKey(name) === oldKey);
    if (!hasOldClient) return { ok: false, error: 'Client was not found.' };

    const now = new Date().toISOString();
    const renamedProjectIds = new Set(
      state.projects
        .filter(project => normalizeClientKey(project.clientName) === oldKey)
        .map(project => project.id)
    );

    set((current) => ({
      clients: current.clients.map(client => (
        normalizeClientKey(client.clientName) === oldKey
          ? { ...client, clientName: nextName, updatedAt: now }
          : client
      )),
      tasks: current.tasks.map(task => {
        const matchesClient = normalizeClientKey(task.clientName) === oldKey;
        const matchesRenamedProject = Boolean(task.projectId && renamedProjectIds.has(task.projectId));
        if (!matchesClient && !matchesRenamedProject) return task;
        const legacyProjectName = normalizeClientKey(task.projectName) === oldKey;

        return {
          ...task,
          clientName: nextName,
          projectName: matchesRenamedProject && legacyProjectName
            ? nextName
            : task.projectName,
          updatedAt: now,
        };
      }),
      projects: current.projects.map(project => (
        normalizeClientKey(project.clientName) === oldKey
          ? { ...project, clientName: nextName, projectName: normalizeClientKey(project.projectName) === oldKey ? nextName : project.projectName, updatedAt: now }
          : project
      )),
      users: current.users.map(user => (
        user.role === 'Client' && normalizeClientKey(user.companyName) === oldKey
          ? { ...user, companyName: nextName, updatedAt: now }
          : user
      )),
      currentUser: current.currentUser?.role === 'Client' && normalizeClientKey(current.currentUser.companyName) === oldKey
        ? { ...current.currentUser, companyName: nextName, updatedAt: now }
        : current.currentUser,
      notifications: current.notifications.map(notification => (
        normalizeClientKey(notification.targetClient) === oldKey
          ? { ...notification, targetClient: nextName }
          : notification
      )),
      clientPlans: current.clientPlans.map(item => item.clientId && normalizeClientKey(item.clientName) === oldKey ? { ...item, clientName: nextName, updatedAt: now } : item),
      serviceCycles: current.serviceCycles.map(item => normalizeClientKey(item.clientName) === oldKey ? { ...item, clientName: nextName, updatedAt: now } : item),
      deliverables: current.deliverables.map(item => normalizeClientKey(item.clientName) === oldKey ? { ...item, clientName: nextName, updatedAt: now } : item),
      cycleComments: current.cycleComments.map(item => normalizeClientKey(item.clientName) === oldKey ? { ...item, clientName: nextName, updatedAt: now } : item),
      addons: current.addons.map(item => normalizeClientKey(item.clientName) === oldKey ? { ...item, clientName: nextName, updatedAt: now } : item),
    }));

    return { ok: true };
  },
  assignClientOwner: (clientId, ownerId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    if (!canCreateUsers(currentUser, state.rolePermissions)) {
      return { ok: false, error: 'Only Boss Koo can assign a company owner.' };
    }
    const client = state.clients.find(item => item.id === clientId);
    if (!client) return { ok: false, error: 'Company not found.' };
    const nextOwner = ownerId || undefined;
    if (nextOwner) {
      const owner = state.users.find(user => user.id === nextOwner);
      if (!owner || (owner.role !== 'Project Manager' && !isHodUser(owner, state.rolePermissions))) {
        return { ok: false, error: 'Choose a Project Manager or HOD as the owner.' };
      }
    }
    if ((client.createdBy || undefined) === nextOwner) return { ok: true };
    const now = new Date().toISOString();
    set(current => ({
      clients: current.clients.map(item => item.id === clientId
        ? { ...item, createdBy: nextOwner, updatedAt: now }
        : item),
    }));
    return { ok: true };
  },
  deleteClientProfile: (clientId) => {
    const state = get();
    if (isWorkspaceMutationLocked(state)) return { ok: false, error: pendingMutationMessage };
    const currentUser = state.currentUser;
    const client = state.clients.find(c => c.id === clientId);
    if (!client) return { ok: false, error: 'Company not found.' };
    if (!canDeleteClientProfile(currentUser, client.clientName, state.clients, state.rolePermissions, state.tasks, clientId)) {
      return { ok: false, error: 'You need permission to delete this company.' };
    }

    const clientKey = normalizeClientKey(client.clientName);
    // Matching by name must never widen a delete: a row that carries a
    // different clientId belongs to another company even if the name matches
    // (duplicate company names are allowed). Only fall back to the name for
    // legacy rows that have no clientId at all.
    const belongsToClient = (item: { clientId?: string; clientName?: string }) => (
      item.clientId ? item.clientId === clientId
        : Boolean(item.clientName) && normalizeClientKey(item.clientName) === clientKey
    );
    // A Client portal account points at this company. Removing the company
    // without clearing the account leaves a ghost login bound to a company
    // that no longer exists.
    const removedClientUserIds = new Set(
      state.users.filter(user => user.role === 'Client' && normalizeClientKey(user.companyName) === clientKey).map(user => user.id)
    );

    set(current => ({
      clients: current.clients.filter(c => c.id !== clientId),
      deletedClientIds: Array.from(new Set([...(current.deletedClientIds || []), clientId])),
      users: current.users.filter(user => !removedClientUserIds.has(user.id)),
      deletedUserIds: Array.from(new Set([...(current.deletedUserIds || []), ...removedClientUserIds])),
      projects: current.projects.filter(item => !belongsToClient(item)),
      tasks: current.tasks.filter(item => !belongsToClient(item)),
      notifications: current.notifications.filter(item => normalizeClientKey(item.targetClient) !== clientKey
        && !(Boolean(item.targetUserId) && removedClientUserIds.has(item.targetUserId as string))),
      clientPlans: current.clientPlans.filter(item => item.clientId !== clientId),
      serviceCycles: current.serviceCycles.filter(item => item.clientId !== clientId),
      deliverables: current.deliverables.filter(item => item.clientId !== clientId),
      cycleComments: current.cycleComments.filter(item => item.clientId !== clientId),
      addons: current.addons.filter(item => item.clientId !== clientId),
      servicePricingSnapshots: current.servicePricingSnapshots.filter(item => item.clientId !== clientId),
    }));

    return { ok: true };
  }
});
