import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { X, Send, MessageSquare, Paperclip, Clock, Calendar, CheckCircle2, XCircle, RotateCcw, History } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { canEditTask as canEditTaskByRole, canReviewTaskAsClient } from '../lib/access';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
}

const statusColors: Record<string, string> = {
  'Pending': 'bg-slate-100 text-slate-705 border border-slate-202',
  'In Progress': 'bg-blue-100 text-blue-705 border border-blue-202',
  'Waiting Approval': 'bg-amber-100 text-amber-705 border border-amber-202',
  'Completed': 'bg-emerald-100 text-emerald-705 border border-emerald-202',
  'Cancelled': 'bg-red-100 text-red-705 border border-red-202',
};

const getStatusColor = (status: string): string => {
  return statusColors[status] || 'bg-stone-100 text-stone-705 border border-[#e8e3db]';
};

const TaskDetailsModal: React.FC<Props> = ({ isOpen, onClose, task }) => {
  const {
    users,
    currentUser,
    updateTaskStatus,
    addComment,
    updateTaskAttachment,
    reviewClientApproval,
    requestRevision,
    rolePermissions,
    taskStatuses,
  } = useStore();
  const [commentText, setCommentText] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [revisionNote, setRevisionNote] = useState('');

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
  }, [task?.id, task?.attachmentLink, task?.attachmentName]);

  if (!isOpen || !task) return null;

  const assignee = users.find(u => u.id === task.assignedTo);
  const creator = users.find(u => u.id === task.createdBy);
  const canEditTask = canEditTaskByRole(currentUser, task, rolePermissions);
  const canClientReview = canReviewTaskAsClient(currentUser, task, rolePermissions);

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment(task.id, commentText);
    setCommentText('');
  };

  const handleAttachmentSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateTaskAttachment(task.id, attachmentLink, attachmentName);
  };

  const handleClientReview = (status: 'Approved' | 'Rejected') => {
    reviewClientApproval(task.id, status, approvalNote);
    setApprovalNote('');
  };

  const handleRevisionRequest = (e: React.FormEvent) => {
    e.preventDefault();
    requestRevision(task.id, revisionNote);
    setRevisionNote('');
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const getUserAvatar = (id: string) => users.find(u => u.id === id)?.avatar;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{task.id}</span>
              <span className="text-xs font-medium text-slate-500">{task.clientName}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{task.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close task details" title="Close" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

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
                    <select
                      className={`text-sm px-3 py-1 rounded-full font-semibold outline-none cursor-pointer border-none shadow-sm ${getStatusColor(task.status)}`}
                      value={task.status}
                      onChange={(e) => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                    >
                      {taskStatuses.map(status => (
                        <option key={status} value={status} className="bg-white text-slate-900">{status}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="text-right">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                  <span className="text-sm font-bold text-slate-800">{task.priority}</span>
                </div>
              </div>

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
                    {format(parseISO(task.startDate), 'MMM dd, yyyy')}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Clock className="w-3.5 h-3.5 text-red-400" />
                    {format(parseISO(task.dueDate), 'MMM dd, yyyy')}
                  </div>
                </div>
              </div>

              {(task.facebookPage || task.website || task.attachmentLink || canEditTask) && (
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-xs font-medium text-slate-500 mb-2">Links & Attachments</label>
                  <div className="space-y-2">
                    {task.facebookPage && (
                      <a href={task.facebookPage} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" /> Facebook Page
                      </a>
                    )}
                    {task.website && (
                      <a href={task.website} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" /> Website
                      </a>
                    )}
                    {task.attachmentLink && (
                      <a href={task.attachmentLink} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" /> {task.attachmentName || 'Task Attachment'}
                      </a>
                    )}
                  </div>
                  {canEditTask && (
                    <form onSubmit={handleAttachmentSave} className="mt-4 space-y-2">
                      <input
                        type="url"
                        value={attachmentLink}
                        onChange={(e) => setAttachmentLink(e.target.value)}
                        placeholder="Attachment URL"
                        className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={attachmentName}
                          onChange={(e) => setAttachmentName(e.target.value)}
                          placeholder="Attachment label"
                          className="flex-1 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none shadow-sm"
                        />
                        <button type="submit" className="px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
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
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none shadow-sm resize-none"
                  />
                  <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg">
                    <RotateCcw className="w-4 h-4" /> Request Revision
                  </button>
                </form>
              )}

              {canClientReview && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <label className="block text-xs font-medium text-slate-500">Client Review</label>
                  <textarea
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    rows={2}
                    placeholder="Optional approval or revision note..."
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3 outline-none shadow-sm resize-none"
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
              <h3 className="font-semibold text-slate-800">Comments & Updates</h3>
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

            {canEditTask ? (
              <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                <form onSubmit={handleAddComment} className="relative">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment or update..."
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-3 pr-12 outline-none shadow-sm resize-none"
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="absolute bottom-2.5 right-2.5 p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : currentUser?.role === 'Staff' ? (
              <div className="p-4 bg-white border-t border-slate-200 text-sm text-slate-500 shrink-0">
                Only the assigned staff member or an admin can add updates to this task.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailsModal;
