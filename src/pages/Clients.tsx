import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckSquare,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Save,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge, Button, PageHeader, ProgressBar, StatGroup, StatusChip } from '../components/ui';
import { buttonBase, inputBase, pageShell, tableShell } from '../components/uiTokens';
import { canCreateTasks, canEditClientProfile, canRenameClient, canViewAllClients, getVisibleClientNames, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { ClientProfile, ClientServicePlan, ServiceCycle } from '../types';
import ModalShell from '../components/ModalShell';
import CreateClientPlanModal from '../components/CreateClientPlanModal';

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
  services: Set<string>;
  accountUsers: string[];
  details?: string;
  facebookPage?: string;
  website?: string;
  latestTaskId?: string;
  lastActivity?: string;
  addedAt?: string;
  latestTaskDate?: string;
};

type ClientProfileForm = {
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  facebookPage: string;
  notes: string;
};

const emptyProfileForm: ClientProfileForm = {
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

const formatLastActivity = (value?: string) => {
  const time = getActivityTime(value);
  return time ? formatDistanceToNow(new Date(time), { addSuffix: true }) : 'No activity yet';
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
    commitPendingMutation: state.commitPendingMutation,
    upgradeRequired: state.backend.upgradeRequired === true,
  })));
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedClientName, setSelectedClientName] = React.useState('');
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [isRenamingClient, setIsRenamingClient] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState<ClientProfileForm>(emptyProfileForm);
  const [profileError, setProfileError] = React.useState('');
  const [renameValue, setRenameValue] = React.useState('');
  const [renameError, setRenameError] = React.useState('');
  const [isSavingClient, setIsSavingClient] = React.useState(false);
  const [isCreateClientOpen, setIsCreateClientOpen] = React.useState(false);
  const [openMenuClientKey, setOpenMenuClientKey] = React.useState<string | null>(null);
  const clientDialogTitleId = React.useId();

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
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuClientKey]);

  const canSeeAllClients = canViewAllClients(currentUser, rolePermissions);
  const isClientUser = currentUser?.role === 'Client';
  const visibleClientKeys = React.useMemo(() => new Set(
    getVisibleClientNames(currentUser, allTasks, allProjects, rolePermissions).map(getClientKey)
  ), [allProjects, allTasks, currentUser, rolePermissions]);
  const tasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions),
    [allTasks, currentUser, rolePermissions]
  );
  const projects = React.useMemo(
    () => getVisibleProjects(currentUser, allProjects, allTasks, rolePermissions),
    [allProjects, allTasks, currentUser, rolePermissions]
  );
  const canAddTasks = !upgradeRequired && canCreateTasks(currentUser, rolePermissions);

  const clients = React.useMemo(() => {
    const summaries = new Map<string, ClientSummary>();
    const canSeeProfile = (profile: ClientProfile) => {
      if (!currentUser) return false;
      if (canSeeAllClients) return true;
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
      rememberAdded(summary, profile.createdAt);
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
        const summary = ensureClient(user.companyName || '');
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
      ? clients.find(client => getClientKey(client.name) === getClientKey(selectedClientName)) || null
      : null
  ), [clients, selectedClientName]);

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
    ? !upgradeRequired && canRenameClient(currentUser)
    : false;
  const selectedClientCanEditProfile = selectedClient
    ? !upgradeRequired && canEditClientProfile(currentUser, selectedClient.name, allTasks, rolePermissions)
    : false;

  const openClientPanel = (client: ClientSummary, edit = false) => {
    setSelectedClientName(client.name);
    setProfileForm(getProfileForm(client));
    setProfileError('');
    setRenameValue(client.name);
    setRenameError('');
    setIsRenamingClient(false);
    setIsEditingProfile(Boolean(edit && !upgradeRequired && canEditClientProfile(currentUser, client.name, allTasks, rolePermissions)));
  };

  const closeClientPanel = () => {
    setSelectedClientName('');
    setIsEditingProfile(false);
    setIsRenamingClient(false);
    setProfileError('');
    setRenameError('');
  };

  const handleProfileSave = async () => {
    if (!selectedClient) return;

    const result = upsertClientProfile(selectedClient.name, profileForm);
    if (!result.ok) {
      setProfileError(result.error || 'Unable to save client details.');
      return;
    }

    setIsSavingClient(true);
    const saveResult = await commitPendingMutation();
    setIsSavingClient(false);
    if (!saveResult.ok) {
      setProfileError(saveResult.error || 'The client details are waiting to be saved.');
      return;
    }

    setIsEditingProfile(false);
    setProfileError('');
  };

  const handleRenameSave = async () => {
    if (!selectedClient) return;

    const result = renameClient(selectedClient.name, renameValue);
    if (!result.ok) {
      setRenameError(result.error || 'Unable to rename this client.');
      return;
    }


    setIsSavingClient(true);
    const saveResult = await commitPendingMutation();
    setIsSavingClient(false);
    if (!saveResult.ok) {
      setRenameError(saveResult.error || 'The client rename is waiting to be saved.');
      return;
    }

    setSelectedClientName(renameValue.trim());
    setIsRenamingClient(false);
    setRenameError('');
  };

  const renderContactSummary = (client: ClientSummary) => {
    const contact = getClientContact(client);
    const hasStructuredContact = contact.contactPerson || contact.email || contact.phone || contact.address;

    if (!hasStructuredContact && !client.details) {
      return <p className="text-sm text-slate-400">No contact details saved yet.</p>;
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
        title="Clients"
        description="Client scope, current delivery progress, contacts and linked work in one place."
        meta={<><span>{clients.length} visible clients</span><span aria-hidden="true">·</span><span>{totalTasks} linked tasks</span></>}
        action={<div className="flex flex-wrap gap-2">
          {(currentUser?.role === 'Admin' || currentUser?.isSuperAdmin) && <Button onClick={() => setIsCreateClientOpen(true)} disabled={upgradeRequired}><Building2 className="h-4 w-4" />New client</Button>}
          {canAddTasks && <Button variant="secondary" onClick={() => setCreateTaskModalOpen(true)}><Plus className="h-4 w-4" />New task</Button>}
        </div>}
      />

      <StatGroup className="grid-cols-2 lg:grid-cols-4" aria-label="Client summary">
        {[{ label: 'Clients', value: clients.length, icon: Building2 }, { label: 'Saved profiles', value: savedProfiles, icon: FileText }, { label: 'Open tasks', value: openTasks, icon: CheckSquare }, { label: 'Client accounts', value: linkedAccounts, icon: Users }].map(({ label, value, icon: Icon }) => <div key={label} className="flex min-h-28 items-center justify-between gap-4 p-4 sm:p-5"><div><p className="text-xs font-medium text-muted">{label}</p><p className="calm-number mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-control bg-accent-soft text-accent"><Icon className="h-4 w-4" /></span></div>)}
      </StatGroup>

      <div className={tableShell}>
        <div className="flex flex-col gap-3 border-b border-line bg-inset/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-sm">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              className={cn(inputBase, 'py-2.5 pl-10 pr-3')}
              placeholder="Search clients, contacts, addresses..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <p className="text-sm text-slate-500">
            {filteredClients.length} shown from {clients.length} total, {totalTasks} linked task{totalTasks === 1 ? '' : 's'}
          </p>
        </div>

        <div className="hidden overflow-x-auto 2xl:block">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="sticky top-0 z-[1] border-b border-line bg-inset text-xs text-muted">
              <tr>
                <th className="px-5 py-4 font-semibold">Client / Brand</th>
                <th className="px-5 py-4 font-semibold">Contact</th>
                <th className="px-5 py-4 font-semibold">Services</th>
                <th className="px-5 py-4 font-semibold">Tasks</th>
                <th className="px-5 py-4 font-semibold">Links</th>
                <th className="px-5 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
                const contact = getClientContact(client);
                const website = safeHttpsUrl(contact.website);
                const facebookPage = safeHttpsUrl(contact.facebookPage);
                const serviceContext = getServiceContext(client);

                return (
                  <tr key={client.name} className="border-b border-line/70 bg-surface text-ink transition-colors duration-160 hover:bg-inset/60">
                    <td className="px-5 py-6 align-top">
                      <div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-xs font-semibold text-accent">{client.name.slice(0, 2).toUpperCase()}</span><div><div data-i18n-skip className="font-semibold text-ink">{client.name}</div>{serviceContext?.plan && <StatusChip className="mt-1.5" tone={serviceContext.plan.status === 'Active' ? 'emerald' : serviceContext.plan.status === 'Paused' ? 'amber' : 'slate'}>{serviceContext.plan.status}</StatusChip>}</div></div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from(client.sources).map(source => (
                          <span key={source} className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium', sourceClasses[source])}>
                            {source}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Updated {formatLastActivity(client.lastActivity)}</p>
                    </td>
                    <td className="max-w-[340px] px-5 py-6 align-top">
                      {renderContactSummary(client)}
                      {client.accountUsers.length > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Account: {client.accountUsers.join(', ')}
                        </p>
                      )}
                      {client.projectNames.size > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          Company: {Array.from(client.projectNames).slice(0, 2).join(', ')}
                          {client.projectNames.size > 2 ? ` +${client.projectNames.size - 2}` : ''}
                        </p>
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
                        {client.services.size === 0 && <span className="text-sm text-slate-400">No services</span>}
                      </div>
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="font-semibold text-ink">{client.taskCount} total</div>
                      <p className="mt-1 text-xs text-slate-500">{client.openTaskCount} open, {client.completedTaskCount} completed</p>
                      <p className="mt-1 text-xs text-slate-500">{client.projectIds.size} company record{client.projectIds.size === 1 ? '' : 's'}</p>
                      {serviceContext?.cycle && <ProgressBar className="mt-3 w-40" label="Cycle delivered" value={serviceContext.delivered} max={Math.max(1, serviceContext.included)} />}
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="flex flex-col items-start gap-2">
                        {website && (
                          <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                            Website <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {facebookPage && (
                          <a href={facebookPage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                            Facebook <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {!website && !facebookPage && <span className="text-sm text-slate-400">No links saved</span>}
                      </div>
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="flex min-w-[150px] items-center gap-2">
                        {client.profile ? <Link to={`/clients/${encodeURIComponent(client.profile.id)}`} className={cn(buttonBase, 'min-h-10 bg-accent px-3 py-2 text-sm text-white')}>Workspace <ArrowRight className="h-4 w-4" /></Link> : <Link to={`/tasks?client=${encodeURIComponent(client.name)}`} className={cn(buttonBase, 'min-h-10 bg-accent px-3 py-2 text-sm text-white')}>View tasks</Link>}
                        <div className="relative">
                          <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={openMenuClientKey === client.name}
                            aria-label={`More actions for ${client.name}`} data-i18n-skip
                            onClick={() => setOpenMenuClientKey(prev => prev === client.name ? null : client.name)}
                            className="flex h-10 w-10 items-center justify-center rounded-control text-muted hover:bg-inset hover:text-ink"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                          {openMenuClientKey === client.name && (
                            <div role="menu" data-i18n-skip aria-label={`Actions for ${client.name}`} className="absolute right-0 top-11 z-20 w-44 rounded-panel bg-surface p-1.5 shadow-float ring-1 ring-line">
                              <Link role="menuitem" to={`/tasks?client=${encodeURIComponent(client.name)}`} onClick={() => setOpenMenuClientKey(null)} className="flex min-h-10 items-center rounded-control px-3 text-sm text-ink hover:bg-inset">View tasks</Link>
                              <button type="button" role="menuitem" onClick={() => openClientPanel(client)} className="flex min-h-10 w-full items-center rounded-control px-3 text-left text-sm text-ink hover:bg-inset">Details</button>
                              {website && <a role="menuitem" href={website} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuClientKey(null)} className="flex min-h-10 items-center rounded-control px-3 text-sm text-ink hover:bg-inset">Website</a>}
                              {facebookPage && <a role="menuitem" href={facebookPage} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuClientKey(null)} className="flex min-h-10 items-center rounded-control px-3 text-sm text-ink hover:bg-inset">Facebook</a>}
                            </div>
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
          {filteredClients.map(client => {
            const contact = getClientContact(client);
            const website = safeHttpsUrl(contact.website);
            const facebookPage = safeHttpsUrl(contact.facebookPage);

            return (
              <div key={client.name} className="bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 data-i18n-skip className="truncate font-semibold text-slate-950">{client.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">Updated {formatLastActivity(client.lastActivity)}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {client.taskCount} tasks
                  </span>
                </div>

                <div className="mt-4">{renderContactSummary(client)}</div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {Array.from(client.services).slice(0, 3).map(service => (
                    <Badge key={service} tone="slate" className="text-[10px]">
                      {service}
                    </Badge>
                  ))}
                  {client.services.size > 3 && <Badge tone="slate">+{client.services.size - 3}</Badge>}
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  {client.profile && <Link to={`/clients/${encodeURIComponent(client.profile.id)}`} className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm')}>Workspace <ArrowRight className="h-4 w-4" /></Link>}
                  <Link to={`/tasks?client=${encodeURIComponent(client.name)}`} className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm')}>
                    View tasks <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => openClientPanel(client)}
                    className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm')}
                  >
                    Details
                  </button>
                  {(website || facebookPage) && (
                    <div className="flex items-center gap-3 text-sm">
                      {website && <a href={website} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-600">Website</a>}
                      {facebookPage && <a href={facebookPage} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-600">Facebook</a>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredClients.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No clients found</p>
            <p className="mt-1 text-sm text-slate-500">
              Add a client or brand name when creating a task, and it will appear here automatically.
            </p>
          </div>
        )}
      </div>

      {selectedClient && (
        <ModalShell
          labelledBy={clientDialogTitleId}
          onClose={closeClientPanel}
          panelClassName="max-w-3xl"
        >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-700">Client profile</p>
                <h2 data-i18n-skip id={clientDialogTitleId} className="mt-1 truncate text-xl font-semibold text-slate-950">{selectedClient.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedClient.taskCount} linked task{selectedClient.taskCount === 1 ? '' : 's'} · {selectedClient.projectIds.size} company record{selectedClient.projectIds.size === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeClientPanel}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close client details"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
              {profileError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert" aria-live="polite">
                  {profileError}
                </div>
              )}
              {isRenamingClient && (
                <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <label htmlFor="client-rename" className="block text-xs font-medium text-blue-700">
                    Rename client / brand
                  </label>
                  <p className="mt-1 text-xs leading-5 text-blue-700/80">
                    This updates the client name across linked tasks, companies, client accounts, and notifications.
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
                  {renameError && <p className="mt-2 text-sm font-semibold text-red-700" role="alert" aria-live="polite">{renameError}</p>}
                </section>
              )}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">Contact</h3>
                  <div className="mt-3">
                    {isEditingProfile ? (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Contact Person</label>
                          <input
                            type="text"
                            className={cn(inputBase, 'p-2 text-xs')}
                            value={profileForm.contactPerson}
                            onChange={e => setProfileForm({ ...profileForm, contactPerson: e.target.value })}
                            placeholder="e.g. John Doe"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                            <input
                              type="email"
                              className={cn(inputBase, 'p-2 text-xs')}
                              value={profileForm.email}
                              onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                              placeholder="john@brand.com"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                            <input
                              type="text"
                              className={cn(inputBase, 'p-2 text-xs')}
                              value={profileForm.phone}
                              onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                              placeholder="Phone number"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Website</label>
                            <input
                              type="url"
                              className={cn(inputBase, 'p-2 text-xs')}
                              value={profileForm.website}
                              onChange={e => setProfileForm({ ...profileForm, website: e.target.value })}
                              placeholder="https://..."
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Facebook Page</label>
                            <input
                              type="url"
                              className={cn(inputBase, 'p-2 text-xs')}
                              value={profileForm.facebookPage}
                              onChange={e => setProfileForm({ ...profileForm, facebookPage: e.target.value })}
                              placeholder="Facebook URL"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
                          <textarea
                            rows={2}
                            className={cn(inputBase, 'resize-none p-2 text-xs')}
                            value={profileForm.address}
                            onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                            placeholder="Business address..."
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Note / Details</label>
                          <textarea
                            rows={3}
                            className={cn(inputBase, 'resize-none p-2 text-xs')}
                            value={profileForm.notes}
                            onChange={e => setProfileForm({ ...profileForm, notes: e.target.value })}
                            placeholder="Notes about contact or client details..."
                          />
                        </div>
                      </div>
                    ) : (
                      renderContactSummary(selectedClient)
                    )}
                  </div>
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">Work Summary</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-500">Client Added:</span>{' '}
                      <strong className="text-slate-950">
                        {selectedClient.addedAt ? format(new Date(getActivityTime(selectedClient.addedAt)), 'MMM dd, yyyy') : 'No date recorded'}
                      </strong>
                    </p>
                    <p>
                      <span className="font-semibold text-slate-500">Last Task Date:</span>{' '}
                      <strong className="text-slate-950">
                        {selectedClient.latestTaskDate ? format(new Date(getActivityTime(selectedClient.latestTaskDate)), 'MMM dd, yyyy') : 'No tasks recorded'}
                      </strong>
                    </p>
                  </div>
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
                  <h3 className="text-sm font-bold text-slate-900">Services & Notes</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Array.from(selectedClient.services).map(service => (
                      <Badge key={service} tone="slate" className="text-[10px]">
                        {service}
                      </Badge>
                    ))}
                    {selectedClient.services.size === 0 && <span className="text-sm text-slate-400">No services recorded yet.</span>}
                  </div>
                  {!isEditingProfile && !isClientUser && getClientContact(selectedClient).notes && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{getClientContact(selectedClient).notes}</p>
                  )}
                </section>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-between">
              <Link
                to={`/tasks?client=${encodeURIComponent(selectedClient.name)}`}
                className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-700')}
                onClick={closeClientPanel}
              >
                View tasks <ArrowRight className="h-4 w-4" />
              </Link>
              <div className={cn(isEditingProfile || isRenamingClient ? 'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto' : 'flex flex-col gap-2 sm:flex-row')}>
                {isRenamingClient ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setIsRenamingClient(false); setRenameError(''); }}
                      className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRenameSave()}
                      disabled={isSavingClient}
                      className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-blue-700')}
                    >
                      <Save className="h-4 w-4" /> Rename
                    </button>
                  </>
                ) : isEditingProfile ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setIsEditingProfile(false); setProfileError(''); }}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleProfileSave()}
                        disabled={isSavingClient}
                        className={cn(buttonBase, 'min-h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow-sm hover:bg-emerald-700')}
                      >
                        <Save className="h-4 w-4" /> Save
                      </button>
                    </>
                ) : (
                  <>
                    {selectedClientCanRename && (
                      <button
                        type="button"
                        onClick={() => {
                          setRenameValue(selectedClient.name);
                          setRenameError('');
                          setIsRenamingClient(true);
                        }}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        <Pencil className="h-4 w-4" /> Rename
                      </button>
                    )}
                    {selectedClientCanEditProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileForm(getProfileForm(selectedClient));
                          setProfileError('');
                          setIsEditingProfile(true);
                        }}
                        className={cn(buttonBase, 'min-h-10 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50')}
                      >
                        <Pencil className="h-4 w-4" /> Edit details
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
        </ModalShell>
      )}
      {isCreateClientOpen && <CreateClientPlanModal onClose={() => setIsCreateClientOpen(false)} />}
    </div>
  );
};

export default Clients;
