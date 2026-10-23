import TaskOutputFiles, { type OutputUploadState } from './TaskOutputFiles';
import { useReviewCoverExpiry } from '../hooks/useReviewCoverExpiry';
import { getLocalizedTaskStatus } from '../lib/localeLabels';
import { acknowledgeActionFeedback, dismissActionFeedback, queueActionFeedback } from '../lib/actionFeedback';
import { msg } from '../lib/messages';
import SystemMessage from './SystemMessage';
import '../lib/staffWorkflowCopy';
import { getTaskProgress } from '../lib/taskProgress';
import { getTaskStatusControls } from '../lib/taskStatusControls';
import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText, History, MessageSquare, Send, UsersRound } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Task, TaskStatus } from '../types';
import { isPendingMutationResolution, useStore } from '../store';
import { getStaffGuidedAction, getTaskBlockers, getUnavailableTaskDependencyCount } from '../lib/staffWorkspace';
import { safeHttpsUrl } from '../lib/security';
import { getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { inputBase } from './uiTokens';
import { Button, ProgressBar, StatusChip } from './ui';
import SideSheet from './SideSheet';
import BackendFreshness from './BackendFreshness';
import { useI18n } from './I18nProvider';
import { formatLocalizedDate } from '../lib/i18n';
import { formatLocalizedDistanceToNow } from '../lib/relativeTime';
import { getVisibleTasks, getTaskAccess } from '../lib/access';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ConfirmDialog from './ConfirmDialog';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useRecoverableForm } from '../hooks/useRecoverableForm';
import DraftRecoveryNotice from './DraftRecoveryNotice';
import { hasTaskEvidence, isTaskLinkedToDeliverable, taskWorkContactId, type TaskWorkIntent } from '../lib/staffWorkflow';
import { isTaskOpen } from '../lib/taskReporting';
import { canApproveInternalReview, getWorkflowStepKind, INTERNAL_REVIEW_PERMISSION_MESSAGE, isWorkflowTaskSatisfied, workflowTransitionError } from '../lib/workflowReview';

interface StaffTaskFocusProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onOpenFullEditor?: () => void;
}

const StaffTaskFocusContent: React.FC<StaffTaskFocusProps> = ({ isOpen, task, onClose, onOpenFullEditor }) => {
  const { locale, t } = useI18n();
  const {
    tasks,
    clients,
    projects,
    users,
    currentUser,
    deliverables,
    serviceCycles,
    taskStatuses,
    backend,
    updateTaskStatus,
    updateTaskWork,
    addComment,
    commitPendingMutation,
    rolePermissions,
  } = useStore(useShallow(state => ({
    tasks: state.tasks,
    clients: state.clients,
    projects: state.projects,
    users: state.users,
    currentUser: state.currentUser,
    deliverables: state.deliverables,
    serviceCycles: state.serviceCycles,
    taskStatuses: state.taskStatuses,
    backend: state.backend,
    updateTaskStatus: state.updateTaskStatus,
    updateTaskWork: state.updateTaskWork,
    addComment: state.addComment,
    commitPendingMutation: state.commitPendingMutation,
    rolePermissions: state.rolePermissions,
  })));
  const [comment, setComment] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [outputUpload, setOutputUpload] = React.useState<OutputUploadState>({ busy: false, pending: false });
  const [error, setError] = React.useState('');
  const [pendingStatus, setPendingStatus] = React.useState<TaskStatus | null>(null);
  const [pendingSave, setPendingSave] = React.useState<{ taskId: string; commentId?: string; text?: string; status?: TaskStatus; workIntent?: TaskWorkIntent; reviewUpdate?: boolean; failed?: boolean; rejected?: boolean } | null>(null);
  const [helpReason, setHelpReason] = React.useState('');
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [helpMode, setHelpMode] = React.useState<'help' | 'review'>('help');
  const commentRef = React.useRef(comment); commentRef.current = comment;
  const helpRef = React.useRef(helpReason); helpRef.current = helpReason;
  const recovery = useRecoverableForm(`staff-task:${task?.id || ''}`, { text: comment, helpReason, helpMode, pendingCommentId: pendingSave?.commentId, pendingText: pendingSave?.text }, Boolean(comment.trim() || helpReason.trim()), isOpen && Boolean(task && currentUser));
  const [exitAction, setExitAction] = React.useState<(() => void) | null>(null);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
  const discardTitleId = React.useId();
  const completionHintId = React.useId();
  const currentTaskId = React.useRef(task?.id);
  currentTaskId.current = task?.id;
  const pendingSaveRef = React.useRef(pendingSave);
  pendingSaveRef.current = pendingSave;
  const observedResolution = React.useRef(false);
  const operationGeneration = React.useRef(0);
  const clearUnsaved = useUnsavedChanges(isOpen && Boolean(comment.trim() || helpReason.trim() || isSaving || pendingSave || outputUpload.busy || outputUpload.pending));
  const liveTask = task ? tasks.find(item => item.id === task.id) || null : null;
  useReviewCoverExpiry(liveTask?.reviewCover?.expiresAt);

  React.useEffect(() => {
    setComment('');
    setError('');
    setIsSaving(false);
    setPendingStatus(null);
    setPendingSave(null);
    setExitAction(null);
    setIsDiscarding(false);
    setHelpReason(''); setHelpOpen(false); setHelpMode('help');
    operationGeneration.current++;
  }, [task?.id, currentUser?.id]);
  React.useEffect(() => () => { operationGeneration.current++; dismissActionFeedback(currentUser?.id, `task:${task?.id}`); }, [currentUser?.id, task?.id]);

  const finishSave = React.useCallback((submitted: NonNullable<typeof pendingSave>) => {
    if (currentTaskId.current !== submitted.taskId) return;
    if (submitted.reviewUpdate && helpRef.current === submitted.text) { setHelpReason(''); setHelpOpen(false); recovery.clear(); }
    if (submitted.text !== undefined && !submitted.reviewUpdate) setComment(current => current === submitted.text ? '' : current);
    if (submitted.workIntent?.kind === 'block' && helpRef.current === submitted.workIntent.reason) { setHelpReason(''); setHelpOpen(false); }
    if ((submitted.reviewUpdate || submitted.text === undefined || commentRef.current === submitted.text) && (!helpRef.current.trim() || helpRef.current === submitted.workIntent?.reason)) recovery.clear();
    acknowledgeActionFeedback(useStore.getState());
    setPendingSave(null);
    setError('');
    observedResolution.current = false;
  }, [recovery]);

  React.useEffect(() => {
    if (!pendingSave?.failed || isSaving) return;
    if (isPendingMutationResolution(backend)) { observedResolution.current = true; return; }
    if (!observedResolution.current || backend.status !== 'live' || backend.hasLocalChanges || backend.pendingMutations || backend.isSaving || backend.isPulling) return;
    const savedTask = tasks.find(item => item.id === pendingSave.taskId);
    const acknowledged = pendingSave.workIntent
      ? workIntentApplied(savedTask, pendingSave.workIntent, currentUser?.id)
      : pendingSave.commentId
      ? savedTask?.comments?.some(item => item.id === pendingSave.commentId)
      : savedTask?.status === pendingSave.status;
    if (acknowledged) finishSave(pendingSave);
    else { setPendingSave(null); setError(t('The pending update was not saved. Review your draft before sending it again.')); observedResolution.current = false; }
  }, [backend, currentUser?.id, finishSave, isSaving, pendingSave, tasks, t]);

  if (!liveTask) return null;

  const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { users, clients, projects });
  const incompletePredecessors = getTaskBlockers(liveTask, visibleTasks);
  const unavailablePredecessorCount = getUnavailableTaskDependencyCount(liveTask, visibleTasks);
  const guidedAction = getStaffGuidedAction(liveTask, taskStatuses, currentUser, rolePermissions, { users, clients, projects });
  const statusOptions = getTaskStatusControls(currentUser, liveTask, taskStatuses, rolePermissions, { users, clients, projects }, { tasks, cycles: serviceCycles, deliverables });
  const guidedActionError = statusOptions.find(option => option.status === guidedAction.targetStatus)?.disabledReason;
  const taskProgress = getTaskProgress(liveTask, users);
  const workflowKind = getWorkflowStepKind(liveTask, serviceCycles, deliverables);
  const transitionError = (status: TaskStatus) => workflowTransitionError(liveTask, { ...liveTask, status, isCompleted: status === 'Completed' }, currentUser, visibleTasks, serviceCycles, deliverables, rolePermissions, { users, clients, projects });
  const reviewAction = workflowKind === 'internal_review' && liveTask.status === 'Waiting Approval' && canApproveInternalReview(currentUser, liveTask, rolePermissions, { users, clients, projects }) && !isWorkflowTaskSatisfied(liveTask, tasks);
  const deliverable = deliverables.find(item => item.id === liveTask.deliverableId);
  const cycle = serviceCycles.find(item => item.id === liveTask.serviceCycleId);
  const dueDate = parseOptionalDate(liveTask.dueDate);
  const attachment = safeHttpsUrl(liveTask.attachmentLink);
  const pendingResolution = isPendingMutationResolution(backend);
  const mutationLocked = backend.upgradeRequired === true || pendingResolution || backend.isSaving || backend.isPulling || outputUpload.busy;
  const taskAccess = getTaskAccess(currentUser, liveTask, rolePermissions, { users, clients, projects });
  if (!taskAccess.canView) return null;
  const canEdit = taskAccess.canEdit;
  const canComment = taskAccess.canComment;
  const contact = users.find(member => member.id === taskWorkContactId(liveTask));
  const linkedOutput = isTaskLinkedToDeliverable(liveTask, deliverables);
  const evidenceAvailable = hasTaskEvidence(liveTask, deliverables, tasks);

  const performSave = async (submitted: NonNullable<typeof pendingSave>, retry = false) => {
    const session = captureWorkspaceSession();
    const generation = ++operationGeneration.current;
    const isCurrent = () => isWorkspaceSessionCurrent(session) && generation === operationGeneration.current && currentTaskId.current === submitted.taskId;
    setIsSaving(true);
    setError('');
    setPendingSave(submitted);
    try {
      const result = retry ? await useStore.getState().retryPendingSave() : await commitPendingMutation(submitted.commentId ? 'comment.add' : 'task.update');
      if (!isCurrent()) return;
      const saved = useStore.getState().tasks.find(item => item.id === submitted.taskId);
      const applied = saved && (submitted.workIntent ? workIntentApplied(saved, submitted.workIntent, currentUser?.id)
        : submitted.commentId ? saved.comments?.some(item => item.id === submitted.commentId) : saved.status === submitted.status);
      if (result.ok && applied) finishSave(submitted);
      else {
        setPendingSave({ ...submitted, failed: true, rejected: ['FORBIDDEN', 'VALIDATION', 'NOT_FOUND'].includes(result.code || useStore.getState().backend.errorCode || '') });
        observedResolution.current = isPendingMutationResolution(useStore.getState().backend);
        setError(result.error || 'This update is waiting to sync. Use the workspace retry controls to continue.');
      }
    } catch (failure) {
      if (isCurrent()) {
        setPendingSave({ ...submitted, failed: true });
        setError(failure instanceof Error ? failure.message : t('The change is waiting to be saved.'));
      }
    } finally {
      if (isCurrent()) setIsSaving(false);
    }
  };

  const requestExit = (action: () => void) => {
    if (isSaving || outputUpload.busy) return;
    if (comment.trim() || helpReason.trim() || pendingSave || outputUpload.pending) setExitAction(() => action);
    else { clearUnsaved(); action(); }
  };

  const confirmExit = async () => {
    if (!exitAction || isDiscarding || outputUpload.busy) return;
    const session = captureWorkspaceSession();
    const taskId = liveTask.id;
    setIsDiscarding(true);
    try {
      if (pendingSave || (outputUpload.pending && useStore.getState().backend.hasLocalChanges)) {
        await useStore.getState().discardMutation();
        const current = useStore.getState().backend;
        if (current.mode === 'supabase' && current.status !== 'live') throw new Error(current.error || t('The change is waiting to be saved.'));
      }
      if (!isWorkspaceSessionCurrent(session) || currentTaskId.current !== taskId) return;
      operationGeneration.current++;
      setComment(''); setPendingSave(null); setError('');
      setHelpReason(''); recovery.clear();
      observedResolution.current = false;
      clearUnsaved();
      exitAction();
      setExitAction(null);
    } catch (failure) {
      if (currentTaskId.current === taskId) { setError(failure instanceof Error ? failure.message : t('The change is waiting to be saved.')); setExitAction(null); }
    } finally {
      if (currentTaskId.current === taskId) setIsDiscarding(false);
    }
  };

  const persistStatus = async (status: TaskStatus, skipDependencyPrompt = false) => {
    if (isSaving || pendingSave || mutationLocked || !canEdit || (status === liveTask.status && !reviewAction)) return;
    const gateError = transitionError(status);
    if (gateError) { setError(t(gateError)); return; }
    if (!skipDependencyPrompt && incompletePredecessors.length > 0 && !['Pending', 'Cancelled'].includes(status)) { setPendingStatus(status); return; }
    const localResult = updateTaskStatus(liveTask.id, status);
    if (!localResult.ok) { setError(String(t(localResult.error || 'Unable to update the task status.'))); return; }
    await performSave({ taskId: liveTask.id, status });
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pendingSave?.failed) { await performSave(pendingSave, true); return; }
    if (!comment.trim() || mutationLocked || !canComment || isSaving || pendingSave) return;
    const text = comment;
    const localResult = addComment(liveTask.id, text);
    if (!localResult.ok || !localResult.id) { setError(localResult.error || t('You do not have permission to comment on this task.')); return; }
    await performSave({ taskId: liveTask.id, commentId: localResult.id, text });
  };

  const saveWork = async (intent: TaskWorkIntent) => {
    if (isSaving || pendingSave || mutationLocked || !canEdit) return;
    const result = updateTaskWork(liveTask.id, intent);
    if (!result.ok) { setError(t(result.error || 'Unable to update the task status.')); return; }
    await performSave({ taskId: liveTask.id, workIntent: intent });
  };

  const submitHelp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (helpMode === 'help') { await saveWork({ kind: 'block', reason: helpReason }); return; }
    if (!helpReason.trim() || isSaving || pendingSave || mutationLocked || !canComment || !currentUser) return;
    const text = helpReason;
    const result = addComment(liveTask.id, text);
    if (!result.ok || !result.id) { setError(result.error || 'Unable to add the comment.'); return; }
    const commentId = result.id;
    queueActionFeedback(currentUser.id, `task:${liveTask.id}:comment:${commentId}`, msg('feedback.reviewUpdateRequested'), saved => saved.tasks.some(item => item.id === liveTask.id && item.comments?.some(comment => comment.id === commentId)));
    await performSave({ taskId: liveTask.id, commentId, text, reviewUpdate: true });
  };

  const footer = canEdit ? (
    <div className="space-y-2">
      {guidedActionError && <p id={completionHintId} className="text-sm text-muted">{t(guidedActionError)}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {canEdit && onOpenFullEditor && <Button variant="secondary" disabled={isSaving || outputUpload.busy || Boolean(pendingSave)} onClick={() => requestExit(onOpenFullEditor)}>{t('Full edit')}</Button>}
        {reviewAction ? <Button
          className="sm:min-w-44"
          disabled={mutationLocked || !canEdit || isSaving || Boolean(pendingSave) || Boolean(transitionError('Approved')) || pendingStatus !== null}
          onClick={() => void persistStatus('Approved')}
        >
          <CheckCircle2 className="h-4 w-4" />{isSaving ? t('Saving…') : t('Approve internal review')}
        </Button> : guidedAction.kind === 'advance' && guidedAction.targetStatus ? <Button
          className="sm:min-w-44"
          disabled={mutationLocked || !canEdit || isSaving || Boolean(pendingSave) || guidedAction.disabled || Boolean(guidedActionError) || pendingStatus !== null}
          aria-describedby={guidedActionError ? completionHintId : undefined}
          onClick={() => void persistStatus(guidedAction.targetStatus!)}
        >
          <CheckCircle2 className="h-4 w-4" />{isSaving ? t('Saving…') : t(guidedAction.label)}
        </Button> : guidedAction.kind === 'waiting' ? <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-inset px-4 py-2 text-sm font-semibold text-muted">
          <Clock3 className="h-4 w-4" />{t(liveTask.status === 'Waiting Approval' ? 'Awaiting Review' : guidedAction.label)}
        </span> : guidedAction.kind === 'terminal' ? <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />{t(guidedAction.label)}
        </span> : guidedAction.kind === 'picker' ? <div className="flex flex-wrap gap-2" role="group" aria-label={t('Available task actions')}>
          {statusOptions.filter(option => option.status !== liveTask.status).map(option => <Button
            key={option.status}
            variant="secondary"
            disabled={mutationLocked || !canEdit || isSaving || Boolean(pendingSave) || Boolean(option.disabledReason) || pendingStatus !== null}
            title={option.disabledReason ? t(option.disabledReason) : undefined}
            onClick={() => void persistStatus(option.status as TaskStatus)}
          >{getLocalizedTaskStatus(option.status, locale)}</Button>)}
        </div> : null}
      </div>
    </div>
  ) : null;

  return (
    <>
    <SideSheet
      isOpen={isOpen}
      onClose={() => requestExit(onClose)}
      closeDisabled={isSaving || isDiscarding || outputUpload.busy}
      title={liveTask.title}
      description={`${liveTask.clientName} · ${liveTask.serviceType}`}
      titleIsUserContent
      descriptionIsUserContent
      className="w-full sm:max-w-xl"
      footer={footer}
    >
      <div className="space-y-6 pb-2">
        {!canEdit && <p role="status" className="text-sm text-muted">{t('You can view this task, but your account cannot edit it.')}</p>}
        {recovery.storageFailed && <p role="alert" className="text-sm text-amber-800">{t('feedback.draftStorageFailed')}</p>}
        {(backend.isSaving || backend.isPulling) && !isSaving && <p role="status" className="text-sm text-muted">{t('feedback.savingLocked')}</p>}
        {backend.upgradeRequired && <p role="status" className="text-sm text-muted">{t('errors.workspaceUpgrade')}</p>}
        {recovery.available && !comment.trim() && !helpReason.trim() && <DraftRecoveryNotice onRestore={() => {
          const recovered = recovery.restore();
          if (!recovered) return;
          const alreadyPresent = recovered.text === recovered.pendingText && recovered.pendingCommentId && liveTask.comments?.some(item => item.id === recovered.pendingCommentId);
          if (alreadyPresent) setError(t('This recovered update already appears in the task. Check save confirmation before sending it again.'));
          else if (typeof recovered.text === 'string') setComment(recovered.text);
          if (typeof recovered.helpReason === 'string') { setHelpReason(recovered.helpReason); setHelpOpen(Boolean(recovered.helpReason)); setHelpMode(recovered.helpMode === 'review' ? 'review' : 'help'); }
          recovery.clear();
        }} onDiscard={recovery.clear} />}
        {pendingStatus && (
          <section role="alertdialog" aria-labelledby="staff-dependency-confirm-title" aria-describedby="staff-dependency-confirm-description" className="rounded-panel border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm dark:bg-[#31240f] dark:text-[#fff2c2] dark:ring-1 dark:ring-[#765d22]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="staff-dependency-confirm-title" className="font-semibold">{t('Earlier steps are unfinished')}</h3>
                <p id="staff-dependency-confirm-description" className="mt-1 text-sm leading-6">{t('Unfinished earlier steps: {count}. Change this task to {status}?', { count: incompletePredecessors.length, status: getLocalizedTaskStatus(pendingStatus, locale) })}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => setPendingStatus(null)}>{t('common.cancel')}</Button>
                  <Button type="button" onClick={() => { const nextStatus = pendingStatus; setPendingStatus(null); void persistStatus(nextStatus, true); }}>{t('Continue')}</Button>
                </div>
              </div>
            </div>
          </section>
        )}
        {(error || pendingResolution) && (
          <div role="alert" aria-live="assertive" className="rounded-control bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
            <p><SystemMessage message={error || t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.')} /></p>
            {pendingResolution && <BackendFreshness compact className="mt-3" onRetry={async () => { const submitted = pendingSaveRef.current; if (submitted && !isSaving) await performSave(submitted, true); else await useStore.getState().retryPendingSave(); }} onDiscard={pendingSave ? () => requestExit(() => undefined) : undefined} />}
            {pendingSave?.failed && !pendingSave.rejected && !pendingResolution && <Button variant="secondary" className="mt-3" disabled={isSaving} onClick={() => void performSave(pendingSave, true)}>{t('Retry save')}</Button>}
          </div>
        )}

        <section aria-labelledby="staff-task-state" className="calm-raised p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p id="staff-task-state" className="calm-eyebrow">{t('Status')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip tone={liveTask.status === 'Waiting Approval' ? 'amber' : liveTask.isCompleted ? 'emerald' : 'blue'}>{getLocalizedTaskStatus(liveTask.status, locale)}</StatusChip>
                <span className="text-xs font-semibold text-muted">{t(liveTask.priority)} {t('priority')}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="calm-number text-2xl font-semibold text-ink">{taskProgress}%</p>
              <p className="text-xs text-muted">{t('progress')}</p>
            </div>
          </div>
          <ProgressBar className="mt-4" label={t('Task progress')} value={taskProgress} />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{getRelativeDueDateString(liveTask.dueDate, liveTask.isCompleted, liveTask.status, locale)}</span>
            {liveTask.revisionCount > 0 && <span className="text-amber-700">{t('Revision')} {liveTask.revisionCount}</span>}
          </div>
        </section>

        {incompletePredecessors.length > 0 && (
          <section className="rounded-panel bg-amber-50 p-4 text-[#6b3f00] ring-1 ring-amber-200 dark:bg-[#31240f] dark:text-[#fff2c2] dark:ring-[#765d22]" aria-labelledby="staff-task-blockers">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><h3 id="staff-task-blockers" className="font-semibold">{t('Earlier workflow steps')}</h3><p className="mt-1 text-sm leading-6">{t('These earlier workflow steps are unfinished.')}</p><ul className="mt-2 space-y-1 text-sm">{incompletePredecessors.map(item => <li key={item.id}><span aria-hidden="true">• </span><span data-i18n-skip>{item.title}</span></li>)}</ul></div>
            </div>
          </section>
        )}
        {unavailablePredecessorCount > 0 && (
          <section className="rounded-panel bg-slate-50 p-4 text-sm text-muted ring-1 ring-line" aria-label={t('Dependency status unavailable')}>
            {liveTask.workflowDependenciesReady === true ? t('Earlier steps are complete; their details are outside your access.') : t(`Dependency status for ${unavailablePredecessorCount} earlier step${unavailablePredecessorCount === 1 ? '' : 's'} is unavailable. Confirm with the task owner before starting.`)}
          </section>
        )}

        {workflowKind === 'internal_review' && <section className="border-b border-line pb-4 text-sm" aria-label={t('Internal review')}>
          <p className="font-semibold text-ink">{t('Internal review')}</p>
          <p className="mt-1 text-muted">{liveTask.internalReview ? t('Reviewed by {name}', { name: users.find(user => user.id === liveTask.internalReview?.reviewedBy)?.name || t('Team member') }) : t('Waiting for review')}</p>
          {!liveTask.internalReview && !canApproveInternalReview(currentUser, liveTask, rolePermissions, { users, clients, projects }) && <p className="mt-2 text-muted">{t(transitionError('Approved') || INTERNAL_REVIEW_PERMISSION_MESSAGE)}</p>}
        </section>}
        <section aria-labelledby="staff-task-brief">
          <h3 id="staff-task-brief" className="flex items-center gap-2 font-semibold text-ink"><FileText className="h-4 w-4 text-accent" />{t('Brief')}</h3>
          <div className="mt-3 rounded-panel bg-inset p-4 text-sm leading-6 text-ink">
            <p className="whitespace-pre-wrap">{liveTask.description ? <span data-i18n-skip>{liveTask.description}</span> : t('No task brief has been added.')}</p>
            {liveTask.notes && <p data-i18n-skip className="mt-3 border-t border-line pt-3 text-muted">{liveTask.notes}</p>}
          </div>
        </section>

        <section aria-labelledby="staff-work-ownership" className="rounded-panel bg-inset p-4 text-sm">
          <h3 id="staff-work-ownership" className="font-semibold text-ink">{t('Work ownership')}</h3>
          {pendingSave?.workIntent && <p className="mt-2 text-muted" role="status">{t('Awaiting save confirmation')}</p>}
          <p className="mt-2 text-muted">{t('Assigned')}: <span data-i18n-skip>{users.find(member => member.id === liveTask.assignedTo)?.name || t('Unassigned')}</span></p>
          <p className="mt-1 text-muted">{t('Task contact')}: <span data-i18n-skip>{contact?.name || t('No task contact is recorded. Confirm with your team lead.')}</span></p>
          {liveTask.workState?.acceptedBy === liveTask.assignedTo ? <p className="mt-2 text-ink">{t('Assignment accepted')}{liveTask.workState.acceptedAt && <> · {formatLocalizedDistanceToNow(new Date(liveTask.workState.acceptedAt), locale)}</>}</p>
            : isTaskOpen(liveTask) && <p className="mt-2 text-muted">{t('Assignment acceptance is not recorded.')}</p>}
          {liveTask.status === 'Waiting Approval' && <div className="mt-3 border-t border-line pt-3">
            <p className="font-medium text-ink">{t('Waiting for review')}</p>
            <p className="mt-1 text-muted">{liveTask.workState?.reviewRequestedAt ? <>{t('Sent for review')} · {formatLocalizedDistanceToNow(new Date(liveTask.workState.reviewRequestedAt), locale)}</> : t('Review submission time is not recorded.')}</p>
            <p className="mt-1 text-muted">{t('Ask the task contact for a review update. Completion and client approval are tracked separately.')}</p>
          </div>}
          {liveTask.workState?.blocker && <div className="mt-3 border-t border-line pt-3" role="status"><p className="font-semibold text-ink">{t('Help requested')}</p><p data-i18n-skip className="mt-1 whitespace-pre-wrap text-ink">{liveTask.workState.blocker.reason}</p><p className="mt-1 text-muted">{formatLocalizedDistanceToNow(new Date(liveTask.workState.blocker.openedAt), locale)}</p></div>}
          {canEdit && isTaskOpen(liveTask) && <div className="mt-3 flex flex-wrap gap-2">
            {liveTask.assignedTo === currentUser?.id && liveTask.workState?.acceptedBy !== currentUser.id && <Button variant="secondary" disabled={isSaving || Boolean(pendingSave) || mutationLocked} onClick={() => void saveWork({ kind: 'accept' })}>{t('Accept assignment')}</Button>}
            <Button variant="secondary" disabled={isSaving || Boolean(pendingSave) || mutationLocked} onClick={() => { setHelpMode(liveTask.status === 'Waiting Approval' ? 'review' : 'help'); setHelpOpen(true); }}>{t(liveTask.status === 'Waiting Approval' ? 'Request review update' : 'Request help or handover')}</Button>
            {liveTask.workState?.blocker && <Button variant="secondary" disabled={isSaving || Boolean(pendingSave) || mutationLocked} onClick={() => void saveWork({ kind: 'unblock' })}>{t('Clear blocker')}</Button>}
          </div>}
          {helpOpen && canEdit && <form className="mt-3" onSubmit={event => void submitHelp(event)}>
            <label className="block font-medium text-ink">{t(helpMode === 'review' ? 'feedback.reviewPrompt' : 'What do you need to continue?')}<textarea value={helpReason} onChange={event => setHelpReason(event.target.value)} maxLength={2000} rows={3} className={`${inputBase} mt-2 px-3 py-2`} /></label>
            <p className="mt-2 text-xs text-muted">{t(helpMode === 'review' ? 'feedback.reviewHelp' : 'feedback.helpPrompt')}</p>
            <Button className="mt-3" type="submit" disabled={!helpReason.trim() || isSaving || Boolean(pendingSave) || mutationLocked}>{t(helpMode === 'review' ? 'Request review update' : 'Send help request')}</Button>
          </form>}
        </section>
        {linkedOutput && <p className="rounded-control bg-inset px-4 py-3 text-sm text-muted">{t(evidenceAvailable ? 'Output evidence is attached. Client approval is tracked separately from task completion.' : 'This linked task needs an output link or deliverable file before review or completion. Add it through Full edit or the delivery workspace.')}</p>}

        <TaskOutputFiles task={liveTask} onUploadStateChange={setOutputUpload} />

        <section aria-labelledby="staff-delivery-context">
          <h3 id="staff-delivery-context" className="flex items-center gap-2 font-semibold text-ink"><UsersRound className="h-4 w-4 text-accent" />{t('Delivery context')}</h3>
          <dl className="mt-3 grid gap-3 rounded-panel bg-inset p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-muted">{t('Client')}</dt><dd data-i18n-skip className="mt-1 font-semibold text-ink">{liveTask.clientName}</dd></div>
            <div><dt className="text-xs font-medium text-muted">{t('Service')}</dt><dd data-i18n-skip className="mt-1 font-semibold text-ink">{liveTask.serviceType}</dd></div>
            {deliverable && <div><dt className="text-xs font-medium text-muted">{t('Deliverable')}</dt><dd data-i18n-skip className="mt-1 font-semibold text-ink">{deliverable.title}</dd></div>}
            {cycle && <div><dt className="text-xs font-medium text-muted">{t('Service cycle')}</dt><dd className="mt-1 font-semibold text-ink">{cycle.periodStart} – {cycle.periodEnd}</dd></div>}
            {dueDate && <div><dt className="text-xs font-medium text-muted">{t('Due date')}</dt><dd className="mt-1 font-semibold text-ink">{formatLocalizedDate(dueDate, locale)}</dd></div>}
          </dl>
        </section>

        {liveTask.attachmentLink && (
          <section aria-labelledby="staff-task-file">
            <h3 id="staff-task-file" className="font-semibold text-ink">{t('File')}</h3>
            {attachment ? <a href={attachment} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-control bg-inset px-4 text-sm font-semibold text-ink hover:bg-accent-soft hover:text-accent"><span className="truncate">{liveTask.attachmentName ? <span data-i18n-skip>{liveTask.attachmentName}</span> : t('Open attachment')}</span><ExternalLink className="h-4 w-4 shrink-0" /></a> : <p className="mt-2 text-sm text-red-700">{t('This attachment link is invalid.')}</p>}
          </section>
        )}

        <section aria-labelledby="staff-task-updates">
          <h3 id="staff-task-updates" className="flex items-center gap-2 font-semibold text-ink"><MessageSquare className="h-4 w-4 text-accent" />{t('Updates')}</h3>
          <div className="mt-3 space-y-3">
            {(liveTask.comments || []).map(item => {
              const author = users.find(user => user.id === item.userId);
              return <article key={item.id} className="rounded-panel bg-inset p-4"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold text-ink">{author?.name ? <span data-i18n-skip>{author.name}</span> : t('Team member')}</p><time className="shrink-0 text-xs text-muted">{formatLocalizedDistanceToNow(new Date(item.createdAt), locale)}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{item.text}</p>{pendingSave?.commentId === item.id && <p className="mt-2 text-xs font-medium text-muted" role="status">{t('Awaiting save confirmation')}</p>}</article>;
            })}
            {(liveTask.comments || []).length === 0 && <p className="rounded-panel bg-inset px-4 py-8 text-center text-sm text-muted">{t('No updates yet. Add the first work note below.')}</p>}
          </div>
          {!canComment && <p className="mt-3 rounded-control bg-inset px-3 py-2 text-xs font-medium text-muted">{t('Read-only task view. You can update tasks assigned to you or created by you.')}</p>}
          {canComment ? (
            <form onSubmit={submitComment} className="mt-3 flex items-end gap-2">
              <label className="min-w-0 flex-1"><span className="sr-only">{t('Add work update')}</span><textarea value={comment} onChange={event => setComment(event.target.value)} rows={2} placeholder={t('Add a work update…')} className={`${inputBase} resize-none px-3 py-2.5`} /></label>
              <Button type="submit" aria-label={t('Send work update')} disabled={!comment.trim() || mutationLocked || isSaving || Boolean(pendingSave)} className="h-11 w-11 shrink-0 px-0"><Send className="h-4 w-4" /></Button>
            </form>
          ) : null}
        </section>

        <section aria-labelledby="staff-task-history">
          <h3 id="staff-task-history" className="flex items-center gap-2 font-semibold text-ink"><History className="h-4 w-4 text-accent" />{t('History')}</h3>
          <div className="mt-3 space-y-3 border-l border-line pl-4">
            {[...(liveTask.workHistory || [])].reverse().map(event => <article key={event.id} className="text-sm"><p className="text-ink"><span data-i18n-skip className="font-semibold">{users.find(member => member.id === event.userId)?.name || t('Team member')}</span> · {event.fields.map(field => t(workFieldLabels[field] || 'Task updated')).join(', ')}</p><time className="mt-1 block text-xs text-muted">{formatLocalizedDistanceToNow(new Date(event.createdAt), locale)}</time></article>)}
            {[...(liveTask.approvalHistory || [])].reverse().map(event => {
              const author = users.find(user => user.id === event.userId);
              return (
                <article key={event.id} className="relative text-sm">
                  <span className="absolute -left-[1.31rem] top-1.5 h-2 w-2 rounded-full bg-accent ring-4 ring-surface" />
                  <p className="text-ink">{author?.name ? <span data-i18n-skip className="font-semibold">{author.name}</span> : <span className="font-semibold">{t('Team member')}</span>} {t('marked client review')} <span className="font-semibold">{t(event.status)}</span>.</p>
                  {event.note && <p data-i18n-skip className="mt-1 text-muted">{event.note}</p>}
                  <time className="mt-1 block text-xs text-muted">{formatLocalizedDistanceToNow(new Date(event.createdAt), locale)}</time>
                </article>
              );
            })}
            {liveTask.updatedAt && (
              <article className="relative text-sm">
                <span className="absolute -left-[1.31rem] top-1.5 h-2 w-2 rounded-full bg-line ring-4 ring-surface" />
                <p className="text-ink">{t('Task updated')}</p>
                <time className="mt-1 block text-xs text-muted">{formatLocalizedDistanceToNow(new Date(liveTask.updatedAt), locale)}</time>
              </article>
            )}
            {!liveTask.updatedAt && (liveTask.approvalHistory || []).length === 0 && <p className="text-sm text-muted">{t('No recorded history yet.')}</p>}
          </div>
        </section>
      </div>
    </SideSheet>
    {exitAction && <ConfirmDialog
      title={t('Discard unsaved changes?')}
      description={pendingSave ? t('Discard pending changes and reload the latest saved workspace?') : t('Your work update has not been sent.')}
      confirmLabel={t('Discard changes')} cancelLabel={t('Keep editing')}
      labelledBy={discardTitleId} onConfirm={confirmExit} onClose={() => setExitAction(null)} busy={isDiscarding}
    />}
    </>
  );
};

const workFieldLabels: Record<string, string> = { title: 'Title changed', description: 'Brief changed', notes: 'Notes changed', dueDate: 'Deadline changed', startDate: 'Start date changed', assignedTo: 'Assignee changed', department: 'Department changed', status: 'Status changed', priority: 'Priority changed', attachmentLink: 'Output link changed', requiresInternalApproval: 'Approval requirement changed', acceptedBy: 'Assignment acceptance changed', blocker: 'Help request changed' };
const workIntentApplied = (task: Task | undefined, intent: TaskWorkIntent, actorId?: string) => Boolean(task && (intent.kind === 'accept' ? task.workState?.acceptedBy === actorId : intent.kind === 'block' ? task.workState?.blocker?.reason === intent.reason?.trim() : !task.workState?.blocker));
const StaffTaskFocus: React.FC<StaffTaskFocusProps> = props => {
  const account = useStore(state => state.currentUser?.id);
  return <StaffTaskFocusContent key={`${account}:${props.task?.id}`} {...props} />;
};
export default StaffTaskFocus;
