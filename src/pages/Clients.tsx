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
  Pencil,
  Phone,
  Search,
  Save,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge, Button, PageHeader } from '../components/ui';
import { buttonBase, cardBase, inputBase, pageShell } from '../components/uiTokens';
import { canCreateTasks, canEditClientProfile, canRenameClient, canViewAllClients, getVisibleClientNames, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { ClientProfile } from '../types';

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
  Profile: 'bg-blue-50 text-blue-700 border-blue-100',
  Task: 'bg-violet-50 text-violet-700 border-violet-100',
  Company: 'bg-emerald-50 text-emerald-700 border-emerald-100',
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
    users,
    currentUser,
    rolePermissions,
    setCreateTaskModalOpen,
    upsertClientProfile,
    renameClient,
  } = useStore();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedClientName, setSelectedClientName] = React.useState('');
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [isRenamingClient, setIsRenamingClient] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState<ClientProfileForm>(emptyProfileForm);
  const [profileError, setProfileError] = React.useState('');
  const [renameValue, setRenameValue] = React.useState('');
  const [renameError, setRenameError] = React.useState('');

  const canSeeAllClients = canViewAllClients(currentUser, rolePermissions);
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
  const canAddTasks = canCreateTasks(currentUser, rolePermissions);

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

  const totalTasks = clients.reduce((sum, client) => sum + client.taskCount, 0);
  const openTasks = clients.reduce((sum, client) => sum + client.openTaskCount, 0);
  const linkedAccounts = clients.reduce((sum, client) => sum + client.accountUsers.length, 0);
  const savedProfiles = clients.filter(client => Boolean(client.profile)).length;
  const selectedClientCanRename = selectedClient
    ? canRenameClient(currentUser)
    : false;
  const selectedClientCanEditProfile = selectedClient
    ? canEditClientProfile(currentUser, selectedClient.name, allTasks, rolePermissions)
    : false;

  const openClientPanel = (client: ClientSummary, edit = false) => {
    setSelectedClientName(client.name);
    setProfileForm(getProfileForm(client));
    setProfileError('');
    setRenameValue(client.name);
    setRenameError('');
    setIsRenamingClient(false);
    setIsEditingProfile(Boolean(edit && canEditClientProfile(currentUser, client.name, allTasks, rolePermissions)));
  };

  const closeClientPanel = () => {
    setSelectedClientName('');
    setIsEditingProfile(false);
    setIsRenamingClient(false);
    setProfileError('');
    setRenameError('');
  };

  const handleProfileSave = () => {
    if (!selectedClient) return;

    const result = upsertClientProfile(selectedClient.name, profileForm);
    if (!result.ok) {
      setProfileError(result.error || 'Unable to save client details.');
      return;
    }

    setIsEditingProfile(false);
    setProfileError('');
  };

  const handleRenameSave = () => {
    if (!selectedClient) return;

    const result = renameClient(selectedClient.name, renameValue);
    if (!result.ok) {
      setRenameError(result.error || 'Unable to rename this client.');
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
        title="Clients / Brands"
        description="Manage client contacts, addresses, brand links, account coverage, and linked work."
        action={canAddTasks ? (
          <Button onClick={() => setCreateTaskModalOpen(true)}>+ New Task</Button>
        ) : null}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${cardBase} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Clients / Brands</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{clients.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className={`${cardBase} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Saved Profiles</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{savedProfiles}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className={`${cardBase} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Open Tasks</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{openTasks}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CheckSquare className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className={`${cardBase} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Client Accounts</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{linkedAccounts}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardBase} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
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

                return (
                  <tr key={client.name} className="border-b border-slate-100 bg-white text-slate-700 transition-colors hover:bg-slate-50">
                    <td className="px-5 py-6 align-top">
                      <div className="font-semibold text-slate-950">{client.name}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from(client.sources).map(source => (
                          <span key={source} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', sourceClasses[source])}>
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
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {Array.from(client.services).slice(0, 4).map(service => (
                          <Badge key={service} tone="slate" className="rounded-md text-[10px] uppercase tracking-wide">
                            {service}
                          </Badge>
                        ))}
                        {client.services.size > 4 && <Badge tone="slate">+{client.services.size - 4}</Badge>}
                        {client.services.size === 0 && <span className="text-sm text-slate-400">No services</span>}
                      </div>
                    </td>
                    <td className="px-5 py-6 align-top">
                      <div className="font-semibold text-slate-950">{client.taskCount} total</div>
                      <p className="mt-1 text-xs text-slate-500">{client.openTaskCount} open, {client.completedTaskCount} completed</p>
                      <p className="mt-1 text-xs text-slate-500">{client.projectIds.size} company record{client.projectIds.size === 1 ? '' : 's'}</p>
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
                      <div className="flex min-w-[160px] flex-col items-stretch gap-2">
                        <Link
                          to={`/tasks?client=${encodeURIComponent(client.name)}`}
                          className={cn(buttonBase, 'min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm hover:bg-blue-700')}
                        >
                          View tasks <ArrowRight className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openClientPanel(client)}
                          className={cn(buttonBase, 'min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50')}
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 lg:hidden">
          {filteredClients.map(client => {
            const contact = getClientContact(client);
            const website = safeHttpsUrl(contact.website);
            const facebookPage = safeHttpsUrl(contact.facebookPage);

            return (
              <div key={client.name} className="bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-slate-950">{client.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">Updated {formatLastActivity(client.lastActivity)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                    {client.taskCount} tasks
                  </span>
                </div>

                <div className="mt-4">{renderContactSummary(client)}</div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {Array.from(client.services).slice(0, 3).map(service => (
                    <Badge key={service} tone="slate" className="rounded-md text-[10px] uppercase tracking-wide">
                      {service}
                    </Badge>
                  ))}
                  {client.services.size > 3 && <Badge tone="slate">+{client.services.size - 3}</Badge>}
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Client profile</p>
                <h2 className="mt-1 truncate text-xl font-bold text-slate-950">{selectedClient.name}</h2>
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
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {profileError}
                </div>
              )}
              {isRenamingClient && (
                <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <label htmlFor="client-rename" className="block text-xs font-bold uppercase tracking-wide text-blue-700">
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
                  {renameError && <p className="mt-2 text-sm font-semibold text-red-700">{renameError}</p>}
                </section>
              )}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-slate-900">Contact</h3>
                  <div className="mt-3">
                    {isEditingProfile ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Contact Person</label>
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
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Email</label>
                            <input
                              type="email"
                              className={cn(inputBase, 'p-2 text-xs')}
                              value={profileForm.email}
                              onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                              placeholder="john@brand.com"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Phone</label>
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
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Website</label>
                            <input
                              type="url"
                              className={cn(inputBase, 'p-2 text-xs')}
                              value={profileForm.website}
                              onChange={e => setProfileForm({ ...profileForm, website: e.target.value })}
                              placeholder="https://..."
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Facebook Page</label>
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
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Address</label>
                          <textarea
                            rows={2}
                            className={cn(inputBase, 'resize-none p-2 text-xs')}
                            value={profileForm.address}
                            onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                            placeholder="Business address..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Note / Details</label>
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
                      <Badge key={service} tone="slate" className="rounded-md text-[10px] uppercase tracking-wide">
                        {service}
                      </Badge>
                    ))}
                    {selectedClient.services.size === 0 && <span className="text-sm text-slate-400">No services recorded yet.</span>}
                  </div>
                  {!isEditingProfile && getClientContact(selectedClient).notes && (
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
                      onClick={handleRenameSave}
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
                        onClick={handleProfileSave}
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
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
