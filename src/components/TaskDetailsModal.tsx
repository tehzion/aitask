import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { X, Send, MessageSquare, Paperclip, Clock, Calendar, CheckCircle2, XCircle, RotateCcw, History, Pencil, Trash2, Save, ChevronDown, AlertTriangle } from 'lucide-react';
import { Department, Priority, Task, TaskStatus } from '../types';
import { format, formatDistanceToNow } from 'date-fns';
import { canAssignTasksToOthers, canCommentOnTask, canEditTask as canEditTaskByRole, canReviewTaskAsClient } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { getTodayInputDate, parseOptionalDate, cn } from '../lib/utils';
import { isMemberInDepartment, STAFF_DEPARTMENTS } from '../lib/departments';
import type { SecureCommandType } from '../lib/secureWorkspace';
import ModalShell from './ModalShell';
import { useI18n } from './I18nProvider';
import { ProgressBar } from './ui';
import { fieldLabel, inputBase } from './uiTokens';

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
  const { t } = useI18n();
  const {
    users,
    tasks,
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
  } = useStore(useShallow(state => ({
    users: state.users,
    tasks: state.tasks,
    currentUser: state.currentUser,
    updateTaskStatus: state.updateTaskStatus,
    updateTask: state.updateTask,
    deleteTask: state.deleteTask,
    addComment: state.addComment,
    updateTaskAttachment: state.updateTaskAttachment,
    reviewClientApproval: state.reviewClientApproval,
    requestRevision: state.requestRevision,
    commitPendingMutation: state.commitPendingMutation,
    rolePermissions: state.rolePermissions,
    taskStatuses: state.taskStatuses,
  })));
  const [commentText, setCommentText] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editError, setEditError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();
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
    setAttachmentLink(task?.attachmentLink || '');
    setAttachmentName(task?.attachmentName || '');
    setApprovalNote('');
    setRevisionNote('');
    setEditError('');
    setMutationError('');
    setIsEditingDetails(false);
    setCommentText('');
    setIsSubmitting(false);
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
  const incompletePredecessors = (task.predecessorTaskIds || [])
    .map(id => tasks.find(item => item.id === id))
    .filter((item): item is Task => Boolean(item && !item.isCompleted));
  const assigneeOptions = canAssignOthers
    ? users.filter(user => user.role !== 'Client' && isMemberInDepartment(user, editForm.department))
    : users.filter(user => user.id === editForm.assignedTo);

  const confirmPendingMutation = async (commandType?: SecureCommandType) => {
    setIsSubmitting(true);
    const result = await commitPendingMutation(commandType);
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
    if (!commentText.trim() || isSubmitting) return;
    addComment(task.id, commentText);
    if (await confirmPendingMutation('comment.add')) setCommentText('');
  };

  const handleAttachmentSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (attachmentLink.trim() && !safeHttpsUrl(attachmentLink)) {
      setEditError('Enter a valid https:// link for the attachment.');
      return;
    }
    setEditError('');
    updateTaskAttachment(task.id, attachmentLink, attachmentName);
    await confirmPendingMutation();
  };

  const handleClientReview = async (status: 'Approved' | 'Rejected') => {
    if (isSubmitting) return;
    reviewClientApproval(task.id, status, approvalNote);
    if (await confirmPendingMutation('approval.review')) setApprovalNote('');
  };

  const handleRevisionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    requestRevision(task.id, revisionNote);
    if (await confirmPendingMutation('approval.revision')) setRevisionNote('');
  };

  const handleDetailsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
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

    setIsSubmitting(true);
    const saveResult = await commitPendingMutation();
    setIsSubmitting(false);
    if (!saveResult.ok) {
      setEditError(saveResult.error || 'The task update is waiting to be saved.');
      return;
    }
    setIsEditingDetails(false);
  };

  const handleDeleteTask = async () => {
    const confirmed = window.confirm(t(`Delete "${task.title}"? This removes the task from the workspace.`));
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
  const startDateValue = parseOptionalDate(task.startDate);
  const dueDateValue = parseOptionalDate(task.dueDate);

  return (
    <ModalShell
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onClose}
      panelClassName="max-w-4xl"
    >
        <p id={descriptionId} className="sr-only">Task details, status, dates, links and comments for {task.title}.</p>
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{task.id}</span>
              <span data-i18n-skip className="text-xs font-medium text-slate-500">{task.clientName}</span>
            </div>
            <h2 data-i18n-skip id={titleId} className="break-words text-xl font-semibold text-slate-950">{task.title}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm font-medium text-amber-800" role="alert" aria-live="assertive">
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
                    <span className={`text-sm px-3 py-1 rounded-md font-semibold ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                  ) : (
                    <div className="relative inline-block">
                      <select
                        aria-label="Task status"
                        disabled={isSubmitting}
                        className={`text-sm pl-3 pr-7 py-1 rounded-md font-semibold outline-none cursor-pointer appearance-none border-none shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${getStatusColor(task.status)}`}
                        value={task.status}
                        onChange={async (e) => {
                          if (isSubmitting) return;
                          const nextStatus = e.target.value as TaskStatus;
                          if (incompletePredecessors.length > 0 && nextStatus !== 'Pending' && nextStatus !== 'Cancelled') {
                            const confirmed = window.confirm(t(`This step still has ${incompletePredecessors.length} incomplete predecessor task(s). Start it anyway?`));
                            if (!confirmed) return;
                          }
                          updateTaskStatus(task.id, nextStatus);
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">{isClientTaskViewer ? 'Progress' : 'Priority'}</label>
                  {isClientTaskViewer ? (
                    <div className="flex items-center justify-end gap-2">
                      <ProgressBar className="w-24" label="Task progress" value={task.completionPercentage} max={100} />
                      <span className="text-sm font-bold text-slate-800">{task.completionPercentage}%</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-slate-800">{task.priority}</span>
                  )}
                </div>
              </div>

              {incompletePredecessors.length > 0 && !isClientTaskViewer && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Soft dependency warning</p><p className="mt-1 text-amber-800">This task may start early after confirmation, but the following predecessor step{incompletePredecessors.length === 1 ? '' : 's'} remain incomplete:</p><ul className="mt-2 list-disc space-y-1 pl-5">{incompletePredecessors.map(item => <li key={item.id}>{item.title}</li>)}</ul></div></div>
                </div>
              )}

              {isEditingDetails && (
                <form onSubmit={handleDetailsSave} className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block">
                        <span className={fieldLabel}>Task Title</span>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className={cn(inputBase, 'px-2.5 py-2.5')}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className={fieldLabel}>Client / Brand</span>
                      <input
                        type="text"
                        value={editForm.clientName}
                        disabled={!canAssignOthers}
                        onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Service</span>
                      <input
                        type="text"
                        value={editForm.serviceType}
                        disabled={!canAssignOthers}
                        onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Department</span>
                      <span className="relative block">
                        <select
                          value={editForm.department}
                          disabled={!canAssignOthers}
                          onChange={(e) => {
                            const nextDepartment = e.target.value as Department;
                            const firstUser = users.find(user => user.role !== 'Client' && isMemberInDepartment(user, nextDepartment));
                            setEditForm({
                              ...editForm,
                              department: nextDepartment,
                              assignedTo: firstUser?.id || editForm.assignedTo,
                            });
                          }}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          {STAFF_DEPARTMENTS.map(department => <option key={department} value={department}>{department}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </span>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Assignee</span>
                      <span className="relative block">
                        <select
                          value={editForm.assignedTo}
                          disabled={!canAssignOthers}
                          onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          {canAssignOthers && <option value="">Unassigned</option>}
                          {assigneeOptions.map(user => <option key={user.id} data-i18n-skip value={user.id}>{user.name}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </span>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Priority</span>
                      <span className="relative block">
                        <select
                          value={editForm.priority}
                          onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Priority })}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </span>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Start Date <span className="text-red-500">*</span></span>
                      <input
                        type="date"
                        required
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Due Date</span>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <div className="md:col-span-2">
                      <label className="block">
                        <span className={fieldLabel}>Description</span>
                        <textarea
                          rows={3}
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className={cn(inputBase, 'px-2.5 py-2.5')}
                        />
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block">
                        <span className={fieldLabel}>Internal Notes</span>
                        <textarea
                          rows={2}
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className={cn(inputBase, 'px-2.5 py-2.5')}
                        />
                      </label>
                    </div>
                  </div>
                  {editError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert" aria-live="polite">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Client Approval</label>
                  <span className={`inline-flex text-xs px-2 py-1 rounded-md font-semibold ${
                    task.clientApprovalStatus === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                    task.clientApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {isClientTaskViewer
                      ? task.clientApprovalStatus === 'Approved'
                        ? 'Approved'
                        : task.clientApprovalStatus === 'Rejected'
                          ? 'Changes requested'
                          : 'Not reviewed'
                      : task.clientApprovalStatus}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Revisions</label>
                  <span className="text-sm font-bold text-slate-800">{task.revisionCount}</span>
                </div>
              </div>

              {isClientTaskViewer && (
                <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
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
                  <div className="grid grid-cols-2 gap-3 border-t border-blue-100 pt-3">
                    <div>
                      <p className="text-xs font-medium text-blue-700">Service</p>
                      <p className="mt-1 font-semibold text-blue-950">{task.serviceType}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-blue-700">Assigned contact</p>
                      <p data-i18n-skip className="mt-1 font-semibold text-blue-950">{assignee?.name || 'Agency team'}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Description</label>
                <div data-i18n-skip className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                  {task.description || 'No description provided.'}
                </div>
              </div>

              {!isClientTaskViewer && task.notes && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Internal Notes</label>
                  <div data-i18n-skip className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                    {task.notes}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{isClientTaskViewer ? 'Assigned Contact' : 'Assignee'}</label>
                  <div className="flex items-center gap-2">
                    {assignee?.avatar ? (
                      <img src={assignee.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                        {(assignee?.name || 'A').charAt(0)}
                      </span>
                    )}
                    <span data-i18n-skip className="text-sm font-medium text-slate-800">{assignee?.name || 'Agency team'}</span>
                  </div>
                </div>
                {!isClientTaskViewer && <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Created By</label>
                  <span data-i18n-skip className="text-sm font-medium text-slate-800">{creator?.name || 'Unknown'}</span>
                </div>}
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
                  <label className="block text-xs font-medium text-slate-500 mb-2">{isClientTaskViewer ? 'Deliverables & Links' : 'Links & Attachments'}</label>
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
                  <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg disabled:cursor-not-allowed disabled:opacity-60">
                    <RotateCcw className="w-4 h-4" /> {isSubmitting ? 'Requesting...' : 'Request Revision'}
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
                    <button disabled={isSubmitting} onClick={() => handleClientReview('Approved')} type="button" className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:cursor-not-allowed disabled:opacity-60">
                      <CheckCircle2 className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Approve'}
                    </button>
                    <button disabled={isSubmitting} onClick={() => handleClientReview('Rejected')} type="button" className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:cursor-not-allowed disabled:opacity-60">
                      <XCircle className="w-4 h-4" /> Request changes
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
                    {event.note && <div data-i18n-skip className="mt-1 bg-slate-50 border border-slate-100 rounded-md p-2 text-slate-700">{event.note}</div>}
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
                task.comments.map(comment => {
                  const commentAuthor = users.find(u => u.id === comment.userId);
                  return (
                  <div key={comment.id} className="flex gap-3">
                    {commentAuthor?.avatar ? (
                      <img src={commentAuthor.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" />
                    ) : (
                      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                        {(commentAuthor?.name || '?').charAt(0)}
                      </span>
                    )}
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between mb-1">
                        <span data-i18n-skip className="text-sm font-semibold text-slate-800">{getUserName(comment.userId)}</span>
                        <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                      </div>
                      <div data-i18n-skip className="text-sm text-slate-700 bg-white p-3 rounded-lg border border-slate-200 shadow-sm whitespace-pre-wrap">
                        {comment.text}
                      </div>
                    </div>
                  </div>
                  );
                })
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
                    disabled={!commentText.trim() || isSubmitting}
                    aria-label="Send comment"
                    className="absolute bottom-2.5 right-2.5 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? <span className="text-xs font-semibold">Saving</span> : <Send className="w-4 h-4" />}
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
    </ModalShell>
  );
};

export default TaskDetailsModal;
