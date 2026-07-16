import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { Check, X, Plus } from 'lucide-react';
import { Project, ServiceType } from '../types';
import { getClientOptions, getServiceOptions, hasChoice, PRESET_SERVICES } from '../lib/choiceOptions';
import ModalShell from './ModalShell';
import { fieldLabel, modalFooter } from './uiTokens';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
  onProjectCreated?: (projectId: string) => void;
  onProjectUpdated?: (projectId: string) => void;
}

const CreateProjectModal: React.FC<Props> = ({ isOpen, onClose, project, onProjectCreated, onProjectUpdated }) => {
  const { addProject, updateProject, projects, tasks, users, commitPendingMutation } = useStore();
  const clientListId = React.useId();
  const titleId = React.useId();
  const descriptionId = React.useId();
  const isEditing = Boolean(project);

  const [clientName, setClientName]         = useState('');
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [customServices, setCustomServices] = useState<string[]>([]);
  const [customInput, setCustomInput]       = useState('');
  const [customError, setCustomError]       = useState('');
  const [formError, setFormError]           = useState('');
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);
  const clientOptions = React.useMemo(() => getClientOptions(projects, tasks, users), [projects, tasks, users]);
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
    if (!isOpen) return;
    setFormError('');
    setIsSubmitting(false);
    setPendingProjectId('');
    setCustomError('');
    setCustomInput('');
    setCustomServices([]);

    if (project) {
      setClientName(project.clientName);
      setSelectedServices(project.services || []);
    } else {
      setClientName('');
      setSelectedServices([]);
    }
  }, [isOpen, project]);

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
    setClientName('');
    setSelectedServices([]);
    setCustomServices([]);
    setCustomInput('');
    setCustomError('');
    setFormError('');
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCustomError('');

    if (pendingProjectId) {
      setIsSubmitting(true);
      const pendingResult = await commitPendingMutation();
      setIsSubmitting(false);
      if (!pendingResult.ok) {
        setFormError(pendingResult.error || 'The company is still waiting to be saved.');
        return;
      }
      if (project) onProjectUpdated?.(pendingProjectId);
      else onProjectCreated?.(pendingProjectId);
      handleClose();
      return;
    }

    const trimmedClientName = clientName.trim();
    const today = new Date().toISOString().split('T')[0];
    const finalStartDate = project?.startDate || today;
    const finalDeadline = project?.deadline || '';

    if (!trimmedClientName) {
      setFormError('Company or brand name is required.');
      return;
    }

    if (allServices.length === 0) {
      setFormError('Select or add at least one service.');
      return;
    }

    if (project) {
      const result = updateProject(project.id, {
        clientName: trimmedClientName,
        projectName: trimmedClientName,
        startDate: finalStartDate,
        deadline: finalDeadline,
        services: allServices,
      });

      if (!result.ok) {
        setFormError(result.error || 'Unable to update this company.');
        return;
      }

      setIsSubmitting(true);
      const saveResult = await commitPendingMutation();
      setIsSubmitting(false);
      if (!saveResult.ok) {
        setPendingProjectId(project.id);
        setFormError(saveResult.error || 'The company update is waiting to be saved.');
        return;
      }

      if (onProjectUpdated) onProjectUpdated(project.id);
      handleClose();
      return;
    }

    const newProjectId = addProject({
      clientName: trimmedClientName,
      projectName: trimmedClientName,
      startDate: finalStartDate,
      deadline: finalDeadline,
      services: allServices,
    });

    if (!newProjectId) {
      setFormError('You do not have permission to create companies.');
      return;
    }

    setIsSubmitting(true);
    const saveResult = await commitPendingMutation();
    setIsSubmitting(false);
    if (!saveResult.ok) {
      setPendingProjectId(newProjectId);
      setFormError(saveResult.error || 'The company is waiting to be saved.');
      return;
    }

    if (onProjectCreated) onProjectCreated(newProjectId);
    handleClose();
  };

  return (
    <ModalShell
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={handleClose}
      overlayClassName="z-[60]"
      panelClassName="max-w-md animate-in fade-in zoom-in-95 duration-200"
    >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-slate-950">{isEditing ? 'Edit company' : 'Create company'}</h2>
            <p id={descriptionId} className="mt-0.5 text-xs text-slate-500">{isEditing ? 'Update the company name and service scope.' : 'Add a company for task assignment.'}</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close create project modal"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <form id="create-project-form" onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className={fieldLabel}>
                Company name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required
                value={clientName} onChange={e => { setClientName(e.target.value); setFormError(''); }}
                list={clientListId}
                maxLength={80}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                placeholder="e.g., TechNova"
              />
              <datalist id={clientListId}>
                {clientOptions.map(option => <option key={option} value={option} />)}
              </datalist>
            </div>

            {/* Required Services */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Required Services <span className="text-red-500">*</span>
              </label>

              {/* Preset service toggles */}
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESET_SERVICES.map(service => {
                  const isSelected = selectedServices.includes(service);
                  return (
                    <button
                      key={service}
                      type="button"
                      onClick={() => togglePreset(service)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {isSelected && <Check className="mr-1 inline h-3 w-3" />}{service}
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
                        onClick={() => togglePreset(service)}
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
                        onClick={() => removeCustomService(name)}
                        className="ml-0.5 text-blue-500 hover:text-blue-700 transition-colors rounded"
                        aria-label={`Remove ${name}`}
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
                    placeholder="Add custom service…"
                    maxLength={40}
                    className="w-full bg-white border border-dashed border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 block px-3 py-2 outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCustomService}
                  disabled={!customInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>

              {customError && (
                <p className="text-xs text-red-500 mt-1.5">{customError}</p>
              )}

              {!customError && customInput && (
                <p className="text-xs text-slate-400 mt-1.5">Press Enter or click Add</p>
              )}

              {/* Selected summary */}
              {allServices.length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  <span className="font-semibold text-slate-700">{allServices.length}</span> service{allServices.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert" aria-live="assertive">
                {formError}
              </div>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className={modalFooter}>
          <button
            type="button" onClick={handleClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button
            type="submit" form="create-project-form"
            disabled={isSubmitting}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : pendingProjectId ? 'Retry saving' : isEditing ? 'Save changes' : 'Create company'}
          </button>
        </div>
    </ModalShell>
  );
};

export default CreateProjectModal;
