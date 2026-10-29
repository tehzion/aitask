import SystemMessage from './SystemMessage';
import { getTodayInputDate } from '../lib/utils';
import { useRecoverableForm } from '../hooks/useRecoverableForm';
import DraftRecoveryNotice from './DraftRecoveryNotice';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isPendingMutationResolution, useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { Check, X, Plus } from 'lucide-react';
import { Project, ProjectApprovalMode, ServiceType } from '../types';
import { getServiceOptions, hasChoice, PRESET_SERVICES } from '../lib/choiceOptions';
import ModalShell from './ModalShell';
import BackendFreshness from './BackendFreshness';
import { fieldLabel, modalFooter } from './uiTokens';
import { canCreateClientProfiles, canViewAllClients, getVisibleClientNames, isBossKoo, isHodUser } from '../lib/access';
import CreateClientProfileModal from './CreateClientProfileModal';
import { useI18n } from './I18nProvider';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
  initialClientId?: string;
  onClientCreated?: (clientId: string) => void;
  onProjectCreated?: (projectId: string) => void;
  onProjectUpdated?: (projectId: string) => void;
}

const CreateProjectModal: React.FC<Props> = ({ isOpen, onClose, project, initialClientId, onClientCreated, onProjectCreated, onProjectUpdated }) => {
  const { t } = useI18n();
  const { addProject, updateProject, projects, clients, tasks, users, currentUser, rolePermissions, retryPendingSave, backend } = useStore(useShallow(state => ({
    addProject: state.addProject,
    updateProject: state.updateProject,
    projects: state.projects,
    clients: state.clients,
    tasks: state.tasks,
    users: state.users,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    retryPendingSave: state.retryPendingSave,
    backend: state.backend,
  })));
  const [, setSearchParams] = useSearchParams();
  const titleId = React.useId();
  const descriptionId = React.useId();
  const clientSelectId = React.useId();
  const projectNameId = React.useId();
  const isEditing = Boolean(project);
  const pendingResolution = isPendingMutationResolution(backend);

  // A company search filter on the Companies page would hide the company this
  // project is linked to. Clear it whenever the project is created or updated.
  const clearCompanySearch = React.useCallback(() => {
    setSearchParams(current => {
      if (!current.get('search')) return current;
      const next = new URLSearchParams(current);
      next.delete('search');
      return next;
    }, { replace: true, state: { skipUnsavedGuard: true } });
  }, [setSearchParams]);

  const [clientId, setClientId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [projectManagerIds, setProjectManagerIds] = useState<string[]>([]);
  const [hodMemberIds, setHodMemberIds] = useState<string[]>([]);
  const [staffMemberIds, setStaffMemberIds] = useState<string[]>([]);
  const [memberResponsibilities, setMemberResponsibilities] = useState<Record<string, string>>({});
  const [defaultApprovalMode, setDefaultApprovalMode] = useState<ProjectApprovalMode>('none');
  const [requireClearClosureChecklist, setRequireClearClosureChecklist] = useState(false);
  const [customServices, setCustomServices] = useState<string[]>([]);
  const [customInput, setCustomInput]       = useState('');
  const [customError, setCustomError]       = useState('');
  const [formError, setFormError]           = useState('');
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [formEdited, setFormEdited] = React.useState(false);
  React.useEffect(() => { if (!isOpen) setFormEdited(false); }, [isOpen]);
  const markPristine = useUnsavedChanges(isOpen && (formEdited || isSubmitting));
  const [pendingProjectId, setPendingProjectId] = useState('');
  const pendingProjectSnapshot = useRef<Project | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const initializedFormKeyRef = useRef('');
  const mounted = useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const clientOptions = React.useMemo(() => {
    const visibleKeys = new Set(getVisibleClientNames(currentUser, tasks, projects, rolePermissions, { clients, projects }).map(value => value.trim().toLowerCase()));
    const byName = new Map(clients
      .filter(client => !client.discovered)
      .filter(client => canViewAllClients(currentUser, rolePermissions) || client.createdBy === currentUser?.id || visibleKeys.has(client.clientName.trim().toLowerCase()))
      .map(client => [client.clientName.trim().toLowerCase(), { id: client.id, name: client.clientName }]));
    if (project) {
      const key = project.clientName.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, { id: project.clientId || '', name: project.clientName });
    }
    return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [clients, currentUser, projects, project, rolePermissions, tasks]);
  const serviceOptions = React.useMemo(() => getServiceOptions(projects, tasks), [projects, tasks]);
  const savedCustomServices = React.useMemo(
    () => serviceOptions.filter(service => !hasChoice(PRESET_SERVICES, service)),
    [serviceOptions]
  );
  const allServices = React.useMemo(() => {
    const services = new Map<string, ServiceType>();

    [...selectedServices, ...customServices].forEach(service => {
      const trimmed = service.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!services.has(key)) services.set(key, trimmed);
    });

    return Array.from(services.values());
  }, [selectedServices, customServices]);

  React.useEffect(() => {
    if (!isOpen) {
      initializedFormKeyRef.current = '';
      return;
    }
    const formKey = `${project?.id || 'new'}:${initialClientId || ''}`;
    if (initializedFormKeyRef.current === formKey) return;
    initializedFormKeyRef.current = formKey;
    setFormError('');
    setIsSubmitting(false);
    setPendingProjectId('');
    pendingProjectSnapshot.current = null;
    setCustomError('');
    setCustomInput('');
    setCustomServices([]);

    if (project) {
      setClientId(project.clientId || clientOptions.find(option => option.name.toLowerCase() === project.clientName.trim().toLowerCase())?.id || '');
      setProjectName(project.projectName);
      setStartDate(project.startDate || getTodayInputDate());
      setDeadline(project.deadline || '');
      setSelectedServices(project.services || []);
      const legacyManager = project.createdBy && users.some(user => user.id === project.createdBy && user.role === 'Project Manager' && !user.isSuperAdmin)
        ? [project.createdBy]
        : [];
      setProjectManagerIds(project.projectManagerIds ?? legacyManager);
      setHodMemberIds(project.hodMemberIds || []);
      setStaffMemberIds(project.staffMemberIds || []);
      setMemberResponsibilities(project.memberResponsibilities || {});
      setDefaultApprovalMode(project.defaultApprovalMode || 'none');
      setRequireClearClosureChecklist(Boolean(project.requireClearClosureChecklist));
    } else {
      setClientId(initialClientId || '');
      setProjectName('');
      setStartDate(getTodayInputDate());
      setDeadline('');
      setSelectedServices([]);
      setProjectManagerIds(currentUser?.role === 'Project Manager' && !isBossKoo(currentUser) ? [currentUser.id] : []);
      setHodMemberIds([]);
      setStaffMemberIds([]);
      setMemberResponsibilities({});
      setDefaultApprovalMode('none');
      setRequireClearClosureChecklist(false);
    }
  }, [clientOptions, currentUser, initialClientId, isOpen, project, users]);

  const recovery = useRecoverableForm(`create-project:${initialClientId || 'all'}`, { clientId, projectName, startDate, deadline, selectedServices, customServices, customInput, projectManagerIds, hodMemberIds, staffMemberIds, memberResponsibilities, defaultApprovalMode, requireClearClosureChecklist }, formEdited, isOpen && !project && !pendingProjectId);
  const restoreDraft = () => {
    const value = recovery.restore(); if (!value || typeof value.projectName !== 'string') return;
    setClientId(value.clientId); setProjectName(value.projectName); setStartDate(value.startDate); setDeadline(value.deadline); setSelectedServices(value.selectedServices); setCustomServices(value.customServices); setCustomInput(value.customInput); setFormEdited(true);
    setProjectManagerIds(Array.isArray(value.projectManagerIds) ? value.projectManagerIds : []);
    setHodMemberIds(Array.isArray(value.hodMemberIds) ? value.hodMemberIds : []);
    setStaffMemberIds(Array.isArray(value.staffMemberIds) ? value.staffMemberIds : []);
    setMemberResponsibilities(value.memberResponsibilities && typeof value.memberResponsibilities === 'object' ? value.memberResponsibilities : {});
    setDefaultApprovalMode(['none', 'hod', 'pm'].includes(value.defaultApprovalMode) ? value.defaultApprovalMode : 'none');
    setRequireClearClosureChecklist(Boolean(value.requireClearClosureChecklist));
  };
  if (!isOpen) return null;

  const togglePreset = (service: ServiceType) => {
    setSelectedServices(prev =>
      prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]
    );
  };

  const addCustomService = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;

    // Duplicate check (case-insensitive, across both preset and custom)
    const allLower = [
      ...serviceOptions.map(s => s.toLowerCase()),
      ...customServices.map(s => s.toLowerCase()),
    ];
    if (allLower.includes(trimmed.toLowerCase())) {
      setCustomError('This service already exists.');
      return;
    }
    if (trimmed.length > 40) {
      setCustomError('Service name must be 40 characters or less.');
      return;
    }

    setCustomServices(prev => [...prev, trimmed]);
    setCustomInput('');
    setCustomError('');
    customInputRef.current?.focus();
  };

  const removeCustomService = (name: string) => {
    setCustomServices(prev => prev.filter(s => s !== name));
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomService(); }
    if (e.key === 'Escape') { setCustomInput(''); setCustomError(''); }
  };

  const resetForm = () => {
    setPendingProjectId('');
    pendingProjectSnapshot.current = null;
    setClientId('');
    setProjectName('');
    setStartDate('');
    setDeadline('');
    setSelectedServices([]);
    setProjectManagerIds([]);
    setHodMemberIds([]);
    setStaffMemberIds([]);
    setDefaultApprovalMode('none');
    setRequireClearClosureChecklist(false);
    setCustomServices([]);
    setCustomInput('');
    setCustomError('');
    setFormError('');
  };

  const handleClose = () => { recovery.clear(); markPristine(); setFormEdited(false); resetForm(); clearCompanySearch(); onClose(); };
  const requestClose = () => { if (!isSubmitting && (!formEdited || window.confirm(t('Discard unsaved changes?')))) handleClose(); };

  const confirmProjectSave = async (id: string) => {
    const session = captureWorkspaceSession();
    const actorId = useStore.getState().currentUser?.id;
    const formKey = initializedFormKeyRef.current;
    const isCurrent = () => mounted.current && isWorkspaceSessionCurrent(session) && useStore.getState().currentUser?.id === actorId
      && initializedFormKeyRef.current === formKey;
    pendingProjectSnapshot.current ||= useStore.getState().projects.find(item => item.id === id) || null;
    setPendingProjectId(id);
    setIsSubmitting(true);
    try {
      const result = await retryPendingSave();
      if (!isCurrent()) return false;
      if (!result.ok) { setFormError(result.error || 'The project is still waiting to be saved.'); return false; }
      const canonical = useStore.getState().projects.find(item => item.id === id);
      const submitted = pendingProjectSnapshot.current;
      const fields = ['clientId', 'clientName', 'projectName', 'startDate', 'deadline', 'services', 'projectManagerIds', 'hodMemberIds', 'staffMemberIds', 'memberResponsibilities', 'defaultApprovalMode', 'requireClearClosureChecklist'] as const;
      if (!canonical || !submitted || !fields.every(key => JSON.stringify(canonical[key]) === JSON.stringify(submitted[key]))) {
        setPendingProjectId(''); pendingProjectSnapshot.current = null;
        setFormError('The pending project change is no longer available. Review your draft before saving again.');
        return false;
      }
      return true;
    } catch (error) {
      if (isCurrent()) setFormError(error instanceof Error ? error.message : 'Unable to save this change.');
      return false;
    } finally {
      if (mounted.current && useStore.getState().currentUser?.id === actorId && initializedFormKeyRef.current === formKey) setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');
    setCustomError('');

    if (pendingProjectId) {
      if (!await confirmProjectSave(pendingProjectId)) return;
      if (project) onProjectUpdated?.(pendingProjectId);
      else onProjectCreated?.(pendingProjectId);
      clearCompanySearch();
      handleClose();
      return;
    }

    const selectedClient = clientOptions.find(option => option.id === clientId);
    const trimmedProjectName = projectName.trim();
    const today = new Date().toISOString().split('T')[0];
    const finalStartDate = startDate || today;
    const finalDeadline = deadline;

    if (!selectedClient || (!isEditing && !selectedClient.id)) {
      setFormError('Choose a company from the Companies database.');
      return;
    }
    if (!trimmedProjectName) {
      setFormError('Project name is required.');
      return;
    }

    if (allServices.length === 0) {
      setFormError('Select or add at least one service.');
      return;
    }
    if (!startDate) {
      setFormError('Choose a project start date.');
      return;
    }
    if (deadline && deadline < startDate) {
      setFormError('Project deadline cannot be before the start date.');
      return;
    }
    // Project Managers run projects; Boss Koo administers, so every project needs one.
    const availableProjectManagers = users.filter(user => user.role === 'Project Manager' && !user.isSuperAdmin);
    if (isBossKoo(currentUser) && availableProjectManagers.length > 0
      && !projectManagerIds.some(id => availableProjectManagers.some(user => user.id === id))) {
      setFormError('Choose at least one Project Manager for this project.');
      return;
    }

    if (project) {
      const result = updateProject(project.id, {
        clientId: selectedClient.id || undefined,
        clientName: selectedClient.name,
        projectName: trimmedProjectName,
        startDate: finalStartDate,
        deadline: finalDeadline,
        services: allServices,
        ...(isBossKoo(currentUser) ? { projectManagerIds } : {}),
        hodMemberIds,
        staffMemberIds,
        memberResponsibilities,
        defaultApprovalMode,
        requireClearClosureChecklist,
      });

      if (!result.ok) {
        setFormError(result.error || 'Unable to update this project.');
        return;
      }

      if (!await confirmProjectSave(project.id)) return;

      if (onProjectUpdated) onProjectUpdated(project.id);
      clearCompanySearch();
      handleClose();
      return;
    }

    const newProjectId = addProject({
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      projectName: trimmedProjectName,
      startDate: finalStartDate,
      deadline: finalDeadline,
      services: allServices,
      projectManagerIds,
      hodMemberIds,
      staffMemberIds,
      memberResponsibilities,
      defaultApprovalMode,
      requireClearClosureChecklist,
    });

    if (!newProjectId) {
        setFormError('You do not have permission to create projects.');
      return;
    }

    if (!await confirmProjectSave(newProjectId)) return;

    if (onProjectCreated) onProjectCreated(newProjectId);
    clearCompanySearch();
    handleClose();
  };

  return (
    <>
    <ModalShell
        onEdit={() => setFormEdited(true)}
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={requestClose}
      panelClassName="max-w-md"
    >
      {recovery.storageFailed && <p role="alert" className="px-5 py-3 text-sm text-amber-800">{t('feedback.draftStorageFailed')}</p>}
        {recovery.available && <DraftRecoveryNotice onRestore={restoreDraft} onDiscard={recovery.clear} />}

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-slate-950">{t(isEditing ? 'Edit project' : 'Create project')}</h2>
            <p id={descriptionId} className="mt-0.5 text-xs text-slate-500">{t(isEditing ? 'Update the project name, company, dates, and services.' : 'Add a named project under an existing company.')}</p>
          </div>
          <button
            onClick={requestClose}
            aria-label={t('Close create project modal')}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <form id="create-project-form" onSubmit={handleSubmit} className="space-y-5">
            <fieldset disabled={isSubmitting || Boolean(pendingProjectId)} className="contents">
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor={clientSelectId} className={fieldLabel}>
                  {t('Company name')} <span className="text-red-500">*</span>
                </label>
                {canCreateClientProfiles(currentUser, rolePermissions) && <button type="button" onClick={() => setIsClientModalOpen(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">+ {t('Add client')}</button>}
              </div>
              <select
                required
                id={clientSelectId}
                value={clientId} onChange={e => { setClientId(e.target.value); setFormError(''); }}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
              >
                <option value="">{t('Choose a company')}</option>
                {clientOptions.map(option => <option key={option.id || option.name} value={option.id}>{option.name}</option>)}
              </select>
              {clientOptions.length === 0 && <p className="mt-2 text-xs text-amber-700">{t(canCreateClientProfiles(currentUser, rolePermissions) ? 'Add a client profile first, then continue creating this project.' : 'Ask Boss Koo to add or assign a company before creating this project.')}</p>}
            </div>

            <div>
              <label htmlFor={projectNameId} className={fieldLabel}>{t('Project name')} <span className="text-red-500">*</span></label>
              <input id={projectNameId} type="text" required maxLength={160} value={projectName} onChange={e => { setProjectName(e.target.value); setFormError(''); }} placeholder={t('e.g., Q4 Social Campaign')} className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={fieldLabel}>{t('Start date')} <span className="text-red-500">*</span><input type="date" required value={startDate} onChange={e => { setStartDate(e.target.value); setFormError(''); }} className="mt-1.5 w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg p-2.5 outline-none shadow-sm" /></label>
              <label className={fieldLabel}>{t('Deadline')}<input type="date" min={startDate || undefined} value={deadline} onChange={e => { setDeadline(e.target.value); setFormError(''); }} className="mt-1.5 w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg p-2.5 outline-none shadow-sm" /></label>
            </div>

            {isBossKoo(currentUser) ? (
              <fieldset className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-700">{t('Project managers')} <span className="text-red-500">*</span></legend>
                <p className="mb-2 text-xs leading-5 text-slate-500">{t('Only assigned Project Managers can manage this project.')}</p>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {users.filter(user => user.role === 'Project Manager' && !user.isSuperAdmin).map(user => (
                    <label key={user.id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-slate-700 hover:bg-white">
                      <input type="checkbox" checked={projectManagerIds.includes(user.id)} onChange={() => {
                        setProjectManagerIds(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id]);
                        setFormEdited(true);
                      }} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span>{user.name}</span>
                    </label>
                  ))}
                  {!users.some(user => user.role === 'Project Manager' && !user.isSuperAdmin) && <p className="px-2 py-1 text-xs text-slate-500">{t('No Project Managers available.')}</p>}
                </div>
              </fieldset>
            ) : (
              <p className="-mt-2 text-xs leading-5 text-slate-500">
                {t('Project managers')}: {projectManagerIds.map(id => users.find(user => user.id === id)?.name).filter(Boolean).join(', ') || t('Unassigned')}. {t('Only Boss Koo can change Project Manager assignments.')}
              </p>
            )}

            {(isBossKoo(currentUser) || currentUser.role === 'Project Manager') ? (
              <fieldset className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-700">{t('Department leads (HOD)')}</legend>
                <p className="mb-2 text-xs leading-5 text-slate-500">{t('Choose the HODs who oversee work in this project.')}</p>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {users.filter(user => isHodUser(user, rolePermissions)).map(user => (
                    <label key={user.id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-slate-700 hover:bg-white">
                      <input type="checkbox" checked={hodMemberIds.includes(user.id)} onChange={() => {
                        setHodMemberIds(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id]);
                        setFormEdited(true);
                      }} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span>{user.name}</span>
                    </label>
                  ))}
                  {!users.some(user => isHodUser(user, rolePermissions)) && <p className="px-2 py-1 text-xs text-slate-500">{t('No HOD accounts available.')}</p>}
                </div>
              </fieldset>
            ) : (
              <p className="-mt-2 text-xs leading-5 text-slate-500">
                {t('Department leads (HOD)')}: {hodMemberIds.map(id => users.find(user => user.id === id)?.name).filter(Boolean).join(', ') || t('Unassigned')}.
              </p>
            )}

            {(isBossKoo(currentUser) || currentUser.role === 'Project Manager') && (
              <fieldset className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-700">{t('Project staff')}</legend>
                <p className="mb-2 text-xs leading-5 text-slate-500">{t('Assign shared employee accounts to this project without affecting their other projects.')}</p>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {users.filter(user => user.role === 'Staff' && !isHodUser(user, rolePermissions)).map(user => (
                    <label key={user.id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-slate-700 hover:bg-white">
                      <input type="checkbox" checked={staffMemberIds.includes(user.id)} onChange={() => {
                        setStaffMemberIds(current => current.includes(user.id) ? current.filter(id => id !== user.id) : [...current, user.id]);
                        setFormEdited(true);
                      }} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span data-i18n-skip>{user.name}</span>
                    </label>
                  ))}
                  {!users.some(user => user.role === 'Staff' && !isHodUser(user, rolePermissions)) && <p className="px-2 py-1 text-xs text-slate-500">{t('No Staff accounts available.')}</p>}
                </div>
              </fieldset>
            )}

            {(isBossKoo(currentUser) || currentUser.role === 'Project Manager') && [...hodMemberIds, ...staffMemberIds].length > 0 && (
              <fieldset className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-700">{t('Project responsibilities')}</legend>
                <p className="mb-3 text-xs leading-5 text-slate-500">{t('Optional project-specific responsibility. This does not change the employee’s global role.')}</p>
                <div className="space-y-3">
                  {[...hodMemberIds, ...staffMemberIds].map(memberId => {
                    const member = users.find(user => user.id === memberId);
                    if (!member) return null;
                    return <label key={memberId} className="block text-xs font-medium text-slate-600"><span data-i18n-skip>{member.name}</span>
                      <input maxLength={160} value={memberResponsibilities[memberId] || ''} onChange={event => { setMemberResponsibilities(current => ({ ...current, [memberId]: event.target.value })); setFormEdited(true); }} placeholder={t('e.g. Delivery lead')} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" />
                    </label>;
                  })}
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">{t('Approval and closure defaults')}</legend>
              <label className="block text-sm text-slate-700">{t('Default task approval')}
                <select value={defaultApprovalMode} onChange={event => setDefaultApprovalMode(event.target.value as ProjectApprovalMode)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm shadow-sm">
                  <option value="none">{t('No approval')}</option>
                  <option value="hod">{t('HOD approval')}</option>
                  <option value="pm">{t('PM approval')}</option>
                </select>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{t('Only tasks set to Follow project default use this setting.')}</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={requireClearClosureChecklist} onChange={event => setRequireClearClosureChecklist(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span>{t('Require all closure checklist warnings to be resolved before closing')}</span>
              </label>
            </fieldset>

            {/* Required Services */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t('Required Services')} <span className="text-red-500">*</span>
              </label>

              {/* Preset service toggles */}
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_SERVICES.map(service => {
                  const isSelected = selectedServices.includes(service);
                  return (
                    <button
                      key={service}
                      type="button"
                      data-draft-control
                      onClick={() => togglePreset(service)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {isSelected && <Check className="mr-1 inline h-3 w-3" />}{t(service)}
                    </button>
                  );
                })}
              </div>

              {savedCustomServices.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {savedCustomServices.map(service => {
                    const isSelected = selectedServices.includes(service);
                    return (
                      <button
                        key={service}
                      type="button"
                      data-draft-control
                      onClick={() => togglePreset(service)}
                      data-i18n-skip
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700'
                        }`}
                      >
                        {isSelected && <Check className="mr-1 inline h-3 w-3" />}{service}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom services tags */}
              {customServices.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {customServices.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 border border-blue-200 text-blue-700"
                    >
                      {name}
                      <button
                        type="button"
                        data-draft-control
                        onClick={() => removeCustomService(name)}
                        className="ml-0.5 text-blue-500 hover:text-blue-700 transition-colors rounded"
                        aria-label={`${t('Remove')} ${name}`}
                        data-i18n-skip
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Custom service input */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customInput}
                    onChange={e => { setCustomInput(e.target.value); setCustomError(''); }}
                    onKeyDown={handleCustomKeyDown}
                    placeholder={t('Add custom service…')}
                    maxLength={40}
                    className="w-full bg-white border border-dashed border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 block px-3 py-2 outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  data-draft-control
                  onClick={addCustomService}
                  disabled={!customInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> {t('Add')}
                </button>
              </div>

              {customError && (
                <p className="text-xs text-red-500 mt-1.5"><SystemMessage message={customError} /></p>
              )}

              {!customError && customInput && (
                <p className="text-xs text-slate-400 mt-1.5">{t('Press Enter or click Add')}</p>
              )}

              {/* Selected summary */}
              {allServices.length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  <span className="font-semibold text-slate-700">{allServices.length}</span> {t(allServices.length === 1 ? 'service' : 'services')} {t('selected')}
                </p>
              )}
            </div>

            </fieldset>
            {(formError || pendingResolution) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="alert" aria-live="assertive">
                <p><SystemMessage message={formError || t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.')} /></p>
                {pendingResolution && <BackendFreshness compact className="mt-3" />}
              </div>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className={modalFooter}>
          <button
            type="button" onClick={requestClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit" form="create-project-form"
            disabled={isSubmitting || pendingResolution}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
        {isSubmitting ? t('Saving...') : pendingProjectId ? t('Retry saving') : isEditing ? t('Save changes') : t('Create project')}
          </button>
        </div>
      </ModalShell>
      {isClientModalOpen && <CreateClientProfileModal
        onClose={() => setIsClientModalOpen(false)}
        onCreated={(newClientId) => {
          setClientId(newClientId);
          setFormError('');
          clearCompanySearch();
          onClientCreated?.(newClientId);
          setIsClientModalOpen(false);
        }}
      />}
    </>
  );
};

export default CreateProjectModal;
