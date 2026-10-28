import TaskOutputFiles, { type OutputUploadState } from './TaskOutputFiles';
import { useReviewCoverExpiry } from '../hooks/useReviewCoverExpiry';
import { getLocalizedTaskStatus } from '../lib/localeLabels';
import { acknowledgeActionFeedback, canRetrySave, dismissActionFeedback } from '../lib/actionFeedback';
import SystemMessage from './SystemMessage';
import '../lib/staffWorkflowCopy';
import { getTaskProgress } from '../lib/taskProgress';
import { assignableTaskAssignees, canRequestTaskRevision, eligibleTaskStaff, getTaskAssignmentUnavailableReason, isTaskAssignmentLocked, taskTransitionError } from '../lib/taskWorkflowAccess';
import { getTaskStatusControls } from '../lib/taskStatusControls';
import { getStaffGuidedAction } from '../lib/staffWorkspace';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import type { WorkspaceSessionToken } from '../lib/workspaceSession';
import { useSaveAction } from '../hooks/useSaveAction';
import { useToastStore } from '../store/useToastStore';
import { msg } from '../lib/messages';
import { announceTaskStatusSaved } from '../lib/taskStatusFeedback';
import { getTaskBlockers, getUnavailableTaskDependencyCount } from '../lib/staffWorkspace';
import { getTeamWorkloadSummaries } from '../lib/taskReporting';
import { canApproveInternalReview, getWorkflowStepKind, INTERNAL_REVIEW_PERMISSION_MESSAGE, isWorkflowTaskSatisfied, workflowTransitionError } from '../lib/workflowReview';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useRecoverableForm } from '../hooks/useRecoverableForm';
import { mergeDraft } from '../lib/draftMerge';
import DraftRecoveryNotice from './DraftRecoveryNotice';
import React, { useEffect, useState } from 'react';
import { isPendingMutationResolution, useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { X, Send, MessageSquare, Paperclip, Clock, Calendar, CheckCircle2, XCircle, RotateCcw, History, Pencil, Trash2, Save, ChevronDown, AlertTriangle, UsersRound } from 'lucide-react';
import { Department, Priority, Task, TaskStatus } from '../types';
import { canViewTask, getVisibleTasks, getTaskAccess, canReviewTaskAsClient, isDepartmentScopedUser, isHodUser } from '../lib/access';
import { safeHttpsUrl } from '../lib/security';
import { getTodayInputDate, parseOptionalDate, cn } from '../lib/utils';
import { assignableDepartments } from '../lib/departments';
import type { SecureCommandType } from '../lib/secureWorkspace';
import ClientDeliveryFocus from './ClientDeliveryFocus';
import ModalShell from './ModalShell';
import ConfirmDialog from './ConfirmDialog';
import { useI18n } from './I18nProvider';
import { formatLocalizedDate } from '../lib/i18n';
import { formatLocalizedDistanceToNow } from '../lib/relativeTime';
import { Button, ProgressBar } from './ui';
import { TaskWorkflowSteps } from './TaskCard';
import { fieldLabel, inputBase } from './uiTokens';
import ContextualTutorialLink from './ContextualTutorialLink';
import ActionAvailabilityNotice from './ActionAvailabilityNotice';

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

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => void | Promise<void>;
  tone?: 'danger' | 'primary';
};

const ExternalTaskLink: React.FC<{ value: string; label: string; invalidLabel: string }> = ({ value, label, invalidLabel }) => {
  const href = safeHttpsUrl(value);
  if (!href) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-slate-500" title={value}>
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> {label} {invalidLabel}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </a>
  );
};

const InternalTaskDetailsModal: React.FC<Props> = ({ isOpen: requestedOpen, onClose, task: routedTask }) => {
  const { locale, t } = useI18n();
  const workflow = useStore(useShallow(state => ({ cycles: state.serviceCycles, deliverables: state.deliverables })));
  const {
    users,
    tasks,
    clients,
    projects,
    currentUser,
    updateTaskStatus,
    updateTask,
    updateTaskAssignee,
    overrideTaskAssignee,
    deleteTask,
    addComment,
    updateTaskAttachment,
    reviewClientApproval,
    requestRevision,
    commitPendingMutation,
    retryPendingSave,
    discardMutation,
    rolePermissions,
    taskStatuses,
    backend,
    upgradeRequired,
  } = useStore(useShallow(state => ({
    users: state.users,
    tasks: state.tasks,
    clients: state.clients,
    projects: state.projects,
    currentUser: state.currentUser,
    updateTaskStatus: state.updateTaskStatus,
    updateTask: state.updateTask,
    updateTaskAssignee: state.updateTaskAssignee,
    overrideTaskAssignee: state.overrideTaskAssignee,
    deleteTask: state.deleteTask,
    addComment: state.addComment,
    updateTaskAttachment: state.updateTaskAttachment,
    reviewClientApproval: state.reviewClientApproval,
    requestRevision: state.requestRevision,
    commitPendingMutation: state.commitPendingMutation,
    retryPendingSave: state.retryPendingSave,
    discardMutation: state.discardMutation,
    rolePermissions: state.rolePermissions,
    taskStatuses: state.taskStatuses,
    backend: state.backend,
    upgradeRequired: state.backend.upgradeRequired === true,
  })));
  const [pendingDeletion, setPendingDeletion] = useState<{ task: Task; actorId: string; session: WorkspaceSessionToken } | null>(null);
  const ownedDeletion = pendingDeletion && pendingDeletion.actorId === currentUser?.id && isWorkspaceSessionCurrent(pendingDeletion.session)
    ? pendingDeletion : null;
  const requestedTask = routedTask || ownedDeletion?.task || null;
  const isDeletingTask = Boolean(ownedDeletion && ownedDeletion.task.id === requestedTask?.id);
  const isOpen = requestedOpen || isDeletingTask;
  const { busy: isDeletionSaving, run: runDeletion } = useSaveAction(requestedTask?.id);
  const [commentText, setCommentText] = useState('');
  const pendingComment = React.useRef<{ taskId: string; id: string; text: string } | null>(null);
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editError, setEditError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [isMutationSubmitting, setIsSubmitting] = useState(false);
  const [outputUpload, setOutputUpload] = useState<OutputUploadState>({ busy: false, pending: false });
  const isSubmitting = isMutationSubmitting || isDeletionSaving || outputUpload.busy;
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [delegationAssignee, setDelegationAssignee] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const titleId = React.useId();
  const descriptionId = React.useId();
  const confirmationTitleId = React.useId();
  const completionHintId = React.useId();
  const requestedTaskRef = React.useRef(requestedTask);
  requestedTaskRef.current = requestedTask;
  const requestedTaskId = requestedTask?.id;
  useReviewCoverExpiry(requestedTask?.reviewCover?.expiresAt);
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

  const editBaseline = React.useRef(editForm);
  const attachmentBaseline = React.useRef({ link: '', name: '' });
  const editFormRef = React.useRef(editForm);
  editFormRef.current = editForm;
  const pendingDetails = React.useRef<{ taskId: string; values: typeof editForm; persisted: Task } | null>(null);
  const mutationGeneration = React.useRef(0);
  const ownsPendingMutation = React.useRef(false);
  const actorIdRef = React.useRef(currentUser?.id);
  actorIdRef.current = currentUser?.id;
  useEffect(() => () => { mutationGeneration.current++; dismissActionFeedback(currentUser?.id, `task:${requestedTaskId}`); }, [currentUser?.id, requestedTaskId]);
  const formDirty = Boolean(isOpen && requestedTask && (commentText.trim() || approvalNote.trim() || revisionNote.trim() || isSubmitting || isDeletingTask || outputUpload.pending
    || attachmentLink !== (requestedTask.attachmentLink || '') || attachmentName !== (requestedTask.attachmentName || '')
    || (isEditingDetails && JSON.stringify(editForm) !== JSON.stringify(editBaseline.current))
    || (delegationAssignee && delegationAssignee !== requestedTask.assignedTo)));
  const markPristine = useUnsavedChanges(formDirty);
  const [draftContext, setDraftContext] = useState('');
  const draftReady = draftContext === `${currentUser?.id}:${requestedTaskId}`;
  const recovery = useRecoverableForm(`staff-full-edit:${requestedTaskId || ''}`, {
    comment: commentText, pendingComment: pendingComment.current, details: isEditingDetails ? editForm : undefined,
    baseline: editBaseline.current, attachmentLink, attachmentName, attachmentBaseline: attachmentBaseline.current,
  }, draftReady && formDirty && !isDeletingTask, draftReady && isOpen && Boolean(requestedTask && currentUser?.role !== 'Client'));
  const hadDraft = React.useRef(false);
  useEffect(() => {
    if (!draftReady) { hadDraft.current = false; return; }
    if (formDirty) hadDraft.current = true;
    else if (hadDraft.current) { recovery.clear(); hadDraft.current = false; }
  }, [draftReady, formDirty, recovery]);
  const requestClose = () => {
    if (isSubmitting) return;
    if (ownsPendingMutation.current || isDeletingTask || (outputUpload.pending && backend.hasLocalChanges)) {
      if (!window.confirm(t('Discard pending changes and reload the latest saved workspace?'))) return;
      void resolvePendingMutation('latest', true); return;
    }
    if (formDirty && !window.confirm(t('Discard unsaved changes?'))) return;
    recovery.clear(); markPristine(); onClose();
  };

  useEffect(() => {
    const draftTask = requestedTaskRef.current;
    setAttachmentLink(draftTask?.attachmentLink || '');
    setAttachmentName(draftTask?.attachmentName || '');
    attachmentBaseline.current = { link: draftTask?.attachmentLink || '', name: draftTask?.attachmentName || '' };
    setApprovalNote('');
    setRevisionNote('');
    setEditError('');
    setMutationError('');
    setIsEditingDetails(false);
    setCommentText('');
    pendingComment.current = null;
    pendingDetails.current = null; ownsPendingMutation.current = false;
    setPendingDeletion(null);
    setConfirmation(null);
    mutationGeneration.current++;
    setIsSubmitting(false);
    setDelegationAssignee('');
    setDraftContext(`${currentUser?.id}:${requestedTaskId}`);
    if (draftTask) {
      const initialEdit = {
        title: draftTask.title,
        description: draftTask.description || '',
        clientName: draftTask.clientName,
        serviceType: draftTask.serviceType,
        department: draftTask.department === 'Client' ? 'Designer' : draftTask.department,
        assignedTo: draftTask.assignedTo,
        priority: draftTask.priority,
        startDate: draftTask.startDate || getTodayInputDate(),
        dueDate: draftTask.dueDate,
        notes: draftTask.notes || '',
      };
      editBaseline.current = initialEdit; setEditForm(initialEdit);
    }
  }, [requestedTaskId, currentUser?.id]);

  if (!isOpen || !requestedTask) return null;
  const task = tasks.find(item => item.id === requestedTask.id) || (isDeletingTask ? ownedDeletion?.task : null);
  if (!task) return null;

  const outputLocked = task.status === 'Approved' || task.status === 'Completed';
  const assignee = users.find(u => u.id === task.assignedTo);
  const creator = users.find(u => u.id === task.createdBy);
  const assignedByMember = users.find(u => u.id === task.assignedBy);
  const taskAccess = getTaskAccess(currentUser, task, rolePermissions, { users, clients, projects });
  if (!taskAccess.canView) return null;
  const pendingResolution = isPendingMutationResolution(backend);
  const canEditTask = !isDeletingTask && !upgradeRequired && !pendingResolution && taskAccess.canEdit;
  const canDeleteTask = !isDeletingTask && !upgradeRequired && !pendingResolution && taskAccess.canDelete;
  const canAddComment = !isDeletingTask && !upgradeRequired && !pendingResolution && taskAccess.canComment;
  const canClientReview = !isDeletingTask && !upgradeRequired && !pendingResolution && taskAccess.canView && canReviewTaskAsClient(currentUser, task, rolePermissions);
  const isClientTaskViewer = currentUser?.role === 'Client';
  const taskProgress = getTaskProgress(task, users, isClientTaskViewer);
  const statusOptions = getTaskStatusControls(currentUser, task, taskStatuses, rolePermissions, { users, clients, projects }, { tasks, cycles: workflow.cycles, deliverables: workflow.deliverables });
  const guidedAction = getStaffGuidedAction(task, taskStatuses, currentUser, rolePermissions, { users, clients, projects });
  const guidedActionError = guidedAction.targetStatus
    ? statusOptions.find(option => option.status === guidedAction.targetStatus)?.disabledReason
    : undefined;
  // Reassignment is frozen once work is submitted. HODs can edit execution
  // fields and route work to eligible Staff, but project/company/service and
  // department ownership stay outside their form authority.
  const reassignmentLocked = isTaskAssignmentLocked(task);
  const canEditScope = !isDeletingTask && !upgradeRequired && !pendingResolution && taskAccess.canAssign;
  const isHodTaskEditor = isHodUser(currentUser, rolePermissions);
  const canEditAdministrativeScope = canEditScope && !isHodTaskEditor;
  const canAssignOthers = canEditScope && !reassignmentLocked;
  const canDelegateAssignedTask = Boolean(
    canAssignOthers
    && isDepartmentScopedUser(currentUser, rolePermissions)
    && task.assignedTo === currentUser?.id
  );
  const canOverrideAssignment = Boolean(
    canAssignOthers
    && currentUser?.role === 'Project Manager'
    && task.status !== 'Waiting Approval'
    && task.status !== 'Approved'
    && task.status !== 'Completed'
    && !task.isCompleted
  );
  const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { users, clients, projects });
  const incompletePredecessors = getTaskBlockers(task, visibleTasks);
  const unavailablePredecessorCount = getUnavailableTaskDependencyCount(task, visibleTasks);
  const workflowKind = getWorkflowStepKind(task, workflow.cycles, workflow.deliverables);
  const transitionError = (status: TaskStatus) => workflowTransitionError(task, { ...task, status, isCompleted: status === 'Completed' }, currentUser, visibleTasks, workflow.cycles, workflow.deliverables, rolePermissions, { users, clients, projects });
  // Explain a locked action only to people who would otherwise have it.
  const assignmentUnavailableReason = !isClientTaskViewer && !canAssignOthers && taskAccess.canAssign
    ? getTaskAssignmentUnavailableReason(currentUser, task, rolePermissions, { users, clients, projects })
    : undefined;
  const internalReviewUnavailableReason = !isClientTaskViewer && workflowKind === 'internal_review' && task.status === 'Waiting Approval' && !canApproveInternalReview(currentUser, task, rolePermissions, { users, clients, projects })
    ? transitionError('Approved') || INTERNAL_REVIEW_PERMISSION_MESSAGE
    : undefined;
  const revisionUnavailableReason = !isClientTaskViewer && (currentUser?.role === 'Project Manager' || isHodTaskEditor) && ['Waiting Approval', 'Approved', 'Completed'].includes(task.status) && !canRequestTaskRevision(currentUser, task, rolePermissions, { users, clients, projects })
    ? taskTransitionError(currentUser, task, { ...task, status: 'Revision', isCompleted: false }, rolePermissions, { users, clients, projects })
    : undefined;
  const clientReviewUnavailableReason = isClientTaskViewer && task.visibility !== 'internal' && !canClientReview
    ? 'Client review actions are available when the agency publishes this task for review.'
    : undefined;
  const assigneeOptions = canAssignOthers
    ? (() => {
        const options = assignableTaskAssignees(currentUser, editForm.department, users, rolePermissions);
        const currentAssignee = editForm.assignedTo ? users.find(user => user.id === editForm.assignedTo) : undefined;
        return currentAssignee && !options.some(user => user.id === currentAssignee.id)
          ? [currentAssignee, ...options]
          : options;
      })()
    : users.filter(user => user.id === editForm.assignedTo);
  const taskProject = task.projectId ? projects.find(project => project.id === task.projectId) : undefined;
  const delegationOptions = eligibleTaskStaff(task.department, taskProject, users, rolePermissions)
    .filter(user => user.id !== currentUser?.id);

  const delegationWorkloads = getTeamWorkloadSummaries(visibleTasks, delegationOptions, 'overall');

  const acknowledgeComment = () => {
    const submitted = pendingComment.current;
    if (!submitted || submitted.taskId !== requestedTaskRef.current?.id) return;
    if (useStore.getState().tasks.find(item => item.id === submitted.taskId)?.comments?.some(item => item.id === submitted.id)) {
      setCommentText(current => current === submitted.text ? '' : current);
    }
    pendingComment.current = null;
  };

  const acknowledgeDetails = () => {
    const submitted = pendingDetails.current;
    if (!submitted || submitted.taskId !== requestedTaskRef.current?.id) return;
    const latest = useStore.getState().tasks.find(item => item.id === submitted.taskId);
    const acknowledged = latest && (Object.keys(submitted.values) as (keyof typeof editForm)[])
      .every(key => (latest[key] ?? '') === (submitted.persisted[key] ?? ''));
    if (!acknowledged) {
      pendingDetails.current = null;
      setMutationError(t('The pending task update is no longer available. Review your draft before saving again.'));
      return;
    }
    editBaseline.current = submitted.values;
    if (JSON.stringify(editFormRef.current) === JSON.stringify(submitted.values)) setIsEditingDetails(false);
    pendingDetails.current = null;
    setEditError('');
  };

  const confirmPendingMutation = async (commandType?: SecureCommandType) => {
    const session = captureWorkspaceSession();
    const taskId = task.id;
    const actorId = currentUser?.id;
    const generation = ++mutationGeneration.current;
    const isCurrent = () => isWorkspaceSessionCurrent(session) && requestedTaskRef.current?.id === taskId
      && actorIdRef.current === actorId && generation === mutationGeneration.current;
    setIsSubmitting(true); ownsPendingMutation.current = true;
    try {
      const result = await commitPendingMutation(commandType);
      if (!isCurrent()) return false;
      if (!result.ok) { setMutationError(result.error || 'The change is waiting to be saved.'); return false; }
      acknowledgeActionFeedback(useStore.getState()); ownsPendingMutation.current = false;
      setMutationError('');
      return true;
    } catch (failure) {
      if (isCurrent()) setMutationError(failure instanceof Error ? failure.message : 'The change is waiting to be saved.');
      return false;
    } finally {
      if (isCurrent()) setIsSubmitting(false);
    }
  };

  const resolvePendingMutation = async (action: 'retry' | 'latest', closeAfterDiscard = false) => {
    if (action === 'retry' && !canRetrySave(useStore.getState().backend)) return;
    if (ownedDeletion) {
      const submitted = ownedDeletion;
      const result = await runDeletion(async () => {
        if (action === 'retry') return useStore.getState().backend.mode === 'supabase'
          ? retryPendingSave() : commitPendingMutation();
        await discardMutation();
        const latest = useStore.getState().backend;
        return latest.mode === 'supabase' && latest.status !== 'live'
          ? { ok: false, error: latest.error || 'The change is waiting to be saved.' } : { ok: true };
      });
      if (!result) return;
      if (!result.ok) { setMutationError(result.error || 'The task deletion is waiting to be saved.'); return; }
      if (action === 'retry') {
        if (useStore.getState().tasks.some(item => item.id === submitted.task.id)) {
          setMutationError(t('The task is still available. Restore saved data before deleting it again.'));
          return;
        }
        useToastStore.getState().addToast(msg('task.deleted', { title: submitted.task.title }), 'success');
      }
      setPendingDeletion(null);
      setMutationError('');
      if (closeAfterDiscard || action === 'retry' || !useStore.getState().tasks.some(item => item.id === submitted.task.id)) {
        markPristine(); onClose();
      }
      return;
    }
    const session = captureWorkspaceSession();
    const taskId = task.id;
    const actorId = currentUser?.id;
    const generation = ++mutationGeneration.current;
    const isCurrent = () => isWorkspaceSessionCurrent(session) && requestedTaskRef.current?.id === taskId
      && actorIdRef.current === actorId && generation === mutationGeneration.current;
    setIsSubmitting(true);
    try {
      if (action === 'retry') {
        const result = await retryPendingSave();
        if (!isCurrent()) return;
        setMutationError(result.ok ? '' : result.error || 'The pending change could not be saved yet.');
        if (result.ok) { ownsPendingMutation.current = false; acknowledgeActionFeedback(useStore.getState()); acknowledgeComment(); acknowledgeDetails(); }
      } else {
        await discardMutation();
        if (!isCurrent()) return;
        const latest = useStore.getState().backend;
        if (latest.mode === 'supabase' && latest.status !== 'live') { setMutationError(latest.error || 'The change is waiting to be saved.'); return; }
        pendingComment.current = null;
        pendingDetails.current = null; ownsPendingMutation.current = false;
        setMutationError('');
        if (closeAfterDiscard) { recovery.clear(); markPristine(); onClose(); }
      }
    } catch (failure) {
      if (isCurrent()) setMutationError(failure instanceof Error ? failure.message : 'The change is waiting to be saved.');
    } finally {
      if (isCurrent()) setIsSubmitting(false);
    }
  };

  const handleTaskDelegation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!delegationAssignee || isSubmitting || !canDelegateAssignedTask) return;
    const delegate = delegationOptions.find(user => user.id === delegationAssignee);
    if (!delegate) {
      setMutationError(t('Choose a valid internal assignee.'));
      return;
    }

    const localResult = updateTaskAssignee(task.id, delegationAssignee);
    if (!localResult.ok) {
      setMutationError(String(t(localResult.error || 'Unable to update the task assignee.')));
      return;
    }
    if (await confirmPendingMutation('task.update')) {
      setDelegationAssignee('');
    }
  };

  const handleAssignmentOverride = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!delegationAssignee || !overrideReason.trim() || isSubmitting || !canOverrideAssignment) return;
    const target = delegationOptions.find(user => user.id === delegationAssignee);
    if (!target) {
      setMutationError(t('Choose a valid internal assignee.'));
      return;
    }
    const localResult = overrideTaskAssignee(task.id, target.id, overrideReason);
    if (!localResult.ok) {
      setMutationError(String(t(localResult.error || 'Unable to override the task assignee.')));
      return;
    }
    if (await confirmPendingMutation('task.update')) {
      setDelegationAssignee('');
      setOverrideReason('');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmitting || !canAddComment) return;
    if (pendingComment.current) { await resolvePendingMutation('retry'); return; }
    const submittedText = commentText;
    const localResult = addComment(task.id, submittedText);
    if (!localResult.ok) {
      setMutationError(localResult.error || 'You do not have permission to comment on this task.');
      return;
    }
    if (!localResult.id) return;
    pendingComment.current = { taskId: task.id, id: localResult.id, text: submittedText };
    if (await confirmPendingMutation('comment.add')) acknowledgeComment();
  };

  const handleAttachmentSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (attachmentLink.trim() && !safeHttpsUrl(attachmentLink)) {
      setEditError('Enter a valid https:// link for the attachment.');
      return;
    }
    setEditError('');
    const localResult = updateTaskAttachment(task.id, attachmentLink, attachmentName);
    if (!localResult.ok) {
      setEditError(String(t(localResult.error || 'Unable to update the task attachment.')));
      return;
    }
    const submittedAttachment = { link: safeHttpsUrl(attachmentLink) || '', name: attachmentName.trim() };
    if (await confirmPendingMutation()) attachmentBaseline.current = submittedAttachment;
  };

  const handleClientReview = async (status: 'Approved' | 'Rejected') => {
    if (isSubmitting) return;
    const localResult = reviewClientApproval(task.id, status, approvalNote);
    if (!localResult.ok) {
      setMutationError(String(t(localResult.error || 'Unable to review this task.')));
      return;
    }
    if (await confirmPendingMutation('approval.review')) setApprovalNote('');
  };

  const handleRevisionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const localResult = requestRevision(task.id, revisionNote);
    if (!localResult.ok) {
      setMutationError(String(t(localResult.error || 'Unable to request a revision.')));
      return;
    }
    if (await confirmPendingMutation('approval.revision')) setRevisionNote('');
  };

  const handleStatusAction = async (nextStatus: TaskStatus) => {
    if (isSubmitting || !canEditTask) return;
    if (guidedActionError && nextStatus === guidedAction.targetStatus) {
      setMutationError(String(t(guidedActionError)));
      return;
    }
    if (incompletePredecessors.length > 0 && !['Pending', 'Cancelled'].includes(nextStatus)) {
      setConfirmation({
        title: t('Earlier steps are unfinished'),
        description: t('Unfinished earlier steps: {count}. Change this task to {status}?', { count: incompletePredecessors.length, status: getLocalizedTaskStatus(nextStatus, locale) }),
        confirmLabel: t('Continue'),
        tone: 'primary',
        action: async () => {
          const localResult = updateTaskStatus(task.id, nextStatus);
          if (!localResult.ok) {
            setMutationError(String(t(localResult.error || 'Unable to update the task status.')));
            return;
          }
          if (await confirmPendingMutation('task.update')) announceTaskStatusSaved(nextStatus);
        },
      });
      return;
    }
    const localResult = updateTaskStatus(task.id, nextStatus);
    if (!localResult.ok) {
      setMutationError(String(t(localResult.error || 'Unable to update the task status.')));
      return;
    }
    if (await confirmPendingMutation('task.update')) announceTaskStatusSaved(nextStatus);
  };

  const handleDetailsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (pendingDetails.current) { await resolvePendingMutation('retry'); return; }
    setEditError('');
    const submitted = { ...editForm };
    const result = updateTask(task.id, submitted);
    if (!result.ok) { setEditError(result.error || 'Unable to update this task.'); return; }
    const persisted = useStore.getState().tasks.find(item => item.id === task.id);
    if (!persisted) return;
    pendingDetails.current = { taskId: task.id, values: submitted, persisted };
    if (await confirmPendingMutation('task.update')) acknowledgeDetails();
  };

  const performDeleteTask = async () => {
    if (isSubmitting || isDeletingTask || !currentUser) return;
    const submitted = { task, actorId: currentUser.id, session: captureWorkspaceSession() };
    const saveResult = await runDeletion(async () => {
      setPendingDeletion(submitted);
      const result = deleteTask(task.id);
      if (!result.ok) { setPendingDeletion(null); return result; }
      return commitPendingMutation();
    });
    if (!saveResult) return;
    if (!saveResult.ok) {
      setMutationError(saveResult.error || 'The task deletion is waiting to be saved.');
      return;
    }
    if (useStore.getState().tasks.some(item => item.id === task.id)) {
      setMutationError(t('The task is still available. Restore saved data before deleting it again.'));
      return;
    }
    useToastStore.getState().addToast(msg('task.deleted', { title: task.title }), 'success');
    setPendingDeletion(null);
    markPristine();
    onClose();
  };

  const handleDeleteTask = () => {
    setConfirmation({
      title: 'Delete task',
      description: t(`Delete "${task.title}"? This removes the task from the workspace.`),
      confirmLabel: 'Delete task',
      action: performDeleteTask,
    });
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const startDateValue = parseOptionalDate(task.startDate);
  const dueDateValue = parseOptionalDate(task.dueDate);

  return (
    <ModalShell
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={requestClose}
      panelClassName="max-w-4xl max-sm:max-h-none max-sm:rounded-none"
    >
        <p id={descriptionId} className="sr-only">{t('Task details, status, dates, links and comments for')} <span data-i18n-skip>{task.title}</span>.</p>
        {recovery.storageFailed && <p role="alert" className="px-5 py-3 text-sm text-amber-800">{t('feedback.draftStorageFailed')}</p>}
        {recovery.available && !formDirty && <DraftRecoveryNotice onDiscard={recovery.clear} onRestore={() => {
          const recovered = recovery.draft;
          if (!recovered) return;
          const latest = { title: task.title, description: task.description || '', clientName: task.clientName, serviceType: task.serviceType, department: task.department, assignedTo: task.assignedTo, priority: task.priority, startDate: task.startDate, dueDate: task.dueDate, notes: task.notes || '' };
          let restoredDetails: typeof editForm | undefined;
          let restoredAttachment: { link: string; name: string } | undefined;
          let hasConflicts = false;
          if (recovered.details && recovered.baseline && Object.keys(latest).every(key => typeof recovered.details?.[key as keyof typeof latest] === 'string' && typeof recovered.baseline[key as keyof typeof latest] === 'string')) {
            const merged = mergeDraft(recovered.baseline, recovered.details, latest);
            restoredDetails = merged.value; hasConflicts ||= merged.conflicts.length > 0;
          }
          if (recovered.attachmentBaseline && typeof recovered.attachmentLink === 'string' && typeof recovered.attachmentName === 'string') {
            const merged = mergeDraft(recovered.attachmentBaseline, { link: recovered.attachmentLink, name: recovered.attachmentName }, { link: task.attachmentLink || '', name: task.attachmentName || '' });
            restoredAttachment = merged.value; hasConflicts ||= merged.conflicts.length > 0;
          }
          if (hasConflicts && !window.confirm(t('This recovered draft overlaps newer task changes. Restore your draft values for the conflicting fields?'))) return;
          if (restoredDetails) { editBaseline.current = latest; setEditForm(restoredDetails); setIsEditingDetails(true); }
          if (restoredAttachment) { attachmentBaseline.current = { link: task.attachmentLink || '', name: task.attachmentName || '' }; setAttachmentLink(restoredAttachment.link); setAttachmentName(restoredAttachment.name); }
          const pending = recovered.pendingComment;
          if (typeof recovered.comment === 'string' && !(pending && recovered.comment === pending.text && task.comments?.some(item => item.id === pending.id))) setCommentText(recovered.comment);
          recovery.restore(); recovery.clear();
        }} />}
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
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    if (isEditingDetails && JSON.stringify(editForm) !== JSON.stringify(editBaseline.current) && !window.confirm(t('Discard unsaved changes?'))) return;
                    if (isEditingDetails) setEditForm(editBaseline.current);
                    setIsEditingDetails(value => !value);
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t(isEditingDetails ? 'Cancel Edit' : 'Edit')}
                </button>
            )}
            {canDeleteTask && (
                <button
                  type="button"
                  onClick={handleDeleteTask}
                  disabled={isSubmitting}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('Delete')}
                </button>
            )}
            <button disabled={isSubmitting} onClick={requestClose} aria-label={t('task.closeDetails', { title: task.title })} title={t('common.close')} className="inline-flex h-11 w-11 items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {(mutationError || pendingResolution || isDeletingTask) && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm font-medium text-amber-800" role="alert" aria-live="assertive">
            <p><SystemMessage message={mutationError || t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.')} /></p>
            {(pendingResolution || isDeletingTask) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {canRetrySave(backend) && <button
                  type="button"
                  onClick={() => void resolvePendingMutation('retry')}
                  disabled={isSubmitting || backend.isPulling || backend.isSaving || backend.status === 'offline'}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('Retry my changes')}
                </button>}
                <button
                  type="button"
                  onClick={() => void resolvePendingMutation('latest')}
                  disabled={isSubmitting || backend.isPulling || backend.isSaving || backend.status === 'offline'}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('Restore saved data')}
                </button>
              </div>
            )}
            {(pendingResolution || isDeletingTask) && !canRetrySave(backend) && <p className="mt-2 leading-5">{t('Restore saved data, correct the rejected change or check your access, then save again.')}</p>}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="w-full shrink-0 border-r border-slate-100 bg-white p-4 sm:p-6 md:w-1/2 md:overflow-y-auto md:custom-scrollbar">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('Current Status')}</label>
                  <span className={`inline-flex min-h-11 items-center text-sm px-3 py-1 rounded-md font-semibold ${getStatusColor(task.status)}`}>
                    {currentUser?.role === 'Client' ? t(task.status) : getLocalizedTaskStatus(task.status, locale)}
                  </span>
                </div>
                <div className="text-right">
                  {isClientTaskViewer
                    ? <ProgressBar className="w-32" label={t('Task progress')} value={taskProgress} max={100} />
                    : <span className="block text-xs font-medium text-slate-500">{t('Priority')}: <span className="font-bold text-slate-800">{t(task.priority)}</span></span>}
                </div>
              </div>
              {canEditTask && guidedActionError && <p id={completionHintId} className="text-sm text-muted">{t(guidedActionError)}</p>}
              {assignmentUnavailableReason && <ActionAvailabilityNotice
                title={t('Assignment is unavailable')}
                description={t(assignmentUnavailableReason)}
                tutorialId="change-assigned-staff"
                tutorialLabel={t('Need help changing the assignee?')}
              />}
              {revisionUnavailableReason && <ActionAvailabilityNotice
                title={t('Revision is unavailable')}
                description={t(revisionUnavailableReason)}
                tutorialId="request-task-revision"
                tutorialLabel={t('Need help requesting a revision?')}
              />}
              {clientReviewUnavailableReason && <ActionAvailabilityNotice
                title={t('Client review is not ready')}
                description={t(clientReviewUnavailableReason)}
                tutorialId="review-client-deliverables"
                tutorialLabel={t('How does the approval process work?')}
              />}
              {workflowKind === 'internal_review' && <section data-onboarding-target="task-review" className="mt-4 border-t border-line pt-4 text-sm" aria-label={t('Internal review')}>
                <p className="font-semibold text-ink">{t('Internal review')}</p>
                <p className="mt-1 text-muted">{task.internalReview ? t('Reviewed by {name}', { name: users.find(user => user.id === task.internalReview?.reviewedBy)?.name || t('Team member') }) : t('Waiting for review')}</p>
                {task.status === 'Waiting Approval' && !isWorkflowTaskSatisfied(task, tasks) && canApproveInternalReview(currentUser, task, rolePermissions, { users, clients, projects }) && <button type="button" disabled={isSubmitting || !canEditTask || Boolean(transitionError('Approved'))} onClick={async () => {
                  if (isSubmitting) return;
                  const result = updateTaskStatus(task.id, 'Approved');
                  if (!result.ok) { setMutationError(t(result.error || 'Unable to update the task status.')); return; }
                  if (await confirmPendingMutation('task.update')) announceTaskStatusSaved('Approved');
                }} className="mt-3 min-h-11 rounded-control bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">{t('Approve internal review')}</button>}
                {internalReviewUnavailableReason && <ActionAvailabilityNotice
                  title={t('Approval is unavailable')}
                  description={t(internalReviewUnavailableReason)}
                  tutorialId="approve-work"
                  tutorialLabel={t('How does the approval process work?')}
                />}
              </section>}

              {!isClientTaskViewer && <div className="space-y-3">
                <TaskWorkflowSteps task={task} label={t('Task progress')} progress={taskProgress} />
                {canEditTask && workflowKind !== 'internal_review' && guidedAction.kind === 'advance' && guidedAction.targetStatus && <Button
                  type="button"
                  disabled={isSubmitting || Boolean(guidedActionError)}
                  aria-describedby={guidedActionError ? completionHintId : undefined}
                  onClick={() => void handleStatusAction(guidedAction.targetStatus!)}
                ><CheckCircle2 className="h-4 w-4" />{t(guidedAction.label)}</Button>}
                {canEditTask && guidedAction.kind === 'waiting' && <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-inset px-4 py-2 text-sm font-semibold text-muted">
                  <Clock className="h-4 w-4" />{t(task.status === 'Waiting Approval' ? 'Awaiting Review' : guidedAction.label)}
                </span>}
                {canEditTask && guidedAction.kind === 'terminal' && <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />{t(guidedAction.label)}
                </span>}
                {canEditTask && guidedAction.kind === 'picker' && <div className="flex flex-wrap gap-2" role="group" aria-label={t('Available task actions')}>
                  {statusOptions.filter(option => option.status !== task.status).map(option => <Button
                    key={option.status}
                    type="button"
                    variant="secondary"
                    disabled={isSubmitting || Boolean(option.disabledReason)}
                    title={option.disabledReason ? t(option.disabledReason) : undefined}
                    onClick={() => void handleStatusAction(option.status as TaskStatus)}
                  >{getLocalizedTaskStatus(option.status, locale)}</Button>)}
                </div>}
              </div>}

              {incompletePredecessors.length > 0 && !isClientTaskViewer && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">{t('Earlier steps are unfinished')}</p><p className="mt-1 text-amber-800">{t('Check these earlier steps before starting this task:')}</p><ul className="mt-2 list-disc space-y-1 pl-5">{incompletePredecessors.map(item => <li key={item.id} data-i18n-skip>{item.title}</li>)}</ul></div></div>
                </div>
              )}

              {unavailablePredecessorCount > 0 && !isClientTaskViewer && (
                <section className="rounded-panel border border-line bg-inset p-4 text-sm text-muted" aria-label={t('Dependency status unavailable')}>
                  {task.workflowDependenciesReady === true ? t('Earlier steps are complete; their details are outside your access.') : t(`Dependency status for ${unavailablePredecessorCount} earlier step${unavailablePredecessorCount === 1 ? '' : 's'} is unavailable. Confirm with the task owner before starting.`)}
                </section>
              )}

              {isEditingDetails && !isDeletingTask && (
                <form onSubmit={handleDetailsSave} className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block">
                        <span className={fieldLabel}>{t('Task Title')}</span>
                        <input
                          type="text"
                          readOnly={outputLocked}
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className={cn(inputBase, 'px-2.5 py-2.5')}
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className={fieldLabel}>{t('Client / Brand')}</span>
                      <input
                        type="text"
                        value={editForm.clientName}
                        disabled={!canEditAdministrativeScope}
                        onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>{t('Service')}</span>
                      <input
                        type="text"
                        value={editForm.serviceType}
                        disabled={!canEditAdministrativeScope}
                        onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>{t('Department')}</span>
                      <span className="relative block">
                        <select
                          value={editForm.department}
                          disabled={!canAssignOthers || isHodTaskEditor}
                          onChange={(e) => {
                            const nextDepartment = e.target.value as Department;
                            // Default to a stage-eligible assignee so a Project
                            // Manager switching into an HOD department never lands
                            // on a staff member the dropdown/HOD-first rule forbids.
                            const eligible = assignableTaskAssignees(currentUser, nextDepartment, users, rolePermissions);
                            const keep = eligible.find(user => user.id === editForm.assignedTo);
                            setEditForm({
                              ...editForm,
                              department: nextDepartment,
                              assignedTo: keep?.id || eligible[0]?.id || '',
                            });
                          }}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          {assignableDepartments(currentUser).map(department => <option key={department} value={department}>{t(department)}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </span>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>{t('Assignee')}</span>
                      <span className="relative block">
                        <select
                          value={editForm.assignedTo}
                          disabled={!canAssignOthers}
                          onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          {canAssignOthers && <option value="">{t('Unassigned')}</option>}
                          {assigneeOptions.map(user => <option key={user.id} data-i18n-skip value={user.id}>{user.name}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </span>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>{t('Priority')}</span>
                      <span className="relative block">
                        <select
                          value={editForm.priority}
                          onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Priority })}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          {PRIORITIES.map(priority => <option key={priority} value={priority}>{t(priority)}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </span>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>{t('Start Date')} <span className="text-red-500">*</span></span>
                      <input
                        type="date"
                        required
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>{t('Due Date')}</span>
                      <input
                        type="date"
                        value={editForm.dueDate}
                        onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                        className={cn(inputBase, 'px-2.5 py-2.5')}
                      />
                    </label>
                    <div className="md:col-span-2">
                      <label className="block">
                        <span className={fieldLabel}>{t('Description')}</span>
                        <textarea
                          rows={3}
                          readOnly={outputLocked}
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className={cn(inputBase, 'px-2.5 py-2.5')}
                        />
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block">
                        <span className={fieldLabel}>{t('Internal Notes')}</span>
                        <textarea
                          rows={2}
                          readOnly={task.status === 'Approved'}
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className={cn(inputBase, 'px-2.5 py-2.5')}
                        />
                      </label>
                    </div>
                  </div>
                  {editError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert" aria-live="polite">
                      <SystemMessage message={editError} />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                      <Save className="h-4 w-4" /> {isSubmitting ? t('Saving...') : t('Save Changes')}
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('Client Approval')}</label>
                  <span className={`inline-flex text-xs px-2 py-1 rounded-md font-semibold ${
                    task.clientApprovalStatus === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                    task.clientApprovalStatus === 'Rejected' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {isClientTaskViewer
                      ? task.clientApprovalStatus === 'Approved'
                        ? t('Approved')
                        : task.clientApprovalStatus === 'Rejected'
                          ? t('Changes requested')
                          : t('Not reviewed')
                      : t(task.clientApprovalStatus)}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('Revisions')}</label>
                  <span className="text-sm font-bold text-slate-800">{task.revisionCount}</span>
                </div>
              </div>

              {isClientTaskViewer && (
                <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div>
                      <p className="font-semibold">{t('Your task status and feedback')}</p>
                      <p className="mt-1 leading-6 text-blue-800">
                        {t('This task is currently')} <strong>{currentUser?.role === 'Client' ? t(task.status) : getLocalizedTaskStatus(task.status, locale)}</strong>. {t('You can leave feedback anytime in the comments panel.')}
                        {canClientReview
                          ? ` ${t('Approval and revision actions are available below.')}`
                          : ` ${t('Approval actions appear when the task is completed or waiting for your review.')}`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-blue-100 pt-3">
                    <div>
                      <p className="text-xs font-medium text-blue-700">{t('Service')}</p>
                      <p className="mt-1 font-semibold text-blue-950">{task.serviceType}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-blue-700">{t('Assigned contact')}</p>
                      <p data-i18n-skip className="mt-1 font-semibold text-blue-950">{assignee?.name || 'Agency team'}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('Description')}</label>
                <div data-i18n-skip className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                    {task.description ? <span data-i18n-skip>{task.description}</span> : t('No description provided.')}
                </div>
              </div>

              {!isClientTaskViewer && task.notes && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('Internal Notes')}</label>
                  <div data-i18n-skip className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                    {task.notes}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t(isClientTaskViewer ? 'Assigned Contact' : 'Assignee')}</label>
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
                {!isClientTaskViewer && task.responsibleHodId && <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('Responsible HOD')}</label>
                  <span data-i18n-skip className="text-sm font-medium text-slate-800">{users.find(user => user.id === task.responsibleHodId)?.name || t('Unavailable member')}</span>
                </div>}
                {!isClientTaskViewer && task.assignmentState && <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('Assignment state')}</label>
                  <span className="text-sm font-medium text-slate-800">{t(task.assignmentState === 'pending_hod' ? 'Pending HOD Assignment' : task.assignmentState === 'assigned_staff' ? 'Assigned to Staff' : 'Awaiting HOD')}</span>
                </div>}
                {!isClientTaskViewer && <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('Created By')}</label>
                  <span data-i18n-skip className="text-sm font-medium text-slate-800">{creator?.name || 'Unknown'}</span>
                </div>}
                {!isClientTaskViewer && <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('Assigned by')}</label>
                  <span data-i18n-skip className="text-sm font-medium text-slate-800">{assignedByMember?.name || creator?.name || 'Unknown'}</span>
                </div>}
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('Start Date')}</label>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {startDateValue ? formatLocalizedDate(startDateValue, locale) : t('common.noStartDate')}
                  </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('Due Date')}</label>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <Clock className="w-3.5 h-3.5 text-red-400" />
                    {dueDateValue ? formatLocalizedDate(dueDateValue, locale) : t('common.noDueDate')}
                  </div>
                </div>
              </div>

              {task.generatedFromDeliverable && task.startDate && task.dueDate && task.dueDate < (task.workflowGeneratedAt || '').slice(0, 10) && <p className="rounded-control border border-line bg-inset p-3 text-sm text-muted">{t('Generated late; original deadlines are preserved.')}</p>}

              {canDelegateAssignedTask && (
                <form onSubmit={handleTaskDelegation} data-onboarding-target="task-delegation" className="rounded-lg border border-accent/20 bg-accent-soft p-4 space-y-3" aria-labelledby={`${titleId}-delegation-heading`}>
                  <div className="flex items-start gap-3">
                    <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <h3 id={`${titleId}-delegation-heading`} className="text-sm font-semibold text-ink">{t('Task Delegation')}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted">{t('Assign this task to another team member in your department.')}</p>
                    </div>
                  </div>
                  {delegationOptions.length > 0 ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="relative block min-w-0 flex-1">
                        <span className="sr-only">{t('Choose a team member')}</span>
                        <select
                          aria-label={t('Choose a team member')}
                          value={delegationAssignee}
                          onChange={event => setDelegationAssignee(event.target.value)}
                          disabled={isSubmitting}
                          className={cn(inputBase, 'appearance-none px-2.5 py-2.5 pr-10')}
                        >
                          <option value="">{t('Choose a team member')}</option>
                          {delegationWorkloads.map(({ member, open, overdue }) => <option key={member.id} data-i18n-skip value={member.id}>{member.name} · {open} {t('Active tasks')} · {overdue} {t('Overdue')}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60 text-muted" />
                      </label>
                      <button
                        type="submit"
                        disabled={!delegationAssignee || isSubmitting}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        {isSubmitting ? t('Saving...') : t('Assign Task')}
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs font-medium text-muted">{t('No eligible team members in this department.')}</p>
                  )}
                  <ContextualTutorialLink tutorialId="delegate-task-to-staff" label={t('Need help assigning this task?')} />
                </form>
              )}

              {canOverrideAssignment && (
                <form onSubmit={handleAssignmentOverride} className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3" aria-labelledby={`${titleId}-override-heading`}>
                  <div>
                    <h3 id={`${titleId}-override-heading`} className="text-sm font-semibold text-amber-950">{t('PM assignment override')}</h3>
                    <p className="mt-1 text-xs leading-5 text-amber-900">{t('Use this only when the HOD handoff must be bypassed. A reason is recorded in task history.')}</p>
                  </div>
                  <label className="block text-xs font-medium text-amber-950">
                    {t('Staff member')}
                    <select value={delegationAssignee} onChange={event => setDelegationAssignee(event.target.value)} disabled={isSubmitting} className={cn(inputBase, 'mt-1 appearance-none px-2.5 py-2.5')}>
                      <option value="">{t('Choose a team member')}</option>
                      {delegationOptions.map(member => <option key={member.id} data-i18n-skip value={member.id}>{member.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-amber-950">
                    {t('Override reason')}
                    <textarea value={overrideReason} onChange={event => setOverrideReason(event.target.value)} maxLength={2000} rows={2} disabled={isSubmitting} className={cn(inputBase, 'mt-1 px-2.5 py-2.5')} />
                  </label>
                  <button type="submit" disabled={!delegationAssignee || !overrideReason.trim() || isSubmitting} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">
                    <Send className="h-4 w-4" /> {isSubmitting ? t('Saving...') : t('Override assignment')}
                  </button>
                </form>
              )}

              <div data-onboarding-target="task-output"><TaskOutputFiles task={task} onUploadStateChange={setOutputUpload} /></div>

              {(task.facebookPage || task.website || task.attachmentLink || canEditTask) && (
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-xs font-medium text-slate-500 mb-2">{isClientTaskViewer ? t('Deliverables & Links') : <>{t('Attachments and links')} <span className="font-normal">({t('optional')})</span></>}</label>
                  <div className="space-y-2">
                    {task.facebookPage && (
                      <ExternalTaskLink value={task.facebookPage} label={t('Facebook Page')} invalidLabel={t('(invalid link)')} />
                    )}
                    {task.website && (
                      <ExternalTaskLink value={task.website} label={t('Website')} invalidLabel={t('(invalid link)')} />
                    )}
                    {task.attachmentLink && (
                      <ExternalTaskLink value={task.attachmentLink} label={task.attachmentName || t('Task Attachment')} invalidLabel={t('(invalid link)')} />
                    )}
                  </div>
                  {canEditTask && (
                    <form onSubmit={handleAttachmentSave} className="mt-4 space-y-2">
                      <label htmlFor={`${titleId}-attachment-url`} className={fieldLabel}>{t('Attachment URL')}</label>
                      <input
                        id={`${titleId}-attachment-url`}
                        type="url"
                        readOnly={outputLocked}
                        value={attachmentLink}
                        onChange={(e) => setAttachmentLink(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        aria-describedby={`${titleId}-attachment-help`}
                        className={inputBase}
                      />
                      <p id={`${titleId}-attachment-help`} className="text-xs leading-5 text-muted">{t(outputLocked ? 'Ask the HOD or project manager to return approved work for revision.' : 'Task attachments are shared as secure HTTPS links, not uploaded files.')}</p>
                      <div className="flex gap-2">
                        <label htmlFor={`${titleId}-attachment-label`} className="sr-only">{t('Attachment label')}</label>
                        <input
                          id={`${titleId}-attachment-label`}
                          type="text"
                          readOnly={outputLocked}
                          value={attachmentName}
                          onChange={(e) => setAttachmentName(e.target.value)}
                          placeholder={t('Attachment label')}
                          className={cn(inputBase, 'flex-1')}
                        />
                        <button type="submit" disabled={outputLocked || isSubmitting} className="disabled:opacity-60 inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 focus:ring-offset-canvas">
                          {t('Save')}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {canEditTask && ['Waiting Approval', 'Approved', 'Completed'].includes(task.status) && canRequestTaskRevision(currentUser, task, rolePermissions, { users, clients, projects }) && (
                <form onSubmit={handleRevisionRequest} data-onboarding-target="task-review" className="pt-4 border-t border-slate-100 space-y-2">
                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 [&::-webkit-details-marker]:hidden"><span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>{t('Add a revision note (optional)')}</summary>
                    <label className="mt-1 block">
                      <span className="sr-only">{t('Revision note (optional)')}</span>
                      <textarea
                        value={revisionNote}
                        onChange={(e) => setRevisionNote(e.target.value)}
                        rows={2}
                        className={cn(inputBase, 'resize-none px-3 py-2')}
                      />
                    </label>
                  </details>
                  <Button type="submit" variant="secondary" disabled={isSubmitting}>
                    <RotateCcw className="h-4 w-4" /> {isSubmitting ? t('Requesting...') : t('Request revision')}
                  </Button>
                </form>
              )}

              {canClientReview && (
                <div data-onboarding-target="delivery-review" className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-emerald-950">{t('Ready for your review')}</label>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">{t('Approve the task or request changes. Add a note if the team needs context.')}</p>
                  </div>
                  <textarea
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    rows={2}
                    placeholder={t('Optional approval or revision note...')}
                    className="min-h-11 w-full bg-white border border-emerald-200 text-slate-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-3 outline-none shadow-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button disabled={isSubmitting} onClick={() => handleClientReview('Approved')} type="button" className="min-h-11 flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:cursor-not-allowed disabled:opacity-60">
                      <CheckCircle2 className="w-4 h-4" /> {isSubmitting ? t('Saving...') : t('Approve')}
                    </button>
                    <button disabled={isSubmitting} onClick={() => handleClientReview('Rejected')} type="button" className="min-h-11 flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:cursor-not-allowed disabled:opacity-60">
                      <XCircle className="w-4 h-4" /> {t('Request changes')}
                    </button>
                  </div>
                  <ContextualTutorialLink tutorialId="review-client-deliverables" label={t('How does the approval process work?')} />
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-1/2 flex flex-col bg-slate-50">
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
              <MessageSquare className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800">{t(isClientTaskViewer ? 'Feedback & Updates' : 'Comments & Updates')}</h3>
            </div>

            {task.approvalHistory && task.approvalHistory.length > 0 && (
              <div className="px-4 py-3 bg-white border-b border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 tracking-wide">
                  <History className="w-3.5 h-3.5" /> {t('Approval History')}
                </div>
                {task.approvalHistory.slice().reverse().map(event => (
                  <div key={event.id} className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{getUserName(event.userId)}</span> {t('marked')} {t(event.status)} {formatLocalizedDistanceToNow(new Date(event.createdAt), locale)}
                    {event.note && <div data-i18n-skip className="mt-1 bg-slate-50 border border-slate-100 rounded-md p-2 text-slate-700">{event.note}</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex-none space-y-4 overflow-visible p-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:custom-scrollbar">
              {(!task.comments || task.comments.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-sm">{t('No comments yet.')}</p>
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
                        <span className="text-xs text-slate-400">{formatLocalizedDistanceToNow(new Date(comment.createdAt), locale)}</span>
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
                    placeholder={t(isClientTaskViewer ? 'Share feedback for the team...' : 'Write a comment or update...')}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 pr-12 outline-none shadow-sm resize-none"
                    rows={2}
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || isSubmitting}
                    aria-label={t('Send comment')}
                    className="absolute bottom-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 p-1.5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? <span className="text-xs font-semibold">{t('Saving')}</span> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              </div>
            ) : currentUser?.role === 'Staff' || currentUser?.role === 'HOD' ? (
              <div className="p-4 bg-white border-t border-slate-200 text-sm text-slate-500 shrink-0">
                {t('Only the assigned staff member or a Project Manager can add updates to this task.')}
              </div>
            ) : currentUser?.role === 'Client' ? (
              <div className="p-4 bg-white border-t border-slate-200 text-sm text-slate-500 shrink-0">
                {t('Feedback is only available for tasks linked to your company with client review access.')}
              </div>
            ) : null}
          </div>
        </div>
        {confirmation && (
          <ConfirmDialog
            labelledBy={confirmationTitleId}
            title={confirmation.title}
            description={confirmation.description}
            confirmLabel={confirmation.confirmLabel}
            tone={confirmation.tone}
            busy={isSubmitting}
            onClose={() => setConfirmation(null)}
            onConfirm={async () => {
              const submitted = confirmation;
              await submitted.action();
              setConfirmation(current => current === submitted ? null : current);
            }}
          />
        )}
    </ModalShell>
  );
};

const TaskDetailsModal: React.FC<Props> = props => {
  const { currentUser, tasks, rolePermissions } = useStore(useShallow(state => ({
    currentUser: state.currentUser, tasks: state.tasks, rolePermissions: state.rolePermissions,
  })));
  if (currentUser?.role === 'Client') {
    const task = tasks.find(item => item.id === props.task?.id);
    return <ClientDeliveryFocus task={props.isOpen && task && canViewTask(currentUser, task, rolePermissions) ? task : null} onClose={props.onClose} />;
  }
  return <InternalTaskDetailsModal {...props} />;
};

export default TaskDetailsModal;
