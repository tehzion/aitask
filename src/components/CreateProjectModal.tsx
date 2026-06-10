import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import { X, Plus } from 'lucide-react';
import { ServiceType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
}

const PRESET_SERVICES: ServiceType[] = ['Social Media', 'Design', 'Video', 'Website', 'SEO', 'Ads', 'Branding'];

const CreateProjectModal: React.FC<Props> = ({ isOpen, onClose, onProjectCreated }) => {
  const { addProject } = useStore();

  const [clientName, setClientName]         = useState('');
  const [projectName, setProjectName]       = useState('');
  const [startDate, setStartDate]           = useState('');
  const [deadline, setDeadline]             = useState('');
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [customServices, setCustomServices] = useState<string[]>([]);
  const [customInput, setCustomInput]       = useState('');
  const [customError, setCustomError]       = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const allServices = [...selectedServices, ...customServices];

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
      ...PRESET_SERVICES.map(s => s.toLowerCase()),
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
    setProjectName('');
    setStartDate('');
    setDeadline('');
    setSelectedServices([]);
    setCustomServices([]);
    setCustomInput('');
    setCustomError('');
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (allServices.length === 0) return;

    const services: ServiceType[] = allServices as ServiceType[];
    const newProjectId = addProject({
      clientName,
      projectName,
      startDate: startDate || new Date().toISOString().split('T')[0],
      deadline:  deadline  || new Date().toISOString().split('T')[0],
      services,
    });

    if (onProjectCreated) onProjectCreated(newProjectId);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Create New Project</h2>
            <p className="text-xs text-slate-500 mt-0.5">Start a new project for a client.</p>
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
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required
                value={clientName} onChange={e => setClientName(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                placeholder="e.g., TechNova, EcoLife"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required
                value={projectName} onChange={e => setProjectName(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                placeholder="e.g., Q3 Marketing Campaign"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date" required value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Deadline <span className="text-red-500">*</span>
                </label>
                <input
                  type="date" required value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                />
              </div>
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
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {isSelected && <span className="mr-1">✓</span>}{service}
                    </button>
                  );
                })}
              </div>

              {/* Custom services tags */}
              {customServices.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {customServices.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-100 border border-violet-300 text-violet-700"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeCustomService(name)}
                        className="ml-0.5 text-violet-400 hover:text-violet-700 transition-colors rounded"
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
                    className="w-full bg-white border border-dashed border-slate-300 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-violet-400 block px-3 py-2 outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCustomService}
                  disabled={!customInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-sm"
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

              {allServices.length === 0 && !customInput && (
                <p className="text-xs text-red-500 mt-2">Please select at least one service.</p>
              )}

              {/* Selected summary */}
              {allServices.length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  <span className="font-semibold text-slate-700">{allServices.length}</span> service{allServices.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button
            type="button" onClick={handleClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button
            type="submit" form="create-project-form"
            disabled={allServices.length === 0}
            className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;
