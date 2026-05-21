import React, { useState } from 'react';
import { useStore } from '../store';
import { X } from 'lucide-react';
import { ServiceType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
}

const SERVICES: ServiceType[] = ['Social Media', 'Design', 'Video', 'Website', 'SEO', 'Ads', 'Branding'];

const CreateProjectModal: React.FC<Props> = ({ isOpen, onClose, onProjectCreated }) => {
  const { addProject } = useStore();

  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);

  if (!isOpen) return null;

  const toggleService = (service: ServiceType) => {
    setSelectedServices(prev => 
      prev.includes(service) 
        ? prev.filter(s => s !== service)
        : [...prev, service]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newProjectId = addProject({
      clientName,
      projectName,
      startDate: startDate || new Date().toISOString().split('T')[0],
      deadline: deadline || new Date().toISOString().split('T')[0],
      services: selectedServices.length > 0 ? selectedServices : ['Social Media'], // fallback
    });

    if (onProjectCreated) {
      onProjectCreated(newProjectId);
    }
    onClose();
    // Reset form
    setClientName('');
    setProjectName('');
    setStartDate('');
    setDeadline('');
    setSelectedServices([]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Create New Project</h2>
            <p className="text-xs text-slate-500 mt-1">Start a new project for a client.</p>
          </div>
          <button 
            onClick={onClose}
            aria-label="Close create project modal"
            title="Close"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <form id="create-project-form" onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Name <span className="text-red-500">*</span></label>
              <input 
                type="text" required
                value={clientName} onChange={e => setClientName(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                placeholder="e.g., TechNova, EcoLife"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project Name <span className="text-red-500">*</span></label>
              <input 
                type="text" required
                value={projectName} onChange={e => setProjectName(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                placeholder="e.g., Q3 Marketing Campaign"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                <input 
                  type="date" 
                  required
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deadline <span className="text-red-500">*</span></label>
                <input 
                  type="date" 
                  required
                  value={deadline} 
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Required Services <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2">
                {SERVICES.map(service => {
                  const isSelected = selectedServices.includes(service);
                  return (
                    <button
                      key={service}
                      type="button"
                      onClick={() => toggleService(service)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        isSelected 
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {service}
                    </button>
                  );
                })}
              </div>
              {selectedServices.length === 0 && (
                <p className="text-xs text-red-500 mt-2">Please select at least one service.</p>
              )}
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="create-project-form"
            disabled={selectedServices.length === 0}
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
