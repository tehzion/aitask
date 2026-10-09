import React from 'react';
import { useSaveAction } from '../hooks/useSaveAction';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { Badge, Button, PageHeader, ProgressBar, StatusChip } from '../components/ui';
import { buttonBase, inputBase, pageShell, tableShell } from '../components/uiTokens';
import { canCreateClientProfiles, canCreateTasks, canDeleteClientProfile, canEditClientProfile, canEditProject, canManageClientPlans, canManageProjects, canOpenServiceClient, canRenameClient, canViewAllClients, getRoleDisplayName, getVisibleClientNames, getVisibleProjects, getVisibleTasks, isBossKoo } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { resolveClientAddedDate } from '../lib/clientDates';
import { cn } from '../lib/utils';
import { isPendingMutationResolution, useStore } from '../store';
import { useToastStore } from '../store/useToastStore';
import { msg } from '../lib/messages';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ConfirmDialog from '../components/ConfirmDialog';
import { useShallow } from 'zustand/react/shallow';
import { ClientProfile, ClientServicePlan, Project, ServiceCycle } from '../types';
import ModalShell from '../components/ModalShell';
import CreateClientProfileModal from '../components/CreateClientProfileModal';
import CreateClientPlanModal from '../components/CreateClientPlanModal';
import CreateProjectModal from '../components/CreateProjectModal';
import { useI18n } from '../components/I18nProvider';
import { formatLocalizedDate, formatLocalizedDistanceToNow, type AppLocale } from '../lib/i18n';

type ClientSource = 'Profile' | 'Task' | 'Company' | 'Account';

type ClientSummary = {
  name: string;
  profile?: ClientProfile;
  sources: Set<ClientSource>;
  taskCount: number;
  completedTaskCount: number;
  openTaskCount: number;
  projectIds: Set<string>;
  projectNames: Set<string>;
  assignedUserIds: Set<string>;
  assignedByIds: Set<string>;
  services: Set<string>;
  accountUsers: string[];
  details?: string;
  facebookPage?: string;
  website?: string;
  latestTaskId?: string;
  lastActivity?: string;
  addedAt?: string;
  /** Set when the company has an explicit "Client since" date, which then wins
   *  over older task/project start dates for the "Client Added" column. */
  addedAtPinned?: boolean;
  latestTaskDate?: string;
};

type ClientProfileForm = {
  clientSince: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  facebookPage: string;
  notes: string;
};

const emptyProfileForm: ClientProfileForm = {
  clientSince: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  facebookPage: '',
  notes: '',
};

const sourceClasses: Record<ClientSource, string> = {
  Profile: 'bg-accent-soft text-accent border-accent/20',
  Task: 'bg-slate-100 text-slate-700 border-slate-200',
  Company: 'bg-slate-100 text-slate-700 border-slate-200',
  Account: 'bg-slate-100 text-slate-700 border-slate-200',
};

const getClientKey = (value: string) => value.trim().toLowerCase();

const getActivityTime = (value?: string) => {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

const formatLastActivity = (value: string | undefined, locale: AppLocale) => {
  const time = getActivityTime(value);
  return time ? formatLocalizedDistanceToNow(new Date(time), locale) : 'No activity yet';
};

const getClientContact = (client: ClientSummary) => ({
  contactPerson: client.profile?.contactPerson,
  email: client.profile?.email,
  phone: client.profile?.phone,
  address: client.profile?.address,
  website: client.profile?.website || client.website,
  facebookPage: client.profile?.facebookPage || client.facebookPage,
  notes: client.profile?.notes,
});

const getProfileForm = (client: ClientSummary): ClientProfileForm => {
  const contact = getClientContact(client);
  return {
    clientSince: client.profile?.clientSince || '',
    contactPerson: contact.contactPerson || '',
    email: contact.email || '',
    phone: contact.phone || '',
    address: contact.address || '',
    website: contact.website || '',
    facebookPage: contact.facebookPage || '',
    notes: contact.notes || client.details || '',
  };
};

const Clients: React.FC = () => {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const {
    clients: clientProfiles,
    tasks: allTasks,
    projects: allProjects,
    clientPlans,
    serviceCycles,
    deliverables,
    users,
    currentUser,
    rolePermissions,
    setCreateTaskModalOpen,
    upsertClientProfile,
    renameClient,
    assignClientOwner,
    deleteClientProfile,
    commitPendingMutation,
    upgradeRequired,
  } = useStore(useShallow(state => ({
    clients: state.clients,
    tasks: state.tasks,
    projects: state.projects,
    clientPlans: state.clientPlans,
    serviceCycles: state.serviceCycles,
    deliverables: state.deliverables,
    users: state.users,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
    upsertClientProfile: state.upsertClientProfile,
    renameClient: state.renameClient,
    assignClientOwner: state.assignClientOwner,
    deleteClientProfile: state.deleteClientProfile,
    commitPendingMutation: state.commitPendingMutation,
    upgradeRequired: state.backend.upgradeRequired === true,
  })));
  const [searchParams, setSearchParams] = useSearchParams();
  const routeSearch = searchParams.get('search') || '';
  const searchTerm = routeSearch;
  const clearSearch = () => {
    if (!searchParams.get('search')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    setSearchParams(next, { replace: true });
  };
  const [selectedClientName, setSelectedClientName] = React.useState('');
  const [selectedClientSnapshot, setSelectedClientSnapshot] = React.useState<ClientSummary | null>(null);
  const [profileBaseline, setProfileBaseline] = React.useState<ClientProfileForm>(emptyProfileForm);
  const [renameBaseline, setRenameBaseline] = React.useState('');
  const [pendingClientChange, setPendingClientChange] = React.useState<
    { kind: 'profile'; form: ClientProfileForm; name: string } | { kind: 'rename'; name: string } | { kind: 'delete'; name: string }
    | { kind: 'owner'; clientId: string; ownerId?: string; name: string } | null
  >(null);
  const [discardAction, setDiscardAction] = React.useState<(() => void) | null>(null);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
  const [deleteImpact, setDeleteImpact] = React.useState<{ tasks: number; projects: number; plans: number; cycles: number; deliverables: number } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [isRenamingClient, setIsRenamingClient] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState<ClientProfileForm>(emptyProfileForm);
  const [profileError, setProfileError] = React.useState('');
  const [renameValue, setRenameValue] = React.useState('');
  const [renameError, setRenameError] = React.useState('');
  const [isClientMutationSaving, setIsSavingClient] = React.useState(false);
  const { busy: isOwnerSaving, run: runOwner } = useSaveAction(selectedClientSnapshot?.profile?.id || selectedClientName);
  const isSavingClient = isClientMutationSaving || isOwnerSaving;
  const [isDeleteConfirming, setIsDeleteConfirming] = React.useState(false);
  const [isCreateClientOpen, setIsCreateClientOpen] = React.useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);
  const [initialProjectClientId, setInitialProjectClientId] = React.useState('');
  const [planClientId, setPlanClientId] = React.useState('');
  const [openMenuClientKey, setOpenMenuClientKey] = React.useState<string | null>(null);
  const [clientMenuAnchor, setClientMenuAnchor] = React.useState<HTMLButtonElement | null>(null);
  const [clientMenuPosition, setClientMenuPosition] = React.useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const clientMenuRef = React.useRef<HTMLDivElement>(null);
  const clientMenuAnchorRect = React.useRef<DOMRect | null>(null);
  const clientMenuId = React.useId();
  const clientDialogTitleId = React.useId();
  const discardDialogTitleId = React.useId();
  const contactFieldId = React.useId();
  const profileFormRef = React.useRef(profileForm);
  const renameValueRef = React.useRef(renameValue);
  renameValueRef.current = renameValue;
  const setProfileDraft = (form: ClientProfileForm) => {
    profileFormRef.current = form;
    setProfileForm(form);
  };
  const updateProfileField = (field: keyof ClientProfileForm, value: string) => {
    const next = { ...profileFormRef.current, [field]: value };
    setProfileDraft(next);
    setProfileError('');
  };
  const isProfileDirty = isEditingProfile && JSON.stringify(profileForm) !== JSON.stringify(profileBaseline);
  const isRenameDirty = isRenamingClient && renameValue !== renameBaseline;
  const clearUnsaved = useUnsavedChanges(isProfileDirty || isRenameDirty || isSavingClient || Boolean(pendingClientChange));

  React.useEffect(() => {
    setPendingClientChange(null);
    setProfileError('');
    setSelectedClientName('');
    setSelectedClientSnapshot(null);
  }, [currentUser?.id]);

  React.useLayoutEffect(() => {
    if (!openMenuClientKey || !clientMenuAnchor || !clientMenuRef.current) {
      setClientMenuPosition(null);
      return;
    }
    const anchor = clientMenuAnchor.getBoundingClientRect();
    clientMenuAnchorRect.current = anchor;
    const menu = clientMenuRef.current;
    const spaceBelow = window.innerHeight - anchor.bottom - 12;
    const spaceAbove = anchor.top - 12;
    const placeBelow = menu.scrollHeight <= spaceBelow || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(0, placeBelow ? spaceBelow : spaceAbove);
    setClientMenuPosition({
      top: placeBelow ? anchor.bottom + 4 : Math.max(8, anchor.top - 4 - Math.min(menu.scrollHeight, maxHeight)),
      left: Math.max(8, Math.min(anchor.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)),
      maxHeight,
    });
  }, [openMenuClientKey, clientMenuAnchor]);

  React.useLayoutEffect(() => {
    if (openMenuClientKey && clientMenuPosition) {
      clientMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    }
  }, [openMenuClientKey, clientMenuPosition]);

  React.useEffect(() => {
    if (!openMenuClientKey) return;
    const closeMenu = () => {
      if (document.querySelector('[data-aitask-modal-portal]')) return;
      setOpenMenuClientKey(null);
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="menu"]') || target?.closest('[aria-haspopup="menu"]')) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        clientMenuAnchor?.focus({ preventScroll: true });
      }
    };
    const onScroll = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="menu"]')) return;
      const previous = clientMenuAnchorRect.current;
      const current = clientMenuAnchor?.getBoundingClientRect();
      // A scroll initiated before the click can be delivered after opening.
      // It only invalidates the menu when the anchor has actually moved.
      if (!previous || !current || previous.top !== current.top || previous.right !== current.right) closeMenu();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openMenuClientKey, clientMenuAnchor]);

  const canSeeAllClients = canViewAllClients(currentUser, rolePermissions);
  const isClientUser = currentUser?.role === 'Client';
  const visibleClientKeys = React.useMemo(() => new Set(
    getVisibleClientNames(currentUser, allTasks, allProjects, rolePermissions, { clients: clientProfiles, projects: allProjects }).map(getClientKey)
  ), [allProjects, allTasks, clientProfiles, currentUser, rolePermissions]);
  const tasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients: clientProfiles, projects: allProjects }),
    [allProjects, allTasks, clientProfiles, currentUser, rolePermissions]
  );
  const projects = React.useMemo(
    () => getVisibleProjects(currentUser, allProjects, allTasks, rolePermissions, { clients: clientProfiles, projects: allProjects }),
    [allProjects, allTasks, clientProfiles, currentUser, rolePermissions]
  );
  const canAddTasks = !upgradeRequired && canCreateTasks(currentUser, rolePermissions);
  const canAddProjects = !upgradeRequired && canManageProjects(currentUser, rolePermissions);

  const clients = React.useMemo(() => {
    const summaries = new Map<string, ClientSummary>();
    const canSeeProfile = (profile: ClientProfile) => {
      if (!currentUser) return false;
      if (canSeeAllClients) return true;
      if (profile.createdBy && profile.createdBy === currentUser.id) return true;
      return visibleClientKeys.has(getClientKey(profile.clientName));
    };

    const ensureClient = (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const key = getClientKey(trimmed);
      const existing = summaries.get(key);
      if (existing) return existing;

      const summary: ClientSummary = {
        name: trimmed,
        sources: new Set(),
        taskCount: 0,
        completedTaskCount: 0,
        openTaskCount: 0,
        projectIds: new Set(),
        projectNames: new Set(),
        assignedUserIds: new Set(),
        assignedByIds: new Set(),
        services: new Set(),
        accountUsers: [],
      };
      summaries.set(key, summary);
      return summary;
    };

    const rememberActivity = (summary: ClientSummary, value?: string) => {
      if (getActivityTime(value) > getActivityTime(summary.lastActivity)) {
        summary.lastActivity = value;
      }
    };

    const rememberAdded = (summary: ClientSummary, value?: string) => {
      if (summary.addedAtPinned) return;
      if (!value) return;
      const t = getActivityTime(value);
      if (!t) return;
      const currentT = summary.addedAt ? getActivityTime(summary.addedAt) : Infinity;
      if (t < currentT) {
        summary.addedAt = value;
      }
    };

    clientProfiles.filter(canSeeProfile).forEach(profile => {
      const summary = ensureClient(profile.clientName);
      if (!summary) return;

      summary.profile = profile;
      summary.sources.add('Profile');
      rememberActivity(summary, profile.updatedAt || profile.createdAt);
      const added = resolveClientAddedDate(profile.clientSince, profile.createdAt);
      if (added.pinned && added.value) {
        summary.addedAt = added.value;
        summary.addedAtPinned = true;
      } else {
        rememberAdded(summary, added.value);
      }
    });

    [...tasks]
      .sort((a, b) => getActivityTime(b.updatedAt || b.dueDate || b.startDate) - getActivityTime(a.updatedAt || a.dueDate || a.startDate))
      .forEach(task => {
        const summary = ensureClient(task.clientName);
        if (!summary) return;

        summary.sources.add('Task');
        summary.taskCount += 1;
        if (task.isCompleted || task.status === 'Completed') {
          summary.completedTaskCount += 1;
        } else {
          summary.openTaskCount += 1;
        }
        if (task.serviceType) summary.services.add(task.serviceType);
        if (task.projectId) summary.projectIds.add(task.projectId);
        if (task.projectName) summary.projectNames.add(task.projectName);
        if (task.assignedTo) summary.assignedUserIds.add(task.assignedTo);
        const assignedBy = task.assignedBy || task.createdBy;
        if (assignedBy) summary.assignedByIds.add(assignedBy);
        if (!summary.details && task.customerDetails) summary.details = task.customerDetails;
        if (!summary.facebookPage && task.facebookPage) summary.facebookPage = task.facebookPage;
        if (!summary.website && task.website) summary.website = task.website;
        if (!summary.latestTaskId) summary.latestTaskId = task.id;
        rememberActivity(summary, task.updatedAt || task.dueDate || task.startDate);
        rememberAdded(summary, task.startDate);
        if (!summary.latestTaskDate) {
          summary.latestTaskDate = task.updatedAt || task.startDate;
        }
      });

    projects.forEach(project => {
      const summary = ensureClient(project.clientName);
      if (!summary) return;

      summary.sources.add('Company');
      summary.projectIds.add(project.id);
      if (project.projectName) summary.projectNames.add(project.projectName);
      project.services.forEach(service => {
        if (service) summary.services.add(service);
      });
      rememberActivity(summary, project.updatedAt || project.deadline || project.startDate);
      rememberAdded(summary, project.startDate);
    });

    users
      .filter(user => user.role === 'Client' && user.companyName)
      .filter(user => {
        const companyKey = getClientKey(user.companyName || '');
        if (canSeeAllClients) return true;
        if (currentUser?.role === 'Client') return companyKey === getClientKey(currentUser.companyName || '');
        return visibleClientKeys.has(companyKey);
      })
      .forEach(user => {
        const summary = summaries.get(getClientKey(user.companyName || ''));
        if (!summary) return;

        summary.sources.add('Account');
        if (!summary.accountUsers.includes(user.name)) summary.accountUsers.push(user.name);
        rememberActivity(summary, user.updatedAt);
        rememberAdded(summary, user.updatedAt);
      });

    return Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [canSeeAllClients, clientProfiles, currentUser, projects, tasks, users, visibleClientKeys]);

  const filteredClients = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter(client => {
      const contact = getClientContact(client);
      return [
        client.name,
        client.details,
        contact.contactPerson,
        contact.email,
        contact.phone,
        contact.address,
        contact.notes,
        contact.website,
        contact.facebookPage,
        ...client.accountUsers,
        ...Array.from(client.projectNames),
        ...Array.from(client.services),
      ].filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [clients, searchTerm]);

  const selectedClient = React.useMemo(() => (
    selectedClientName
      ? clients.find(client => selectedClientSnapshot?.profile
        ? client.profile?.id === selectedClientSnapshot.profile.id
        : getClientKey(client.name) === getClientKey(selectedClientName))
        || ((pendingClientChange || isSavingClient || isRenamingClient || isDeleteConfirming) ? selectedClientSnapshot : null)
      : null
  ), [clients, selectedClientName, selectedClientSnapshot, pendingClientChange, isSavingClient, isRenamingClient, isDeleteConfirming]);

  const selectedClientProjects = React.useMemo(() => {
    if (!selectedClient) return [];
    const key = getClientKey(selectedClient.name);
    const profileId = selectedClient.profile?.id;
    return projects.filter(project => (
      (profileId && project.clientId === profileId)
      || getClientKey(project.clientName) === key
    ));
  }, [projects, selectedClient]);

  const totalTasks = React.useMemo(() => clients.reduce((sum, client) => sum + client.taskCount, 0), [clients]);
  const openTasks = React.useMemo(() => clients.reduce((sum, client) => sum + client.openTaskCount, 0), [clients]);
  const linkedAccounts = React.useMemo(() => clients.reduce((sum, client) => sum + client.accountUsers.length, 0), [clients]);
  const savedProfiles = React.useMemo(() => clients.filter(client => Boolean(client.profile)).length, [clients]);

  const serviceContextByClientKey = React.useMemo(() => {
    const contextByKey = new Map<string, { plan: ClientServicePlan | undefined; cycle: ServiceCycle | undefined; included: number; delivered: number } | null>();
    clients.forEach(client => {
      if (!client.profile) {
        contextByKey.set(getClientKey(client.name), null);
        return;
      }
      const profileId = client.profile.id;
      const plans = clientPlans.filter(plan => plan.clientId === profileId).sort((a, b) => b.revision - a.revision);
      const plan = plans.find(item => item.status === 'Active') || plans.find(item => item.status === 'Paused') || plans[0];
      const cycle = serviceCycles.filter(item => item.clientId === profileId).sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
      const cycleDeliverables = cycle ? deliverables.filter(item => item.cycleId === cycle.id) : [];
      const deliveredCount = cycleDeliverables.filter(item => item.status === 'Delivered').length;
      contextByKey.set(getClientKey(client.name), { plan, cycle, included: cycleDeliverables.length, delivered: deliveredCount });
    });
    return contextByKey;
  }, [clientPlans, clients, deliverables, serviceCycles]);
  const getServiceContext = (client: ClientSummary) => serviceContextByClientKey.get(getClientKey(client.name)) ?? null;
  const selectedClientCanRename = selectedClient
    ? !upgradeRequired && canRenameClient(currentUser, selectedClient.name, clientProfiles)
    : false;
  const selectedClientCanEditProfile = selectedClient
    ? !upgradeRequired && canEditClientProfile(currentUser, selectedClient.name, allTasks, rolePermissions, clientProfiles)
    : false;
  const selectedClientCanDelete = Boolean(
    selectedClient?.profile && !upgradeRequired && canDeleteClientProfile(currentUser, selectedClient.profile.clientName, clientProfiles, rolePermissions, allTasks),
  );

  const openClientPanel = (client: ClientSummary, edit = false) => {
    setOpenMenuClientKey(null);
    setSelectedClientName(client.name);
    setSelectedClientSnapshot(client);
    const form = getProfileForm(client);
    setProfileDraft(form);
    setProfileBaseline(form);
    setRenameBaseline(client.name);
    setPendingClientChange(null);
    setDeleteImpact(null);
    setProfileError('');
    setRenameValue(client.name);
    setRenameError('');
    setIsRenamingClient(false);
    setIsDeleteConfirming(false);
    setIsEditingProfile(Boolean(edit && !upgradeRequired && canEditClientProfile(currentUser, client.name, allTasks, rolePermissions, clientProfiles)));
  };

  const openClientDeleteConfirmation = (client: ClientSummary) => {
    setOpenMenuClientKey(null);
    openClientPanel(client);
    prepareClientDeletion(client);
  };

  const prepareClientDeletion = (client: ClientSummary) => {
    const key = getClientKey(client.name);
    const belongs = (item: { clientId?: string; clientName?: string }) => (
      Boolean(client.profile && item.clientId === client.profile.id) || Boolean(item.clientName && getClientKey(item.clientName) === key)
    );
    setDeleteImpact({
      tasks: allTasks.filter(belongs).length,
      projects: allProjects.filter(belongs).length,
      plans: clientPlans.filter(belongs).length,
      cycles: serviceCycles.filter(belongs).length,
      deliverables: deliverables.filter(belongs).length,
    });
    setIsDeleteConfirming(true);
  };

  const closeClientPanel = () => {
    clearUnsaved();
    setSelectedClientName('');
    setSelectedClientSnapshot(null);
    setPendingClientChange(null);
    setDeleteImpact(null);
    setIsEditingProfile(false);
    setIsRenamingClient(false);
    setIsDeleteConfirming(false);
    setProfileError('');
    setRenameError('');
  };

  const requestDiscard = (action: () => void) => {
    if (isSavingClient) return;
    if (isProfileDirty || isRenameDirty || pendingClientChange) setDiscardAction(() => action);
    else action();
  };

  const confirmDiscard = async () => {
    if (!discardAction) return;
    setIsDiscarding(true);
    try {
      if (pendingClientChange) {
        await useStore.getState().discardMutation();
        const backend = useStore.getState().backend;
        if (backend.mode === 'supabase' && backend.status !== 'live') {
          setProfileError(backend.error || 'Unable to reload saved company data. Try again.');
          setDiscardAction(null);
          return;
        }
        setPendingClientChange(null);
      }
      discardAction();
      setDiscardAction(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to reload saved company data. Try again.');
      setDiscardAction(null);
    } finally {
      setIsDiscarding(false);
    }
  };

  const commitClientChange = () => isPendingMutationResolution(useStore.getState().backend)
    ? useStore.getState().retryPendingSave()
    : commitPendingMutation();

  const isClientChangeConfirmed = (saved: { ok: boolean }) => {
    if (!saved.ok) return false;
    const backend = useStore.getState().backend;
    return backend.mode !== 'supabase' || !backend.isConfigured
      || (backend.status === 'live' && !backend.hasLocalChanges && backend.pendingMutations === 0);
  };

  const getClientSaveError = (saved: { error?: string }, fallback: string) => (
    saved.error || useStore.getState().backend.error || fallback
  );

  const saveClientOwner = async (ownerId?: string) => {
    if (!selectedClient?.profile || isSavingClient || (pendingClientChange && pendingClientChange.kind !== 'owner')) return;
    const retry = pendingClientChange?.kind === 'owner';
    const submitted = retry ? pendingClientChange
      : { kind: 'owner' as const, clientId: selectedClient.profile.id, ownerId, name: selectedClient.name };
    setProfileError('');
    const saved = await runOwner(async () => {
      if (!retry) {
        const staged = assignClientOwner(submitted.clientId, submitted.ownerId);
        if (!staged.ok) return staged;
        setPendingClientChange(submitted);
      }
      return retry && useStore.getState().backend.mode === 'supabase'
        ? useStore.getState().retryPendingSave() : commitClientChange();
    });
    if (!saved) return;
    if (!isClientChangeConfirmed(saved)) {
      setProfileError(getClientSaveError(saved, 'The owner change is waiting to be saved.'));
      return;
    }
    const latest = useStore.getState().clients.find(client => client.id === submitted.clientId);
    setPendingClientChange(null);
    if (!latest || (latest.createdBy || undefined) !== submitted.ownerId) {
      setProfileError(t('The pending owner change is no longer available. Review the company before saving again.'));
      return;
    }
    useToastStore.getState().addToast(submitted.ownerId
      ? t(`Owner updated for "${submitted.name}".`) : t(`Owner cleared for "${submitted.name}".`), 'success');
  };

  const openProjectEditor = (project: Project | null, clientId = '') => {
    setEditingProject(project);
    setInitialProjectClientId(project?.clientId || clientId);
    setIsCreateProjectOpen(true);
  };

  const closeProjectEditor = () => {
    setIsCreateProjectOpen(false);
    setEditingProject(null);
    setInitialProjectClientId('');
  };

  const handleProfileSave = async () => {
    if (!selectedClient || isSavingClient || (pendingClientChange && pendingClientChange.kind !== 'profile')) return;
    const submitted = pendingClientChange?.kind === 'profile'
      ? pendingClientChange
      : { kind: 'profile' as const, form: { ...profileFormRef.current }, name: selectedClient.name };
    if (!pendingClientChange) {
      const result = upsertClientProfile(submitted.name, submitted.form);
      if (!result.ok) { setProfileError(result.error || 'Unable to save client details.'); return; }
    }
    setPendingClientChange(submitted);
    setIsSavingClient(true);
    setProfileError('');
    try {
      const saved = await commitClientChange();
      if (!isClientChangeConfirmed(saved)) {
        setProfileError(getClientSaveError(saved, 'The client details are waiting to be saved.'));
        return;
      }
      setPendingClientChange(null);
      setProfileBaseline(submitted.form);
      setIsEditingProfile(JSON.stringify(profileFormRef.current) !== JSON.stringify(submitted.form));
      useToastStore.getState().addToast(msg('client.detailsSaved', { name: submitted.name }), 'success');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save client details.');
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleRenameSave = async () => {
    if (!selectedClient || isSavingClient || (pendingClientChange && pendingClientChange.kind !== 'rename')) return;
    const submitted = pendingClientChange?.kind === 'rename'
      ? pendingClientChange
      : { kind: 'rename' as const, name: renameValue.trim() };
    if (!pendingClientChange) {
      const result = renameClient(selectedClient.name, submitted.name);
      if (!result.ok) { setRenameError(result.error || 'Unable to rename this client.'); return; }
    }
    setPendingClientChange(submitted);
    setIsSavingClient(true);
    setRenameError('');
    try {
      const saved = await commitClientChange();
      if (!isClientChangeConfirmed(saved)) {
        setRenameError(getClientSaveError(saved, 'The client rename is waiting to be saved.'));
        return;
      }
      setPendingClientChange(null);
      setSelectedClientName(submitted.name);
      setRenameBaseline(submitted.name);
      setIsRenamingClient(renameValueRef.current.trim() !== submitted.name);
      useToastStore.getState().addToast(msg('client.renamed', { name: submitted.name }), 'success');
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Unable to rename this client.');
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient?.profile || isSavingClient || (pendingClientChange && pendingClientChange.kind !== 'delete')) return;
    const submitted = pendingClientChange?.kind === 'delete'
      ? pendingClientChange
      : { kind: 'delete' as const, name: selectedClient.name };
    if (!pendingClientChange) {
      const result = deleteClientProfile(selectedClient.profile.id);
      if (!result.ok) { setProfileError(result.error || 'Unable to delete this company.'); return; }
    }
    setPendingClientChange(submitted);
    setIsSavingClient(true);
    setProfileError('');
    try {
      const saved = await commitClientChange();
      if (!isClientChangeConfirmed(saved)) {
        setProfileError(getClientSaveError(saved, 'The company deletion is waiting to be saved.'));
        return;
      }
      useToastStore.getState().addToast(msg('client.companyDeletedNamed', { name: submitted.name }), 'success');
      closeClientPanel();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to delete this company.');
    } finally {
      setIsSavingClient(false);
    }
  };

  const renderContactSummary = (client: ClientSummary) => {
    const contact = getClientContact(client);
    const hasStructuredContact = contact.contactPerson || contact.email || contact.phone || contact.address;

    if (!hasStructuredContact && !client.details) {
      return <p className="text-sm text-slate-400">{t('No contact details saved yet.')}</p>;
    }

    return (
      <div className="space-y-1.5">
        {contact.contactPerson && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <UserRound className="h-3.5 w-3.5 text-slate-400" /> {contact.contactPerson}
          </p>
        )}
        {contact.email && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Mail className="h-3.5 w-3.5 text-slate-400" /> {contact.email}
          </p>
        )}
        {contact.phone && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Phone className="h-3.5 w-3.5 text-slate-400" /> {contact.phone}
          </p>
        )}
        {contact.address && (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> {contact.address}
          </p>
        )}
        {!hasStructuredContact && client.details && (
          <p className="line-clamp-2 text-sm text-slate-600">{client.details}</p>
        )}
      </div>
    );
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title={isClientUser ? t('Company profile') : t('Companies')}
        description={isClientUser ? t('Review your company details, services, contacts, and linked work.') : t('The complete client database for company details, contacts, accounts, services, and linked work.')}
        meta={<><span>{clients.length} {t('visible companies')}</span><span aria-hidden="true">·</span><span>{totalTasks} {t('linked tasks')}</span></>}
        action={<div className="flex flex-wrap gap-2">
          {canCreateClientProfiles(currentUser, rolePermissions) && <Button onClick={() => { clearSearch(); setIsCreateClientOpen(true); }} disabled={upgradeRequired}><Building2 className="h-4 w-4" />{t('New client')}</Button>}
          {canAddProjects && <Button variant="secondary" onClick={() => openProjectEditor(null)}><Plus className="h-4 w-4" />{t('New project')}</Button>}
          {canAddTasks && <Button variant="secondary" onClick={() => setCreateTaskModalOpen(true)}><Plus className="h-4 w-4" />{t('New task')}</Button>}
        </div>}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-line/70 py-3 text-sm" aria-label={t('Client summary')}>
        {(isClientUser
          ? [[t('Company'), clients.length], [t('Saved profile'), savedProfiles], [t('Open tasks'), openTasks], [t('Team accounts'), linkedAccounts]]
          : [[t('Companies'), clients.length], [t('Saved profiles'), savedProfiles], [t('Open tasks'), openTasks], [t('Client accounts'), linkedAccounts]]
        ).map(([label, value]) => <span key={String(label)} className="inline-flex items-baseline gap-1.5"><strong className="calm-number text-base text-ink">{value}</strong><span className="text-muted">{label}</span></span>)}
      </div>

      <div className={tableShell}>
        <div className="flex flex-col gap-3 border-b border-line bg-inset/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm text-slate-500">
            {filteredClients.length} {t('shown from')} {clients.length} {t('total')}, {totalTasks} {t(totalTasks === 1 ? 'linked task' : 'linked tasks')}
          </p>
        </div>

        <div className="hidden overflow-x-auto 2xl:block">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="sticky top-0 z-[1] border-b border-line bg-inset text-xs text-muted">
              <tr>
                <th className="px-5 py-4 font-semibold">{t('Company / Client')}</th>
                <th className="px-5 py-4 font-semibold">{t('Contact')}</th>
                <th className="px-5 py-4 font-semibold">{t('Services')}</th>
                <th className="px-5 py-4 font-semibold">{t('Tasks')}</th>
                <th className="px-5 py-4 font-semibold">{t('Links')}</th>
                <th className="px-5 py-4 font-semibold">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
        const contact = getClientContact(client);
        const website = safeHttpsUrl(contact.website);
        const facebookPage = safeHttpsUrl(contact.facebookPage);
        const serviceContext = getServiceContext(client);
        const canOpenWorkspace = canOpenServiceClient(currentUser, client.name, allTasks, rolePermissions, clientProfiles, allProjects);
        const canEditProfile = !upgradeRequired && canEditClientProfile(currentUser, client.name, allTasks, rolePermissions, clientProfiles);
        const canDeleteProfile = Boolean(client.profile && !upgradeRequired && canDeleteClientProfile(currentUser, client.profile.clientName, clientProfiles, rolePermissions, allTasks));
        const assignedTeam = Array.from(client.assignedUserIds)
          .map(userId => users.find(user => user.id === userId)?.name || userId)
          .filter(Boolean);
        const assignedByTeam = Array.from(client.assignedByIds)
          .map(userId => users.find(user => user.id === userId)?.name || userId)
          .filter(Boolean);

                return (
                  <tr key={client.name} className="border-b border-line/70 bg-surface text-ink transition-colors duration-160 hover:bg-inset/60">
                    <td className="px-5 py-6 align-top">
                      <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-xs font-semibold text-accent">{client.name.slice(0, 2).toUpperCase()}</span><div><div data-i18n-skip className="font-semibold text-ink">{client.name}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{serviceContext?.plan && <StatusChip tone={serviceContext.plan.status === 'Active' ? 'emerald' : serviceContext.plan.status === 'Paused' ? 'amber' : 'slate'}>{t(serviceContext.plan.status)}</StatusChip>}{!client.profile && <StatusChip tone="amber">{t('Needs profile')}</StatusChip>}</div></div></div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from(client.sources).map(source => (
                          <span key={source} className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium', sourceClasses[source])}>
                            {t(source)}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{t('Updated')} {formatLastActivity(client.lastActivity, locale)}</p>
                    </td>
                    <td className="max-w-[340px] px-5 py-6 align-top">
                      {renderContactSummary(client)}
                      {client.accountUsers.length > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          {t('Account:')} {client.accountUsers.join(', ')}
                        </p>
                      )}
                      {client.projectNames.size > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          {t('Projects:')} {Array.from(client.projectNames).slice(0, 2).join(', ')}
                          {client.projectNames.size > 2 ? ` +${client.projectNames.size - 2}` : ''}
                        </p>
                      )}
                      {assignedByTeam.length > 0 && (
                        <p className="mt-1 text-xs text-slate-500">{t('Assigned by')}: {assignedByTeam.join(', ')}</p>
                      )}
                      {assignedTeam.length > 0 && (
                        <p className="mt-1 text-xs text-slate-500">{t('Assigned staff:')} {assignedTeam.join(', ')}</p>
                      )}
                    </td>
                    <td className="px-5 py-6 align-top">
                      {serviceContext?.plan && <p className="mb-2 text-xs font-semibold text-ink">{serviceContext.plan.name}</p>}
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {Array.from(client.services).slice(0, 4).map(service => (
                          <Badge key={service} tone="slate" className="text-[10px]">
                            {service}
                          </Badge>
                        ))}
                        {client.services.size > 4 && <Badge tone="slate">+{client.services.size - 4}</Badge>}
                        {client.services.size === 0 && <span className="text-sm text-slate-400">{t('No services')}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="font-semibold text-ink">{client.taskCount} {t('total')}</div>
                      <p className="mt-1 text-xs text-slate-500">{client.openTaskCount} {t('open')}, {client.completedTaskCount} {t('completed')}</p>
                      <p className="mt-1 text-xs text-slate-500">{client.projectIds.size} {t(client.projectIds.size === 1 ? 'company record' : 'company records')}</p>
                      {serviceContext?.cycle && <ProgressBar className="mt-3 w-40" label="Cycle delivered" value={serviceContext.delivered} max={Math.max(1, serviceContext.included)} />}
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="flex flex-col items-start gap-2">
                        {website && (
                          <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                            {t('Website')} <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {facebookPage && (
                          <a href={facebookPage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                            <span data-i18n-skip>Facebook</span> <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {!website && !facebookPage && <span className="text-sm text-slate-400">{t('No links saved')}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="flex min-w-[150px] items-center gap-2">
                        {client.profile && canOpenWorkspace ? <Link to={`/clients/${encodeURIComponent(client.profile.id)}`} className={cn(buttonBase, 'min-h-10 bg-accent px-3 py-2 text-sm text-white')}>{t('Workspace')} <ArrowRight className="h-4 w-4" /></Link> : <Link to={`/tasks?client=${encodeURIComponent(client.name)}`} className={cn(buttonBase, 'min-h-10 bg-accent px-3 py-2 text-sm text-white')}>{t('View tasks')}</Link>}
                        <div className="relative">
                          <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={openMenuClientKey === client.name}
                            aria-controls={openMenuClientKey === client.name ? clientMenuId : undefined}
                            aria-label={t('More actions')}
                            onClick={event => {
                              setClientMenuAnchor(event.currentTarget);
                              setOpenMenuClientKey(prev => prev === client.name ? null : client.name);
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                          {openMenuClientKey === client.name && createPortal(
                            <div
                              ref={clientMenuRef}
                              id={clientMenuId}
                              role="menu"
                              aria-label={t('Client actions')}
                              className="fixed z-40 w-44 overflow-y-auto rounded-panel bg-surface p-1.5 shadow-float ring-1 ring-line"
                              style={{ ...clientMenuPosition, visibility: clientMenuPosition ? 'visible' : 'hidden' }}
                              onKeyDown={event => {
                                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                                event.preventDefault();
                                const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
                                const index = items.indexOf(document.activeElement as HTMLElement);
                                const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                                items[next]?.focus();
                              }}
                            >
                              <Link role="menuitem" to={`/tasks?client=${encodeURIComponent(client.name)}`} onClick={() => setOpenMenuClientKey(null)} className="flex min-h-10 items-center rounded-control px-3 text-sm text-ink hover:bg-inset">{t('View tasks')}</Link>
                              {canEditProfile && <button type="button" role="menuitem" onClick={() => { setOpenMenuClientKey(null); openClientPanel(client, true); }} className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-ink hover:bg-inset"><Pencil className="h-4 w-4 text-muted" />{t('Edit details')}</button>}
                              <button type="button" role="menuitem" onClick={() => openClientPanel(client)} className="flex min-h-10 w-full items-center rounded-control px-3 text-left text-sm text-ink hover:bg-inset">{t('Details')}</button>
                              {website && <a role="menuitem" href={website} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuClientKey(null)} className="flex min-h-10 items-center rounded-control px-3 text-sm text-ink hover:bg-inset">{t('Website')}</a>}
                              {facebookPage && <a role="menuitem" href={facebookPage} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuClientKey(null)} className="flex min-h-10 items-center rounded-control px-3 text-sm text-ink hover:bg-inset"><span data-i18n-skip>Facebook</span></a>}
                              {canDeleteProfile && <button type="button" role="menuitem" onClick={() => openClientDeleteConfirmation(client)} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-control border-t border-line/70 px-3 pt-1 text-left text-sm text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />{t('Delete company')}</button>}
                            </div>, document.body,
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-2 2xl:hidden">
          {filteredClients.map((client, index) => {
            const contact = getClientContact(client);
            const website = safeHttpsUrl(contact.website);
            const facebookPage = safeHttpsUrl(contact.facebookPage);
            const assignedTeam = Array.from(client.assignedUserIds)
              .map(userId => users.find(user => user.id === userId)?.name || userId)
              .filter(Boolean);
            const assignedByTeam = Array.from(client.assignedByIds)
              .map(userId => users.find(user => user.id === userId)?.name || userId)
              .filter(Boolean);

            return (
              <div key={client.name} className={cn('bg-surface p-5', filteredClients.length % 2 === 1 && index === filteredClients.length - 1 && 'md:col-span-2')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 data-i18n-skip className="truncate font-semibold text-slate-950">{client.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">{t('Updated')} {formatLastActivity(client.lastActivity, locale)}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {client.taskCount} {t('tasks')}
                  </span>
                </div>

                <div className="mt-5 grid gap-5 border-t border-line/70 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,1fr)]">
                  <div className="min-w-0 space-y-2">
                    {renderContactSummary(client)}
                    {assignedByTeam.length > 0 && <p className="text-xs text-muted">{t('Assigned by')}: {assignedByTeam.join(', ')}</p>}
                    {assignedTeam.length > 0 && <p className="text-xs text-muted">{t('Assigned staff')}: {assignedTeam.join(', ')}</p>}
                    {client.projectNames.size > 0 && <p className="text-xs text-muted">{t('Projects')}: {Array.from(client.projectNames).join(', ')}</p>}
                  </div>

                  <div className="flex min-w-0 flex-col gap-4 lg:items-end">
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      {Array.from(client.services).slice(0, 3).map(service => (
                        <Badge key={service} tone="slate" className="text-[10px]">
                          {service}
                        </Badge>
                      ))}
                      {client.services.size > 3 && <Badge tone="slate">+{client.services.size - 3}</Badge>}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                      {client.profile && canOpenServiceClient(currentUser, client.name, allTasks, rolePermissions, clientProfiles, allProjects) && <Link to={`/clients/${encodeURIComponent(client.profile.id)}`} className={cn(buttonBase, 'min-h-10 bg-accent px-3 py-2 text-sm text-white')}>{t('Workspace')} <ArrowRight className="h-4 w-4" /></Link>}
                      <Link to={`/tasks?client=${encodeURIComponent(client.name)}`} className={cn(buttonBase, 'min-h-10 bg-accent px-3 py-2 text-sm text-white')}>
                        {t('View tasks')} <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => openClientPanel(client)}
                        className={cn(buttonBase, 'min-h-10 border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm')}
                      >
                        {t('Details')}
                      </button>
                      {(website || facebookPage) && (
                        <div className="flex min-h-10 items-center gap-3 text-sm">
                          {website && <a href={website} target="_blank" rel="noopener noreferrer" className="font-semibold text-muted">{t('Website')}</a>}
                          {facebookPage && <a href={facebookPage} target="_blank" rel="noopener noreferrer" className="font-semibold text-muted"><span data-i18n-skip>Facebook</span></a>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredClients.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">{t('No companies found')}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t('Create a client profile and service plan, or clear the current search.')}
            </p>
          </div>
        )}
      </div>

      {selectedClient && (
        <ModalShell
          labelledBy={clientDialogTitleId}
          onClose={() => requestDiscard(closeClientPanel)}
          panelClassName="max-w-3xl"
        >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-700">{t('Company profile')}</p>
                <h2 data-i18n-skip id={clientDialogTitleId} className="mt-1 truncate text-xl font-semibold text-slate-950">{selectedClient.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedClient.taskCount} {t(selectedClient.taskCount === 1 ? 'linked task' : 'linked tasks')} · {selectedClient.projectIds.size} {t(selectedClient.projectIds.size === 1 ? 'company record' : 'company records')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => requestDiscard(closeClientPanel)}
                disabled={isSavingClient}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label={t('Close client details')}
                title={t('Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
              {isDeleteConfirming && deleteImpact && (
                <section className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4" aria-label={t('Deletion impact')}>
                  <h3 className="font-semibold text-red-800">{t('Deletion impact')}: <span data-i18n-skip>{selectedClientSnapshot?.name}</span></h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    {[[t('Tasks'), deleteImpact.tasks], [t('Projects'), deleteImpact.projects], [t('Plans'), deleteImpact.plans], [t('Service cycles'), deleteImpact.cycles], [t('Deliverables'), deleteImpact.deliverables]].map(([label, count]) => (
                      <div key={label}><dt>{label}</dt><dd className="font-semibold">{count}</dd></div>
                    ))}
                  </dl>
                </section>
              )}
              {(profileError || renameError) && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert" aria-live="polite">
                  {profileError || renameError}
                </div>
              )}
              {isRenamingClient && (
                <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <label htmlFor="client-rename" className="block text-xs font-medium text-blue-700">
                    {t('Rename client / brand')}
                  </label>
                  <p className="mt-1 text-xs leading-5 text-blue-700/80">
                    {t('This updates the client name across linked tasks, companies, client accounts, and notifications.')}
                  </p>
                  <input
                    id="client-rename"
                    type="text"
                    className={cn(inputBase, 'mt-3 bg-white')}
                    value={renameValue}
                    onChange={(event) => {
                      setRenameValue(event.target.value);
                      setRenameError('');
                    }}
                    autoFocus
                  />
                </section>
              )}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">{t('Contact')}</h3>
                  <div className="mt-3">
                    {isEditingProfile ? (
                      <div className="space-y-3">
                        <div>
                          <label htmlFor={`${contactFieldId}-clientSince`} className="mb-1 block text-xs font-medium text-slate-600">{t('Client since')}</label>
                          <input
                            type="date"
                            className={cn(inputBase, 'p-2 text-xs')}
                            id={`${contactFieldId}-clientSince`}
                            value={profileForm.clientSince}
                            onChange={e => updateProfileField('clientSince', e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor={`${contactFieldId}-contactPerson`} className="mb-1 block text-xs font-medium text-slate-600">{t('Contact Person')}</label>
                          <input
                            type="text"
                            className={cn(inputBase, 'p-2 text-xs')}
                            id={`${contactFieldId}-contactPerson`}
                            value={profileForm.contactPerson}
                            onChange={e => updateProfileField('contactPerson', e.target.value)}
                            placeholder={t('e.g. John Doe')}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor={`${contactFieldId}-email`} className="mb-1 block text-xs font-medium text-slate-600">{t('Email')}</label>
                            <input
                              type="email"
                              className={cn(inputBase, 'p-2 text-xs')}
                              id={`${contactFieldId}-email`}
                              value={profileForm.email}
                              onChange={e => updateProfileField('email', e.target.value)}
                              data-i18n-skip
                              placeholder="john@brand.com"
                            />
                          </div>
                          <div>
                            <label htmlFor={`${contactFieldId}-phone`} className="mb-1 block text-xs font-medium text-slate-600">{t('Phone')}</label>
                            <input
                              type="text"
                              className={cn(inputBase, 'p-2 text-xs')}
                              id={`${contactFieldId}-phone`}
                              value={profileForm.phone}
                              onChange={e => updateProfileField('phone', e.target.value)}
                              placeholder={t('Phone number')}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor={`${contactFieldId}-website`} className="mb-1 block text-xs font-medium text-slate-600">{t('Website')}</label>
                            <input
                              type="url"
                              className={cn(inputBase, 'p-2 text-xs')}
                              id={`${contactFieldId}-website`}
                              value={profileForm.website}
                              onChange={e => updateProfileField('website', e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                          <div>
                            <label htmlFor={`${contactFieldId}-facebookPage`} className="mb-1 block text-xs font-medium text-slate-600">{t('Facebook Page')}</label>
                            <input
                              type="url"
                              className={cn(inputBase, 'p-2 text-xs')}
                              id={`${contactFieldId}-facebookPage`}
                              value={profileForm.facebookPage}
                              onChange={e => updateProfileField('facebookPage', e.target.value)}
                              placeholder={t('Facebook URL')}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`${contactFieldId}-address`} className="mb-1 block text-xs font-medium text-slate-600">{t('Address')}</label>
                          <textarea
                            rows={2}
                            className={cn(inputBase, 'resize-none p-2 text-xs')}
                            id={`${contactFieldId}-address`}
                            value={profileForm.address}
                            onChange={e => updateProfileField('address', e.target.value)}
                            placeholder={t('Business address...')}
                          />
                        </div>
                        <div>
                          <label htmlFor={`${contactFieldId}-notes`} className="mb-1 block text-xs font-medium text-slate-600">{t('Note / Details')}</label>
                          <textarea
                            rows={3}
                            className={cn(inputBase, 'resize-none p-2 text-xs')}
                            id={`${contactFieldId}-notes`}
                            value={profileForm.notes}
                            onChange={e => updateProfileField('notes', e.target.value)}
                            placeholder={t('Notes about contact or client details...')}
                          />
                        </div>
                      </div>
                    ) : (
                      renderContactSummary(selectedClient)
                    )}
                  </div>
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">{t('Work Summary')}</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {isBossKoo(currentUser) && selectedClient.profile && !selectedClient.profile.discovered && (
                      <p>
                        <span className="font-semibold text-slate-500">{t('Owner')}:</span>{' '}
                        <select
                          aria-label={t('Owner')} data-i18n-skip
                          className={cn(inputBase, 'mt-1 inline-block w-auto p-2 text-xs')}
                          value={selectedClient.profile.createdBy || ''}
                          disabled={isSavingClient || Boolean(pendingClientChange) || upgradeRequired}
                          onChange={event => void saveClientOwner(event.target.value || undefined)}
                        >
                          <option value="">{t('Unassigned')}</option>
                          {users.filter(user => ['Project Manager', 'HOD'].includes(user.role)).sort((a, b) => a.name.localeCompare(b.name)).map(user => (
                            <option key={user.id} value={user.id}>{user.name} · {t(getRoleDisplayName(user.role))}</option>
                          ))}
                        </select>
                        {pendingClientChange?.kind === 'owner' && (
                          <Button type="button" variant="secondary" disabled={isSavingClient} onClick={() => void saveClientOwner()} className="mt-2">
                            {isOwnerSaving ? t('Saving…') : t('Retry save')}
                          </Button>
                        )}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold text-slate-500">{t('Client Added:')}</span>{' '}
                      <strong className="text-slate-950">
                        {selectedClient.addedAt ? formatLocalizedDate(new Date(getActivityTime(selectedClient.addedAt)), locale) : t('No date recorded')}
                      </strong>
                    </p>
                    <p>
                      <span className="font-semibold text-slate-500">{t('Last Task Date:')}</span>{' '}
                      <strong className="text-slate-950">
                        {selectedClient.latestTaskDate ? formatLocalizedDate(new Date(getActivityTime(selectedClient.latestTaskDate)), locale) : t('No tasks recorded')}
                      </strong>
                    </p>
                    <p>
                      <span className="font-semibold text-slate-500">{t('Assigned by')}:</span>{' '}
                      <strong className="text-slate-950">
                        {Array.from(selectedClient.assignedByIds).map(userId => users.find(user => user.id === userId)?.name || userId).join(', ') || t('No assigner recorded')}
                      </strong>
                    </p>
                    <p>
                      <span className="font-semibold text-slate-500">{t('Assigned Staff:')}</span>{' '}
                      <strong className="text-slate-950">
                        {Array.from(selectedClient.assignedUserIds).map(userId => users.find(user => user.id === userId)?.name || userId).join(', ') || t('No staff assigned')}
                      </strong>
                    </p>
                    <p>
                      <span className="font-semibold text-slate-500">{t('Linked Projects:')}</span>{' '}
                      <strong className="text-slate-950">
                        {Array.from(selectedClient.projectNames).join(', ') || t('No projects linked')}
                      </strong>
                    </p>
                  </div>
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
                  <h3 className="text-sm font-bold text-slate-900">{t('Services & Notes')}</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Array.from(selectedClient.services).map(service => (
                      <Badge key={service} tone="slate" className="text-[10px]">
                        {service}
                      </Badge>
                    ))}
                    {selectedClient.services.size === 0 && <span className="text-sm text-slate-400">{t('No services recorded yet.')}</span>}
                  </div>
                  {!isEditingProfile && !isClientUser && getClientContact(selectedClient).notes && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{getClientContact(selectedClient).notes}</p>
                  )}
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-900">{t('Projects')}</h3>
                    {canAddProjects && <button type="button" onClick={() => openProjectEditor(null, selectedClient.profile?.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">{t('New project')}</button>}
                  </div>
                  {selectedClientProjects.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">{t('No projects recorded')}</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {selectedClientProjects.map(project => (
                        <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p data-i18n-skip className="truncate text-sm font-semibold text-slate-800">{project.projectName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{t('Start date')}: {project.startDate || '—'} · {t('Deadline')}: {project.deadline || '—'}</p>
                          </div>
                          {canEditProject(currentUser, project, rolePermissions) && (
                            <button type="button" onClick={() => openProjectEditor(project)} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                              {t('Edit project')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-between">
              <Link
                to={`/tasks?client=${encodeURIComponent(selectedClient.name)}`}
                className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-700')}
                onClick={event => {
                  if (isProfileDirty || isRenameDirty || pendingClientChange || isSavingClient) {
                    event.preventDefault();
                    requestDiscard(() => {
                      closeClientPanel();
                      navigate(`/tasks?client=${encodeURIComponent(selectedClient.name)}`);
                    });
                  } else closeClientPanel();
                }}
              >
                {t('View tasks')} <ArrowRight className="h-4 w-4" />
              </Link>
              <div className={cn(isEditingProfile || isRenamingClient ? 'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto' : 'flex flex-col gap-2 sm:flex-row')}>
                {isRenamingClient ? (
                  <>
                    <button
                      type="button"
                      disabled={isSavingClient}
                      onClick={() => requestDiscard(() => { setIsRenamingClient(false); setRenameError(''); })}
                      className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                    >
                      {t('Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRenameSave()}
                      disabled={isSavingClient}
                      className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-700')}
                    >
                      <Save className="h-4 w-4" /> {isSavingClient ? t('Saving…') : t('Rename')}
                    </button>
                  </>
                ) : isEditingProfile ? (
                    <>
                      <button
                        type="button"
                        disabled={isSavingClient}
                        onClick={() => requestDiscard(() => { setIsEditingProfile(false); setProfileError(''); })}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleProfileSave()}
                        disabled={isSavingClient}
                        className={cn(buttonBase, 'min-h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-emerald-700')}
                      >
                        <Save className="h-4 w-4" /> {isSavingClient ? t('Saving…') : t('Save')}
                      </button>
                    </>
                ) : (
                  isDeleteConfirming ? (
                    <>
                    <p className="self-center text-sm font-medium text-red-700 sm:mr-2">{t('Delete this company? This also removes linked tasks, projects, service plans and delivery records. This action cannot be undone.')}</p>
                      <button
                        type="button"
                        onClick={() => requestDiscard(() => setIsDeleteConfirming(false))}
                        disabled={isSavingClient}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteClient()}
                        disabled={isSavingClient}
                        className={cn(buttonBase, 'min-h-10 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60')}
                      >
                        <Trash2 className="h-4 w-4" /> {isSavingClient ? t('Deleting…') : t('Delete company')}
                      </button>
                    </>
                  ) : (
                  <>
                    {selectedClientCanRename && (
                      <button
                        type="button"
                        onClick={() => {
                          setRenameValue(selectedClient.name);
                          setRenameBaseline(selectedClient.name);
                          setRenameError('');
                          setIsRenamingClient(true);
                        }}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        <Pencil className="h-4 w-4" /> {t('Rename')}
                      </button>
                    )}
                    {selectedClientCanEditProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          const form = getProfileForm(selectedClient);
                          setProfileDraft(form);
                          setProfileBaseline(form);
                          setProfileError('');
                          setIsEditingProfile(true);
                        }}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        <Pencil className="h-4 w-4" /> {t('Edit details')}
                      </button>
                    )}
                    {selectedClientCanDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileError('');
                          prepareClientDeletion(selectedClient);
                        }}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow-sm hover:bg-red-50')}
                      >
                        <Trash2 className="h-4 w-4" /> {t('Delete company')}
                      </button>
                    )}
                  </>
                  )
                )}
              </div>
            </div>
        </ModalShell>
      )}
      {discardAction && <ConfirmDialog
        title={t('Discard unsaved changes?')}
        description={pendingClientChange ? t('Discard pending changes and reload the latest saved workspace?') : t('Your company changes have not been saved.')}
        confirmLabel={t('Discard changes')}
        cancelLabel={t('Keep editing')}
        labelledBy={discardDialogTitleId}
        busy={isDiscarding}
        onConfirm={confirmDiscard}
        onClose={() => setDiscardAction(null)}
      />}
      {isCreateClientOpen && <CreateClientProfileModal
        onClose={() => { setIsCreateClientOpen(false); clearSearch(); }}
        onCreateProject={canAddProjects ? (clientId) => {
          setIsCreateClientOpen(false);
          openProjectEditor(null, clientId);
        } : undefined}
        onAddServicePlan={canManageClientPlans(currentUser, rolePermissions) ? (clientId) => {
          setIsCreateClientOpen(false);
          setPlanClientId(clientId);
        } : undefined}
      />}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        project={editingProject}
        initialClientId={initialProjectClientId}
        onClose={closeProjectEditor}
      />
      {planClientId && <CreateClientPlanModal
        client={clientProfiles.find(client => client.id === planClientId)}
        onClose={() => setPlanClientId('')}
      />}
    </div>
  );
};

export default Clients;
