import React, { useState } from 'react';
import { useStore } from '../store';
import { X, Plus, ChevronDown } from 'lucide-react';
import { Department, Priority, RecurrenceFrequency, ServiceType } from '../types';
import CreateProjectModal from './CreateProjectModal';
import { useNavigate } from 'react-router-dom';
import { getClientOptions, getServiceOptions, hasChoice } from '../lib/choiceOptions';
import { canManageProjects, getVisibleProjects } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { getTodayInputDate } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor'];
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const RECURRENCE_OPTIONS: RecurrenceFrequency[] = ['None', 'Daily', 'Weekly', 'Monthly'];
const CUSTOM_SERVICE_VALUE = '__custom_service__';

const CreateTaskModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { users, currentUser, addTask, projects, tasks, createTaskInitialDate, rolePermissions, commitPendingMutation } = useStore();
  const navigate = useNavigate();
  const clientListId = React.useId();

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [isAddingCustomClient, setIsAddingCustomClient] = useState(false);
  const [customClientInput, setCustomClientInput] = useState('');
  const [customClientError, setCustomClientError] = useState('');
  const [customerDetails, setCustomerDetails] = useState('');
  const [facebookPage, setFacebookPage] = useState('');
  const [website, setWebsite] = useState('');
  const [department, setDepartment] = useState<Department>('Designer');
  const [assignedTo, setAssignedTo] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('Design');
  const [isAddingCustomService, setIsAddingCustomService] = useState(false);
  const [customServiceInput, setCustomServiceInput] = useState('');
  const [customServiceError, setCustomServiceError] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('None');
  const [assignmentError, setAssignmentError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState('');

  const filteredUsers = users.filter(u => u.role !== 'Client' && u.department === department);
  const canCreateProjects = canManageProjects(currentUser, rolePermissions);
  const visibleProjects = React.useMemo(
    () => getVisibleProjects(currentUser, projects, tasks, rolePermissions),
    [currentUser, projects, rolePermissions, tasks]
  );
  const selectedProject = projectId ? visibleProjects.find(project => project.id === projectId) : undefined;
  const clientOptions = React.useMemo(() => getClientOptions(projects, tasks, users), [projects, tasks, users]);
  const serviceOptions = React.useMemo(() => getServiceOptions(projects, tasks), [projects, tasks]);
  const serviceChoices = React.useMemo(() => {
    if (!serviceType || hasChoice(serviceOptions, serviceType)) return serviceOptions;
    return [...serviceOptions, serviceType];
  }, [serviceOptions, serviceType]);

  const resetForm = React.useCallback(() => {
    setProjectId('');
    setTitle('');
    setDescription('');
    setClientName('');
    setIsAddingCustomClient(false);
    setCustomClientInput('');
    setCustomClientError('');
    setCustomerDetails('');
    setFacebookPage('');
    setWebsite('');
    setDepartment('Designer');
    setAssignedTo('');
    setServiceType('Design');
    setIsAddingCustomService(false);
    setCustomServiceInput('');
    setCustomServiceError('');
    setPriority('Medium');
    setStartDate(getTodayInputDate());
    setDueDate('');
    setAttachmentLink('');
    setAttachmentName('');
    setNotes('');
    setRecurrenceFrequency('None');
    setAssignmentError('');
    setFormError('');
    setIsSubmitting(false);
    setPendingTaskId('');
  }, []);

  const closeAndReset = React.useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndReset();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeAndReset]);

  React.useEffect(() => {
    if (isOpen) {
      setStartDate(createTaskInitialDate || getTodayInputDate());
      setDueDate(createTaskInitialDate || '');
      setFormError('');
      setAssignmentError('');
    }
  }, [createTaskInitialDate, isOpen]);

  if (!isOpen) return null;

  const isValidOptionalUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    try {
      return Boolean(safeHttpsUrl(trimmed));
    } catch {
      return false;
    }
  };

  const selectProject = (id: string) => {
    setProjectId(id);
    setIsAddingCustomClient(false);
    setCustomClientInput('');
    setCustomClientError('');
    if (!id) return;

    const project = visibleProjects.find(item => item.id === id);
    if (project) setClientName(project.clientName);
  };

  const addCustomClient = () => {
    const trimmed = customClientInput.trim();
    if (!trimmed) return;

    if (trimmed.length > 80) {
      setCustomClientError('Client or brand name must be 80 characters or less.');
      return;
    }

    const existingClient = clientOptions.find(choice => choice.toLowerCase() === trimmed.toLowerCase());
    setClientName(existingClient || trimmed);
    setIsAddingCustomClient(false);
    setCustomClientInput('');
    setCustomClientError('');
  };

  const handleCustomClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomClient();
    }

    if (e.key === 'Escape') {
      setIsAddingCustomClient(false);
      setCustomClientInput('');
      setCustomClientError('');
    }
  };

  const selectService = (value: string) => {
    if (value === CUSTOM_SERVICE_VALUE) {
      setIsAddingCustomService(true);
      setCustomServiceInput('');
      setCustomServiceError('');
      return;
    }

    setServiceType(value);
    setIsAddingCustomService(false);
    setCustomServiceInput('');
    setCustomServiceError('');
  };

  const addCustomService = () => {
    const trimmed = customServiceInput.trim();
    if (!trimmed) return;

    if (trimmed.length > 40) {
      setCustomServiceError('Service name must be 40 characters or less.');
      return;
    }

    const existingService = serviceChoices.find(choice => choice.toLowerCase() === trimmed.toLowerCase());
    if (existingService) {
      setServiceType(existingService);
      setIsAddingCustomService(false);
      setCustomServiceInput('');
      setCustomServiceError('');
      return;
    }

    setServiceType(trimmed);
    setIsAddingCustomService(false);
    setCustomServiceInput('');
    setCustomServiceError('');
  };

  const handleCustomServiceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomService();
    }

    if (e.key === 'Escape') {
      setIsAddingCustomService(false);
      setCustomServiceInput('');
      setCustomServiceError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignmentError('');
    setFormError('');
    if (!currentUser) return;

    if (pendingTaskId) {
      setIsSubmitting(true);
      const pendingResult = await commitPendingMutation();
      setIsSubmitting(false);
      if (!pendingResult.ok) {
        setFormError(pendingResult.error || 'The task is still waiting to be saved.');
        return;
      }
      const savedTaskId = pendingTaskId;
      closeAndReset();
      navigate(`/tasks?taskId=${savedTaskId}`);
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedClientName = clientName.trim();
    const trimmedServiceType = serviceType.trim();
    const finalStartDate = startDate.trim() || getTodayInputDate();
    const finalDueDate = dueDate.trim();

    if (!trimmedTitle) {
      setFormError('Task title is required.');
      return;
    }

    if (!trimmedClientName) {
      setFormError('Client or brand name is required.');
      return;
    }

    if (!trimmedServiceType) {
      setFormError('Service type is required.');
      return;
    }

    if (finalStartDate && finalDueDate && new Date(finalDueDate) < new Date(finalStartDate)) {
      setFormError('Due date cannot be earlier than the start date.');
      return;
    }

    if (![facebookPage, website, attachmentLink].every(isValidOptionalUrl)) {
      setFormError('Links must be valid HTTPS URLs.');
      return;
    }

    if (!assignedTo && filteredUsers.length === 0) {
      setAssignmentError(`No assignable team members exist in ${department}. Add a user to this department before creating the task.`);
      return;
    }
    
    // Default to first user in department if not selected
    const finalAssignee = assignedTo || filteredUsers[0].id;

    setIsSubmitting(true);
    const taskId = addTask({
      title: trimmedTitle,
      description: description.trim(),
      projectId: projectId || undefined,
      clientName: trimmedClientName,
      projectName: projectId ? visibleProjects.find(p => p.id === projectId)?.projectName : undefined,
      customerDetails: customerDetails.trim(),
      facebookPage: safeHttpsUrl(facebookPage) || undefined,
      website: safeHttpsUrl(website) || undefined,
      department,
      assignedTo: finalAssignee,
      serviceType: trimmedServiceType,
      priority,
      startDate: finalStartDate,
      dueDate: finalDueDate,
      createdBy: currentUser.id,
      status: 'Pending',
      completionPercentage: 0,
      attachmentLink: safeHttpsUrl(attachmentLink) || undefined,
      attachmentName: attachmentName.trim() || undefined,
      notes: notes.trim() || undefined,
      isRecurring: recurrenceFrequency !== 'None',
      recurrenceFrequency,
    });

    if (!taskId) {
      setIsSubmitting(false);
      setFormError('You do not have permission to create tasks.');
      return;
    }

    const saveResult = await commitPendingMutation();
    setIsSubmitting(false);
    if (!saveResult.ok) {
      setPendingTaskId(taskId);
      setFormError(saveResult.error || 'The task is waiting to be saved. Review the sync status and retry.');
      return;
    }

    closeAndReset();
    navigate(`/tasks?taskId=${taskId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl shadow-slate-950/10 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Create New Task</h2>
            <p className="text-xs text-slate-500 mt-1">Assign work to a specific department or position.</p>
          </div>
          <button 
            onClick={closeAndReset}
            aria-label="Close create task modal"
            title="Close"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <form id="create-task-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Task Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">1. Task Details</h3>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">Link to Company / Brand (Optional)</label>
                  {canCreateProjects && (
                    <button
                      type="button"
                      onClick={() => setIsProjectModalOpen(true)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center transition-colors"
                    >
                      <Plus className="w-3 h-3 mr-0.5" /> New Company / Brand
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={projectId}
                    onChange={e => selectProject(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-10 outline-none shadow-sm cursor-pointer appearance-none"
                  >
                    <option value="">No Company Link / Independent Task</option>
                    {visibleProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.projectName} ({p.clientName})</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Task Title <span className="text-red-500">*</span></label>
                <input 
                  type="text" required
                  value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                  placeholder="e.g., Design Facebook Banners"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                  rows={3}
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm resize-none"
                  placeholder="Describe the task requirements..."
                />
              </div>
            </div>

            {/* Client & Customer Info */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">2. Client & Assets</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700">Client / Brand Name <span className="text-red-500">*</span></label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCustomClient(true);
                        setCustomClientInput('');
                        setCustomClientError('');
                      }}
                      disabled={Boolean(selectedProject)}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center transition-colors disabled:text-slate-300 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3 mr-0.5" /> New Client / Brand
                    </button>
                  </div>
                  <input 
                    type="text" required
                    list={selectedProject ? undefined : clientListId}
                    disabled={Boolean(selectedProject)}
                    value={clientName} onChange={e => setClientName(e.target.value)}
                    maxLength={80}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    placeholder="e.g., EcoLife"
                  />
                  <datalist id={clientListId}>
                    {clientOptions.map(option => <option key={option} value={option} />)}
                  </datalist>
                  {selectedProject && (
                    <p className="text-xs text-slate-500 mt-1">
                      Company follows {selectedProject.projectName}. Clear the company link to edit it.
                    </p>
                  )}
                  {isAddingCustomClient && !selectedProject && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={customClientInput}
                        onChange={e => { setCustomClientInput(e.target.value); setCustomClientError(''); }}
                        onKeyDown={handleCustomClientKeyDown}
                        maxLength={80}
                        autoFocus
                        className="min-w-0 flex-1 bg-white border border-dashed border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block px-3 py-2 outline-none shadow-sm"
                        placeholder="New client or brand"
                      />
                      <button
                        type="button"
                        onClick={addCustomClient}
                        disabled={!customClientInput.trim()}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-sm"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                  )}
                  {customClientError && (
                    <p className="text-xs text-red-500 mt-1">{customClientError}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Facebook Page</label>
                  <input 
                    type="url"
                    value={facebookPage} onChange={e => setFacebookPage(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                    placeholder="https://facebook.com/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Website</label>
                  <input 
                    type="url"
                    value={website} onChange={e => setWebsite(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            {/* Assignment & Scheduling */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">3. Assignment & Timeline</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Position/Department <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select
                      value={department}
                      onChange={e => {
                        setDepartment(e.target.value as Department);
                        setAssignedTo(''); // Reset assignee when department changes
                        setAssignmentError('');
                      }}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-10 outline-none shadow-sm cursor-pointer appearance-none"
                    >
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assignee</label>
                  <div className="relative">
                    <select
                      value={assignedTo}
                      onChange={e => setAssignedTo(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-10 outline-none shadow-sm cursor-pointer appearance-none"
                    >
                      <option value="">
                        {filteredUsers.length > 0 ? `Auto assign: ${filteredUsers[0].name}` : 'No users in this department'}
                      </option>
                      {filteredUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                  </div>
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      No assignable team members in this department.
                    </p>
                  )}
                  {assignmentError && (
                    <p className="text-xs text-red-500 mt-1">{assignmentError}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Service Type</label>
                  <div className="relative">
                    <select
                      value={serviceType} onChange={e => selectService(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-10 outline-none shadow-sm cursor-pointer appearance-none"
                    >
                      {serviceChoices.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value={CUSTOM_SERVICE_VALUE}>+ Add custom service</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                  </div>
                  {isAddingCustomService && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={customServiceInput}
                        onChange={e => { setCustomServiceInput(e.target.value); setCustomServiceError(''); }}
                        onKeyDown={handleCustomServiceKeyDown}
                        maxLength={40}
                        autoFocus
                        className="min-w-0 flex-1 bg-white border border-dashed border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block px-3 py-2 outline-none shadow-sm"
                        placeholder="Custom service"
                      />
                      <button
                        type="button"
                        onClick={addCustomService}
                        disabled={!customServiceInput.trim()}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-sm"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                  )}
                  {customServiceError && (
                    <p className="text-xs text-red-500 mt-1">{customServiceError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <div className="relative">
                    <select
                      value={priority} onChange={e => setPriority(e.target.value as Priority)}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-10 outline-none shadow-sm cursor-pointer appearance-none"
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                  <input 
                    type="date" required
                    value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                  <input 
                    type="date"
                    value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                  />
                </div>
              </div>

            </div>

            {/* Files, Notes & Recurrence */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">4. Files & Recurrence</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Link</label>
                  <input
                    type="url"
                    value={attachmentLink}
                    onChange={e => setAttachmentLink(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Label</label>
                  <input
                    type="text"
                    value={attachmentName}
                    onChange={e => setAttachmentName(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                    placeholder="Brief, artwork, source folder..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recurrence</label>
                  <div className="relative">
                    <select
                      value={recurrenceFrequency}
                      onChange={e => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pr-10 outline-none shadow-sm cursor-pointer appearance-none"
                    >
                      {RECURRENCE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Internal Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                    placeholder="Any context the team should keep visible"
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {formError}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button 
            type="button"
            onClick={closeAndReset}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="create-task-form"
            disabled={filteredUsers.length === 0 || isSubmitting}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving task...' : pendingTaskId ? 'Retry saving task' : 'Create & open task'}
          </button>
        </div>

      </div>
      
      {/* Nested Create Project Modal */}
      <CreateProjectModal 
        isOpen={isProjectModalOpen} 
        onClose={() => setIsProjectModalOpen(false)} 
        onProjectCreated={(newId) => {
          setProjectId(newId);
          // Get the newly created project directly from the latest store state
          const newProj = useStore.getState().projects.find(p => p.id === newId);
          if (newProj) setClientName(newProj.clientName);
          setIsProjectModalOpen(false);
        }}
      />
    </div>
  );
};

export default CreateTaskModal;
