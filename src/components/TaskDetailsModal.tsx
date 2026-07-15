import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { X, Send, MessageSquare, Paperclip, Clock, Calendar, CheckCircle2, XCircle, RotateCcw, History, Pencil, Trash2, Save, ChevronDown } from 'lucide-react';
import { Department, Priority, Task, TaskStatus } from '../types';
import { format, formatDistanceToNow } from 'date-fns';
import { canAssignTasksToOthers, canCommentOnTask, canEditTask as canEditTaskByRole, canReviewTaskAsClient } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { getTodayInputDate, parseOptionalDate } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
}

const statusColors: Record<string, string> = {
  'Pending': 'bg-slate-100 text-slate-700 border border-slate-200',
  'In Progress': 'bg-blue-100 text-blue-700 border border-blue-200',
  'Waiting Approval': 'bg-amber-100 text-amber-700 border border-amber-200',
  'Completed': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Cancelled': 'bg-red-100 text-red-700 border border-red-200',
};

const getStatusColor = (status: string): string => {
  return statusColors[status] || 'bg-slate-100 text-slate-700 border border-slate-200';
};

const DEPARTMENTS: Department[] = ['Operation', 'Management', 'Videoshooting', 'Ads Management', 'Account & Finance', 'Designer', 'Editor'];
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent'];

const ExternalTaskLink: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const href = safeHttpsUrl(value);
  if (!href) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-slate-500" title={value}>
        <Paperclip className="h-3.5 w-3.5" /> {label} (invalid link)
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
      <Paperclip className="h-3.5 w-3.5" /> {label}
    </a>
  );
};

const TaskDetailsModal: React.FC<Props> = ({ isOpen, onClose, task }) => {
  const {
    users,
    currentUser,
    updateTaskStatus,
    updateTask,
    deleteTask,
    addComment,
    updateTaskAttachment,
    reviewClientApproval,
    requestRevision,
    commitPendingMutation,
    rolePermissions,
    taskStatuses,
  } = useStore();
  const [commentText, setCommentText] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editError, setEditError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    clientName: '',
    serviceType: '',
    department: 'Designer' as Department,
    assignedTo: '',
    priority: 'Medium' as Priority,
    startDate: '',
    dueDate: '',
    notes: '',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setAttachmentLink(task?.attachmentLink || '');
    setAttachmentName(task?.attachmentName || '');
    setApprovalNote('');
    setRevisionNote('');
    setEditError('');
    setIsEditingDetails(false);
    if (task) {
      setEditForm({
        title: task.title,
        description: task.description || '',
        clientName: task.clientName,
        serviceType: task.serviceType,
        department: task.department === 'Client' ? 'Designer' : task.department,
        assignedTo: task.assignedTo,
        priority: task.priority,
        startDate: task.startDate || getTodayInputDate(),
        dueDate: task.dueDate,
        notes: task.notes || '',
      });
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const assignee = users.find(u => u.id === task.assignedTo);
  const creator = users.find(u => u.id === task.createdBy);
  const canEditTask = canEditTaskByRole(currentUser, task, rolePermissions);
  const canAddComment = canCommentOnTask(currentUser, task, rolePermissions);
  const canClientReview = canReviewTaskAsClient(currentUser, task, rolePermissions);
  const isClientTaskViewer = currentUser?.role === 'Client';
  const canAssignOthers = canAssignTasksToOthers(currentUser, rolePermissions);
  const assigneeOptions = canAssignOthers
    ? users.filter(user => user.role !== 'Client' && user.department === editForm.department)
    : users.filter(user => user.id === editForm.assignedTo);

  const confirmPendingMutation = async () => {
    setIsSubmitting(true);
    const result = await commitPendingMutation();
    setIsSubmitting(false);
    if (!result.ok) {
      setMutationError(result.error || 'The change is waiting to be saved.');
      return false;
    }
    setMutationError('');
    return true;
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment(task.id, commentText);
    if (await confirmPendingMutation()) setCommentText('');
  };

  const handleAttachmentSave = async (e: React.FormEvent) => {
    e.preventDefault();
    updateTaskAttachment(task.id, attachmentLink, attachmentName);
    await confirmPendingMutation();
  };

  const handleClientReview = async (status: 'Approved' | 'Rejected') => {
    reviewClientApproval(task.id, status, approvalNote);
    if (await confirmPendingMutation()) setApprovalNote('');
  };

  const handleRevisionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    requestRevision(task.id, revisionNote);
    if (await confirmPendingMutation()) setRevisionNote('');
  };

  const handleDetailsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');

    const result = updateTask(task.id, {
      title: editForm.title,
      description: editForm.description,
      clientName: editForm.clientName,
      serviceType: editForm.serviceType,
      department: editForm.department,
      assignedTo: editForm.assignedTo,
      priority: editForm.priority,
      startDate: editForm.startDate,
      dueDate: editForm.dueDate,
      notes: editForm.notes,
    });

    if (!result.ok) {
      setEditError(result.error || 'Unable to update this task.');
      return;
    }

    const saveResult = await commitPendingMutation();
    if (!saveResult.ok) {
      setEditError(saveResult.error || 'The task update is waiting to be saved.');
      return;
    }
    setIsEditingDetails(false);
  };

  const handleDeleteTask = async () => {
    const confirmed = window.confirm(`Delete "${task.title}"? This removes the task from the workspace.`);
    if (!confirmed) return;

    const result = deleteTask(task.id);
    if (!result.ok) {
      setEditError(result.error || 'Unable to delete this task.');
      setIsEditingDetails(true);
      return;
    }

    const saveResult = await commitPendingMutation();
    if (!saveResult.ok) {
      setEditError(saveResult.error || 'The task deletion is waiting to be saved.');
      setIsEditingDetails(true);
      return;
    }
    onClose();
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const getUserAvatar = (id: string) => users.find(u => u.id === id)?.avatar;
  const startDateValue = parseOptionalDate(task.startDate);
  const dueDateValue = parseOptionalDate(task.dueDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl shadow-slate-950/10 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{task.id}</span>
              <span className="text-xs font-medium text-slate-500">{task.clientName}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{task.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {canEditTask && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(value => !value)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> {isEditingDetails ? 'Cancel Edit' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTask}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
            <button onClick={onClose} aria-label="Close task details" title="Close" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {mutationError && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm font-medium text-amber-800" role="alert">
            {mutationError}
          </div>
        )}

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div className="w-full md:w-1/2 p-6 border-r border-slate-100 overflow-y-auto custom-scrollbar bg-white">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Current Status</label>
                  {!canEditTask ? (
                    <span className={`text-sm px-3 py-1 rounded-full font-semibold ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                  ) : (
                    <div className="relative inline-block">
                      <select
                        className={`text-sm pl-3 pr-7 py-1 rounded-full font-semibold outline-none cursor-pointer appearance-none border-none shadow-sm ${getStatusColor(task.status)}`}
                        value={task.status}
                        onChange={async (e) => {
                          updateTaskStatus(task.id, e.target.value as TaskStatus);
                          await confirmPendingMutation();
                        }}
                      >
                        {taskStatuses.map(status => (
                          <option key={status} value={status} className="bg-white text-slate-900">{status}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-80 text-current" />
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                  <span className="text-sm font-bold text-slate-800">{task.priority}</span>
                </div>
              </div>

              {isEditingDetails && (
                <form onSubmit={handleDetailsSave} className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Task Title</label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Client / Brand</label>
                      <input
                        type="text"
                        value={editForm.clientName}
                        onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Service</label>
                      <input
                        type="text"
                        value={editForm.serviceType}
                        onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
                      <div className="relative">
                        <select
                          value={editForm.department}
                          disabled={!canAssignOthers}
                          onChange={(e) => {
                            const nextDepartment = e.target.value as Department;
                            const firstUser = users.find(user => user.role !== 'Client' && user.department === nextDepartment);
                            setEditForm({
                              ...editForm,
                              department: nextDepartment,
                              assignedTo: firstUser?.id || editForm.assignedTo,
                            });
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 appearance-none cursor-pointer"
                        >
                          {DEPARTMENTS.map(department => <option key={department} value={department}>{department}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Assignee</label>
                      <div className="relative">
                        <select
                          value={editForm.assignedTo}
                          disabled={!canAssignOthers}
                          onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 appearance-none cursor-pointer"
                        >
                          {assigneeOptions.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Priority</label>
                      <div className="relative">
                        <select
                          value={editForm.priority}
                          onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Priority })}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 appearance-none cursor-pointer"
                        >
                          {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date <span className="text-red-500">*</span></label>
                      <input
                        type="date"
                        required
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                      <textarea
                        rows={3}
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Internal Notes</label>
                      <textarea
                        rows={2}
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                  {editError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                      {editError}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                      <Save className="h-4 w-4" /> {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Client Approval</label>
                  <span className={`inline-flex text-xs px-2 py-1 rounded-full font-semibold ${
                    task.clientApprovalStatus === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                    task.clientApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {task.clientApprovalStatus}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Revisions</label>
                  <span className="text-sm font-bold text-slate-800">{task.revisionCount}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Recurrence</label>
                  <span className="text-sm font-bold text-slate-800">{task.isRecurring ? (task.recurrenceFrequency || 'Recurring') : 'None'}</span>
                </div>
              </div>

              {isClientTaskViewer && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div>
                      <p className="font-semibold">Your task status and feedback</p>
                      <p className="mt-1 leading-6 text-blue-800">
                        This task is currently <strong>{task.status}</strong>. You can leave feedback anytime in the comments panel.
                        {canClientReview
                          ? ' Approval and revision actions are available below.'
                          : ' Approval actions appear when the task is completed or waiting for your review.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                  {task.description || 'No description provided.'}
                </div>
              </div>

              {task.notes && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Internal Notes</label>
                  <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                    {task.notes}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Assignee</label>
                  <div className="flex items-center gap-2">
                    <img src={assignee?.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-sm font-medium text-slate-800">{assignee?.name}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Created By</label>
                  <span className="text-sm font-medium text-slate-800">{creator?.name || 'Unknown'}</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {startDateValue ? format(startDateValue, 'MMM dd, yyyy') : 'No start date'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Clock className="w-3.5 h-3.5 text-red-400" />
                    {dueDateValue ? format(dueDateValue, 'MMM dd, yyyy') : 'No due date'}
                  </div>
                </div>
              </div>

              {(task.facebookPage || task.website || task.attachmentLink || canEditTask) && (
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-xs font-medium text-slate-500 mb-2">Links & Attachments</label>
                  <div className="space-y-2">
                    {task.facebookPage && (
                      <ExternalTaskLink value={task.facebookPage} label="Facebook Page" />
                    )}
                    {task.website && (
                      <ExternalTaskLink value={task.website} label="Website" />
                    )}
                    {task.attachmentLink && (
                      <ExternalTaskLink value={task.attachmentLink} label={task.attachmentName || 'Task Attachment'} />
                    )}
                  </div>
                  {canEditTask && (
                    <form onSubmit={handleAttachmentSave} className="mt-4 space-y-2">
                      <input
                        type="url"
                        value={attachmentLink}
                        onChange={(e) => setAttachmentLink(e.target.value)}
                        placeholder="Attachment URL"
                        className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={attachmentName}
                          onChange={(e) => setAttachmentName(e.target.value)}
                          placeholder="Attachment label"
                          className="flex-1 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 outline-none shadow-sm"
                        />
                        <button type="submit" className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                          Save
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {canEditTask && (
                <form onSubmit={handleRevisionRequest} className="pt-4 border-t border-slate-100 space-y-2">
                  <label className="block text-xs font-medium text-slate-500">Revision Control</label>
                  <textarea
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    rows={2}
                    placeholder="Optional revision note..."
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 outline-none shadow-sm resize-none"
                  />
                  <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg">
                    <RotateCcw className="w-4 h-4" /> Request Revision
                  </button>
                </form>
              )}

              {canClientReview && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-emerald-950">Ready for your review</label>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">
                      Approve the task or request changes. Add a note if the team needs context.
                    </p>
                  </div>
                  <textarea
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    rows={2}
                    placeholder="Optional approval or revision note..."
                    className="w-full bg-white border border-emerald-200 text-slate-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-3 outline-none shadow-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleClientReview('Approved')} type="button" className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </button>
                    <button onClick={() => handleClientReview('Rejected')} type="button" className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg">
                      <XCircle className="w-4 h-4" /> Request Revision
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-1/2 flex flex-col bg-slate-50">
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
              <MessageSquare className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800">{isClientTaskViewer ? 'Feedback & Updates' : 'Comments & Updates'}</h3>
            </div>

            {task.approvalHistory && task.approvalHistory.length > 0 && (
              <div className="px-4 py-3 bg-white border-b border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <History className="w-3.5 h-3.5" /> Approval History
                </div>
                {task.approvalHistory.slice().reverse().map(event => (
                  <div key={event.id} className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{getUserName(event.userId)}</span> marked {event.status} {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                    {event.note && <div className="mt-1 bg-slate-50 border border-slate-100 rounded-md p-2 text-slate-700">{event.note}</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {(!task.comments || task.comments.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">No comments yet.</p>
                </div>
              ) : (
                task.comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <img src={getUserAvatar(comment.userId)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-800">{getUserName(comment.userId)}</span>
                        <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                      </div>
                      <div className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-200 shadow-sm whitespace-pre-wrap">
                        {comment.text}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {canAddComment ? (
              <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                <form onSubmit={handleAddComment} className="relative">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={isClientTaskViewer ? 'Share feedback for the team...' : 'Write a comment or update...'}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 pr-12 outline-none shadow-sm resize-none"
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="absolute bottom-2.5 right-2.5 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : currentUser?.role === 'Staff' ? (
              <div className="p-4 bg-white border-t border-slate-200 text-sm text-slate-500 shrink-0">
                Only the assigned staff member or an admin can add updates to this task.
              </div>
            ) : currentUser?.role === 'Client' ? (
              <div className="p-4 bg-white border-t border-slate-200 text-sm text-slate-500 shrink-0">
                Feedback is only available for tasks linked to your company with client review access.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsModal;
