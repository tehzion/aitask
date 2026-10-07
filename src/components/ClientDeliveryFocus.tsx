import React from 'react';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useRecoverableForm } from '../hooks/useRecoverableForm';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useToastStore } from '../store/useToastStore';
import DraftRecoveryNotice from './DraftRecoveryNotice';
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText, History, MessageSquareText, Send, UserRound, XCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../types';
import { canCommentOnTask, canReviewTaskAsClient, canViewTask } from '../lib/access';
import { getClientDeliveryStage, getClientDeliveryStageLabel, getClientDeliveryStageTone } from '../lib/clientPortal';
import { formatLocalizedDate, formatLocalizedDistanceToNow } from '../lib/i18n';
import { safeHttpsUrl } from '../lib/security';
import { cn, parseOptionalDate } from '../lib/utils';
import { isPendingMutationResolution, useStore } from '../store';
import { Button, ProgressBar, StatusChip } from './ui';
import { inputBase } from './uiTokens';
import SideSheet from './SideSheet';
import BackendFreshness from './BackendFreshness';
import { useI18n } from './I18nProvider';

interface ClientDeliveryFocusProps {
  task: Task | null;
  onClose: () => void;
}

const ClientDeliveryFocusForm = ({ task, onClose }: ClientDeliveryFocusProps) => {
  const { locale, t } = useI18n();
  const {
    users,
    tasks,
    currentUser,
    rolePermissions,
    backend,
    addComment,
    reviewClientApproval,
    commitPendingMutation,
  } = useStore(useShallow(state => ({
    users: state.users,
    tasks: state.tasks,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    backend: state.backend,
    addComment: state.addComment,
    reviewClientApproval: state.reviewClientApproval,
    commitPendingMutation: state.commitPendingMutation,
  })));
  const [decisionNote, setDecisionNote] = React.useState('');
  const [commentText, setCommentText] = React.useState('');
  const [error, setError] = React.useState('');
  const [decisionError, setDecisionError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  type PendingSave = { taskId: string; command: 'approval.review' | 'comment.add'; text: string; commentId?: string; approvalId?: string; status?: 'Approved' | 'Rejected'; failed?: boolean };
  const [pendingSave, setPendingSave] = React.useState<PendingSave | null>(null);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
  const mounted = React.useRef(true);
  const generation = React.useRef(0);
  const observedResolution = React.useRef(false);
  const taskId = React.useRef(task?.id); taskId.current = task?.id;
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const decisionNoteRef = React.useRef<HTMLTextAreaElement>(null);
  const decisionErrorId = React.useId();

  const draftValue = React.useRef({ decisionNote, commentText });
  draftValue.current = { decisionNote, commentText };
  const dirty = Boolean(decisionNote.trim() || commentText.trim());
  const markPristine = useUnsavedChanges(Boolean(task) && (dirty || isSubmitting || Boolean(pendingSave)));
  const recovery = useRecoverableForm(`client-delivery:${task?.id || ''}`,
    { decisionNote, commentText }, dirty, Boolean(task));
  const discardPending = async () => {
    const session = captureWorkspaceSession();
    setIsDiscarding(true);
    try {
      await useStore.getState().discardMutation();
      if (!mounted.current || !isWorkspaceSessionCurrent(session)) return false;
      const latest = useStore.getState().backend;
      if (latest.mode === 'supabase' && latest.status !== 'live') throw new Error(latest.error || t('The change is waiting to be saved.'));
      setPendingSave(null); setError(''); observedResolution.current = false;
      return true;
    } catch (failure) {
      if (mounted.current && isWorkspaceSessionCurrent(session)) setError(failure instanceof Error ? failure.message : t('The change is waiting to be saved.'));
      return false;
    } finally { if (mounted.current && isWorkspaceSessionCurrent(session)) setIsDiscarding(false); }
  };
  const requestClose = async () => {
    if (isSubmitting || backend.isSaving || isDiscarding) return;
    if ((dirty || pendingSave) && !window.confirm(t('Discard unsaved changes?'))) return;
    if (pendingSave && !await discardPending()) return;
    recovery.clear(); markPristine(); onClose();
  };
  const restoreDraft = () => {
    const draft = recovery.restore();
    if (!draft) return;
    if (typeof draft.decisionNote === 'string') setDecisionNote(draft.decisionNote);
    if (typeof draft.commentText === 'string') setCommentText(draft.commentText);
  };

  const recoveryRef = React.useRef(recovery); recoveryRef.current = recovery;
  const finishSave = React.useCallback((submitted: PendingSave) => {
    if (taskId.current !== submitted.taskId) return;
    const values = draftValue.current;
    if (submitted.command === 'comment.add') {
      if (values.commentText === submitted.text && !values.decisionNote.trim()) recoveryRef.current.clear();
      setCommentText(value => value === submitted.text ? '' : value);
    } else {
      if (values.decisionNote === submitted.text && !values.commentText.trim()) recoveryRef.current.clear();
      setDecisionNote(value => value === submitted.text ? '' : value);
      useToastStore.getState().addToast(submitted.status === 'Approved' ? 'Task approved successfully' : 'Revision request submitted', submitted.status === 'Approved' ? 'success' : 'warning');
    }
    setPendingSave(null); setError(''); observedResolution.current = false;
  }, []);

  React.useEffect(() => {
    if (!pendingSave?.failed || isSubmitting) return;
    if (isPendingMutationResolution(backend)) { observedResolution.current = true; return; }
    if (!observedResolution.current || backend.status !== 'live' || backend.hasLocalChanges || backend.pendingMutations || backend.isSaving || backend.isPulling) return;
    const saved = tasks.find(item => item.id === pendingSave.taskId);
    const acknowledged = pendingSave.commentId
      ? saved?.comments?.some(item => item.id === pendingSave.commentId)
      : saved?.approvalHistory?.some(item => item.id === pendingSave.approvalId);
    if (acknowledged) finishSave(pendingSave);
    else { setPendingSave(null); setError(''); observedResolution.current = false; }
  }, [backend, finishSave, isSubmitting, pendingSave, tasks]);

  if (!task || currentUser?.role !== 'Client' || !canViewTask(currentUser, task, rolePermissions)) return null;

  const contact = users.find(user => user.id === task.assignedTo);
  const pendingResolution = isPendingMutationResolution(backend);
  const canReview = !backend.upgradeRequired && !pendingResolution && canReviewTaskAsClient(currentUser, task, rolePermissions);
  const canComment = !backend.upgradeRequired && !pendingResolution && canCommentOnTask(currentUser, task, rolePermissions);
  const dueDate = parseOptionalDate(task.dueDate);
  const attachmentUrl = task.attachmentLink ? safeHttpsUrl(task.attachmentLink) : null;
  const displayTask: Task = pendingSave?.command === 'approval.review'
    ? { ...task, clientApprovalStatus: 'Pending' } : task;
  const stage = getClientDeliveryStage(displayTask);
  const isSaving = isSubmitting || backend.isSaving || isDiscarding;
  const mutationLocked = backend.upgradeRequired || pendingResolution || backend.isPulling;

  const performSave = async (submitted: PendingSave, retry = false) => {
    const session = captureWorkspaceSession();
    const attempt = ++generation.current;
    const actorId = currentUser.id;
    const isCurrent = () => {
      const current = useStore.getState();
      const delivery = current.tasks.find(item => item.id === submitted.taskId);
      return mounted.current && isWorkspaceSessionCurrent(session) && attempt === generation.current
        && current.currentUser?.id === actorId && current.currentUser.role === 'Client'
        && Boolean(delivery && canViewTask(current.currentUser, delivery, current.rolePermissions));
    };
    setIsSubmitting(true); setError(''); setPendingSave(submitted);
    try {
      const result = retry ? await useStore.getState().retryPendingSave() : await commitPendingMutation(submitted.command);
      if (!isCurrent()) return;
      if (result.ok) finishSave(submitted);
      else {
        setPendingSave({ ...submitted, failed: true });
        observedResolution.current = isPendingMutationResolution(useStore.getState().backend);
        setError(result.error ? t(result.error) : t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.'));
      }
    } catch (failure) {
      if (isCurrent()) {
        setPendingSave({ ...submitted, failed: true });
        observedResolution.current = isPendingMutationResolution(useStore.getState().backend);
        setError(failure instanceof Error ? failure.message : t('The change is waiting to be saved.'));
      }
    } finally { if (isCurrent()) setIsSubmitting(false); }
  };

  const submitDecision = async (status: 'Approved' | 'Rejected') => {
    if (isSaving || pendingSave || mutationLocked || !canReview) return;
    if (status === 'Rejected' && !decisionNote.trim()) {
      setDecisionError(t('Tell the team what needs to change before sending the request.'));
      window.setTimeout(() => decisionNoteRef.current?.focus(), 0);
      return;
    }
    setDecisionError('');
    const localResult = reviewClientApproval(task.id, status, decisionNote);
    if (!localResult.ok) { setError(localResult.error ? t(localResult.error) : t('Unable to review this task.')); return; }
    const history = useStore.getState().tasks.find(item => item.id === task.id)?.approvalHistory || [];
    await performSave({ taskId: task.id, command: 'approval.review', text: decisionNote, status, approvalId: history[history.length - 1]?.id });
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim() || isSaving || pendingSave || mutationLocked || !canComment) return;
    const localResult = addComment(task.id, commentText);
    if (!localResult.ok || !localResult.id) { setError(localResult.error ? t(localResult.error) : t('You do not have permission to comment on this task.')); return; }
    await performSave({ taskId: task.id, command: 'comment.add', text: commentText, commentId: localResult.id });
  };

  const footer = canReview ? (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button disabled={isSaving || Boolean(pendingSave) || mutationLocked} onClick={() => void submitDecision('Approved')} className="min-h-12">
        <CheckCircle2 className="h-4 w-4" />{isSaving ? t('Saving…') : t('Approve delivery')}
      </Button>
      <Button disabled={isSaving || Boolean(pendingSave) || mutationLocked} variant="secondary" onClick={() => void submitDecision('Rejected')} className="min-h-12 border-red-200 text-red-700 hover:bg-red-50">
        <XCircle className="h-4 w-4" />{t('Request changes')}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted">{pendingSave?.command === 'approval.review' ? t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.') : stage === 'delivered' ? t('This delivery is approved.') : stage === 'cancelled' ? t('This delivery was cancelled.') : t('Review actions will appear when the delivery is ready.')}</p>
      <Button variant="secondary" disabled={isSaving} onClick={() => void requestClose()}>{t('Close')}</Button>
    </div>
  );

  return (
    <SideSheet
      isOpen
      onClose={() => void requestClose()}
      closeDisabled={isSaving}
      title={t('Delivery details')}
      description={t('Review the outcome, timing, files, and conversation in one place.')}
      className="max-w-2xl"
      footer={footer}
    >
      <div className="space-y-7">
        {recovery.available && <DraftRecoveryNotice onRestore={restoreDraft} onDiscard={recovery.clear} />}
        <section aria-labelledby="delivery-outcome-title">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={getClientDeliveryStageTone(displayTask)}>{t(getClientDeliveryStageLabel(displayTask))}</StatusChip>
            <span data-i18n-skip className="text-xs font-medium text-muted">{task.serviceType}</span>
          </div>
          <h3 id="delivery-outcome-title" data-i18n-skip className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-ink text-pretty">{task.title}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted text-pretty">{task.description ? <span data-i18n-skip>{task.description}</span> : t('The requested outcome will appear here when the team adds a brief.')}</p>
        </section>

        <section className="rounded-panel bg-inset p-4 sm:p-5" aria-label={t('Delivery timing and progress')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs font-medium text-muted">{t('Expected date')}</p><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><CalendarDays className="h-4 w-4 text-accent" />{dueDate ? formatLocalizedDate(dueDate, locale) : t('To be confirmed')}</p></div>
            <div><p className="text-xs font-medium text-muted">{t('Agency contact')}</p><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><UserRound className="h-4 w-4 text-accent" />{contact?.name ? <span data-i18n-skip>{contact.name}</span> : t('Agency team')}</p></div>
            <div><p className="text-xs font-medium text-muted">{t('Progress')}</p><p className="calm-number mt-1 text-sm font-semibold text-ink">{task.completionPercentage}%</p></div>
          </div>
          <ProgressBar className="mt-4" value={task.completionPercentage} max={100} label={t('Delivery progress')} />
          {stage === 'timing_changed' && <div className="mt-4 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">{t('Expected timing has changed')}</p><p className="mt-1">{t('The date above is the latest shared date. Contact the agency team through the conversation below if you need more context.')}</p></div>}
        </section>

        <section aria-labelledby="delivery-files-title">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-accent" /><h3 id="delivery-files-title" className="font-semibold text-ink">{t('Preview and files')}</h3></div>
          <div className="mt-3 space-y-2">
            {attachmentUrl && <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><span className="truncate">{task.attachmentName ? <span data-i18n-skip>{task.attachmentName}</span> : t('Open delivery file')}</span><ExternalLink className="h-4 w-4 shrink-0 text-accent" /></a>}
            {task.website && safeHttpsUrl(task.website) && <a href={safeHttpsUrl(task.website)!} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset">{t('Website reference')}<ExternalLink className="h-4 w-4 shrink-0 text-accent" /></a>}
            {!attachmentUrl && !(task.website && safeHttpsUrl(task.website)) && <p className="rounded-control border border-dashed border-line px-4 py-6 text-sm text-muted">{t('No files have been shared for this delivery yet.')}</p>}
          </div>
        </section>

        {(canReview || pendingSave?.command === 'approval.review' || Boolean(decisionNote.trim())) && (
          <section aria-labelledby="delivery-decision-title">
            <h3 id="delivery-decision-title" className="font-semibold text-ink">{t('Your decision')}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{t('A note is optional when approving. A clear reason is required when requesting changes.')}</p>
            <textarea
              ref={decisionNoteRef}
              value={decisionNote}
              onChange={event => { setDecisionNote(event.target.value); setDecisionError(''); }}
              rows={3}
              className={cn(inputBase, 'mt-3 resize-none px-3 py-2.5')}
              placeholder={t('Add context for the team…')}
              aria-label={t('Decision note')}
              aria-invalid={decisionError ? 'true' : undefined}
              aria-describedby={decisionError ? decisionErrorId : undefined}
            />
            {decisionError && <p id={decisionErrorId} role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-200">{decisionError}</p>}
          </section>
        )}

        {(error || pendingResolution || pendingSave?.failed) && (
          <div role="alert" aria-live="assertive" className="rounded-control border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
            <p>{error || t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.')}</p>
            {pendingResolution && <BackendFreshness compact className="mt-3" onRetry={async () => { if (pendingSave && !isSaving) await performSave(pendingSave, true); else await useStore.getState().retryPendingSave(); }} onDiscard={() => { if (!isSaving && window.confirm(t('Discard unsaved changes?'))) void discardPending(); }} />}
            {pendingSave?.failed && !pendingResolution && <div className="mt-3 flex gap-2"><Button variant="secondary" disabled={isSaving} onClick={() => void performSave(pendingSave, true)}>{t('Retry save')}</Button><Button variant="secondary" disabled={isSaving} onClick={() => { if (window.confirm(t('Discard unsaved changes?'))) void discardPending(); }}>{t('Use latest')}</Button></div>}
          </div>
        )}

        <section aria-labelledby="delivery-conversation-title">
          <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-accent" /><h3 id="delivery-conversation-title" className="font-semibold text-ink">{t('Feedback and updates')}</h3></div>
          <div className="mt-4 space-y-4">
            {(task.comments || []).map(comment => {
              const author = users.find(user => user.id === comment.userId);
              return <article key={comment.id} className="rounded-control bg-inset px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{author?.name ? <span data-i18n-skip>{author.name}</span> : t('Team member')}</p><time className="text-xs text-muted">{formatLocalizedDistanceToNow(new Date(comment.createdAt), locale)}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{comment.text}</p></article>;
            })}
            {(task.comments || []).length === 0 && <p className="rounded-control border border-dashed border-line px-4 py-6 text-sm text-muted">{t('No feedback has been shared yet.')}</p>}
          </div>
          {(canComment || pendingSave?.command === 'comment.add') && <form onSubmit={submitComment} className="mt-4"><label className="sr-only" htmlFor={`delivery-comment-${task.id}`}>{t('Share feedback')}</label><div className="flex items-end gap-2"><textarea id={`delivery-comment-${task.id}`} value={commentText} onChange={event => setCommentText(event.target.value)} rows={2} className={cn(inputBase, 'min-h-12 resize-none px-3 py-2.5')} placeholder={t('Share feedback with the team…')} /><Button type="submit" disabled={!commentText.trim() || isSaving || Boolean(pendingSave) || mutationLocked} className="h-12 w-12 shrink-0 px-0" aria-label={t('Send feedback')}><Send className="h-4 w-4" /></Button></div></form>}
        </section>

        {(task.approvalHistory || []).length > 0 && (
          <section aria-labelledby="delivery-history-title">
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-accent" /><h3 id="delivery-history-title" className="font-semibold text-ink">{t('Decision history')}</h3></div>
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {[...(task.approvalHistory || [])].reverse().map(event => { const eventUser = users.find(user => user.id === event.userId); return <li key={event.id} className="relative"><span className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full bg-accent" /><p className="text-sm text-ink">{eventUser?.name ? <span data-i18n-skip className="font-semibold">{eventUser.name}</span> : <span className="font-semibold">{t('Client')}</span>} {event.status === 'Approved' ? t('approved the delivery') : t('requested changes')}.</p><p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><Clock3 className="h-3.5 w-3.5" />{formatLocalizedDistanceToNow(new Date(event.createdAt), locale)}</p>{event.note && <p data-i18n-skip className="mt-2 rounded-control bg-inset px-3 py-2 text-sm text-muted">{event.note}</p>}</li>; })}
            </ol>
          </section>
        )}
      </div>
    </SideSheet>
  );
};

// Remount form state when the delivery or account changes so drafts and
// in-flight save callbacks cannot cross delivery/account boundaries.
const ClientDeliveryFocus = (props: ClientDeliveryFocusProps) => {
  const account = useStore(state => state.currentUser?.authUserId || state.currentUser?.id || '');
  return props.task ? <ClientDeliveryFocusForm key={`${account}:${props.task.id}`} {...props} /> : null;
};

export default ClientDeliveryFocus;
