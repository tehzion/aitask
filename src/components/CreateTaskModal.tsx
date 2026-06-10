import React, { useState } from 'react';
import { useStore } from '../store';
import { X, Plus } from 'lucide-react';
import { Department, Priority, RecurrenceFrequency, ServiceType } from '../types';
import CreateProjectModal from './CreateProjectModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor'];
const SERVICES: ServiceType[] = ['Social Media', 'Design', 'Video', 'Website', 'SEO', 'Ads', 'Branding'];
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];
const RECURRENCE_OPTIONS: RecurrenceFrequency[] = ['None', 'Daily', 'Weekly', 'Monthly'];

const CreateTaskModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { users, currentUser, addTask, projects } = useStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [customerDetails, setCustomerDetails] = useState('');
  const [facebookPage, setFacebookPage] = useState('');
  const [website, setWebsite] = useState('');
  const [department, setDepartment] = useState<Department>('Designer');
  const [assignedTo, setAssignedTo] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('Design');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('None');
  const [assignmentError, setAssignmentError] = useState('');

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => u.role !== 'Client' && u.department === department);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAssignmentError('');
    if (!currentUser) return;

    if (!assignedTo && filteredUsers.length === 0) {
      setAssignmentError(`No assignable team members exist in ${department}. Add a user to this department before creating the task.`);
      return;
    }
    
    // Default to first user in department if not selected
    const finalAssignee = assignedTo || filteredUsers[0].id;

    addTask({
      title,
      description,
      projectId: projectId || undefined,
      clientName,
      projectName: projectId ? projects.find(p => p.id === projectId)?.projectName : undefined,
      customerDetails,
      facebookPage,
      website,
      department,
      assignedTo: finalAssignee,
      serviceType,
      priority,
      startDate: startDate || new Date().toISOString().split('T')[0],
      dueDate: dueDate || new Date().toISOString().split('T')[0],
      createdBy: currentUser.id,
      status: 'Pending',
      completionPercentage: 0,
      attachmentLink: attachmentLink || undefined,
      attachmentName: attachmentName || undefined,
      notes: notes || undefined,
      isRecurring: recurrenceFrequency !== 'None',
      recurrenceFrequency,
    });

    onClose();
    // Reset form
    setProjectId('');
    setTitle('');
    setDescription('');
    setClientName('');
    setCustomerDetails('');
    setFacebookPage('');
    setWebsite('');
    setAssignedTo('');
    setAttachmentLink('');
    setAttachmentName('');
    setNotes('');
    setRecurrenceFrequency('None');
    setAssignmentError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Create New Task</h2>
            <p className="text-xs text-slate-500 mt-1">Assign work to a specific department or position.</p>
          </div>
          <button 
            onClick={onClose}
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
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">1. Task Details</h3>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-slate-700">Link to Project (Optional)</label>
                  <button 
                    type="button"
                    onClick={() => setIsProjectModalOpen(true)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center transition-colors"
                  >
                    <Plus className="w-3 h-3 mr-0.5" /> New Project
                  </button>
                </div>
                <select 
                  value={projectId} 
                  onChange={e => {
                    const id = e.target.value;
                    setProjectId(id);
                    if (id) {
                      const proj = projects.find(p => p.id === id);
                      if (proj) setClientName(proj.clientName);
                    }
                  }}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm cursor-pointer"
                >
                  <option value="">No Project / Independent Task</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName} ({p.clientName})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Task Title <span className="text-red-500">*</span></label>
                <input 
                  type="text" required
                  value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                  placeholder="e.g., Design Facebook Banners"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                  rows={3}
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm resize-none"
                  placeholder="Describe the task requirements..."
                />
              </div>
            </div>

            {/* Client & Customer Info */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">2. Client & Assets</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client / Brand Name <span className="text-red-500">*</span></label>
                  <input 
                    type="text" required
                    value={clientName} onChange={e => setClientName(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="e.g., EcoLife"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer Details</label>
                  <input 
                    type="text"
                    value={customerDetails} onChange={e => setCustomerDetails(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="Contact person, phone, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Facebook Page</label>
                  <input 
                    type="url"
                    value={facebookPage} onChange={e => setFacebookPage(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="https://facebook.com/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Website</label>
                  <input 
                    type="url"
                    value={website} onChange={e => setWebsite(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            {/* Assignment & Scheduling */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">3. Assignment & Timeline</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Position/Department <span className="text-red-500">*</span></label>
                  <select 
                    value={department} 
                    onChange={e => {
                      setDepartment(e.target.value as Department);
                      setAssignedTo(''); // Reset assignee when department changes
                      setAssignmentError('');
                    }}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm cursor-pointer"
                  >
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assignee</label>
                  <select 
                    value={assignedTo} 
                    onChange={e => setAssignedTo(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm cursor-pointer"
                  >
                    <option value="" disabled>Select team member...</option>
                    {filteredUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                    {filteredUsers.length === 0 && <option disabled>No users in this department</option>}
                  </select>
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
                  <select 
                    value={serviceType} onChange={e => setServiceType(e.target.value as ServiceType)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm cursor-pointer"
                  >
                    {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select 
                    value={priority} onChange={e => setPriority(e.target.value as Priority)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm cursor-pointer"
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                  <input 
                    type="date" required
                    value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date <span className="text-red-500">*</span></label>
                  <input 
                    type="date" required
                    value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                  />
                </div>
              </div>

            </div>

            {/* Files, Notes & Recurrence */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">4. Files & Recurrence</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Link</label>
                  <input
                    type="url"
                    value={attachmentLink}
                    onChange={e => setAttachmentLink(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Attachment Label</label>
                  <input
                    type="text"
                    value={attachmentName}
                    onChange={e => setAttachmentName(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="Brief, artwork, source folder..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recurrence</label>
                  <select
                    value={recurrenceFrequency}
                    onChange={e => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm cursor-pointer"
                  >
                    {RECURRENCE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Internal Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                    placeholder="Any context the team should keep visible"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="create-task-form"
            disabled={filteredUsers.length === 0}
            className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Task
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
