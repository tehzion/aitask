import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText, History, MessageSquareText, Send, UserRound, XCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../types';
import { canCommentOnTask, canReviewTaskAsClient } from '../lib/access';
import { getClientDeliveryStage, getClientDeliveryStageLabel } from '../lib/clientPortal';
import { safeHttpsUrl } from '../lib/security';
import { cn, parseOptionalDate } from '../lib/utils';
import { useStore } from '../store';
import { Button, ProgressBar, StatusChip } from './ui';
import { inputBase } from './uiTokens';
import SideSheet from './SideSheet';

interface ClientDeliveryFocusProps {
  task: Task | null;
  onClose: () => void;
}

const stageTone = (task: Task): 'amber' | 'emerald' | 'blue' | 'slate' => {
  const stage = getClientDeliveryStage(task);
  if (stage === 'needs_review' || stage === 'timing_changed') return 'amber';
  if (stage === 'delivered') return 'emerald';
  if (stage === 'in_delivery') return 'blue';
  return 'slate';
};

const ClientDeliveryFocus = ({ task, onClose }: ClientDeliveryFocusProps) => {
  const {
    users,
    currentUser,
    rolePermissions,
    backend,
    addComment,
    reviewClientApproval,
    commitPendingMutation,
  } = useStore(useShallow(state => ({
    users: state.users,
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
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    setDecisionNote('');
    setCommentText('');
    setError('');
    setIsSubmitting(false);
  }, [task?.id]);

  if (!task) return null;

  const contact = users.find(user => user.id === task.assignedTo);
  const canReview = !backend.upgradeRequired && canReviewTaskAsClient(currentUser, task, rolePermissions);
  const canComment = !backend.upgradeRequired && canCommentOnTask(currentUser, task, rolePermissions);
  const dueDate = parseOptionalDate(task.dueDate);
  const attachmentUrl = task.attachmentLink ? safeHttpsUrl(task.attachmentLink) : null;
  const stage = getClientDeliveryStage(task);
  const isSaving = isSubmitting || backend.isSaving;

  const commit = async (command: 'approval.review' | 'comment.add') => {
    setIsSubmitting(true);
    const result = await commitPendingMutation(command);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error || 'Your change is waiting to be saved. Use Retry my changes in the workspace banner.');
      return false;
    }
    setError('');
    return true;
  };

  const submitDecision = async (status: 'Approved' | 'Rejected') => {
    if (isSaving || !canReview) return;
    if (status === 'Rejected' && !decisionNote.trim()) {
      setError('Tell the team what needs to change before sending the request.');
      return;
    }
    reviewClientApproval(task.id, status, decisionNote);
    if (await commit('approval.review')) setDecisionNote('');
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim() || isSaving || !canComment) return;
    addComment(task.id, commentText);
    if (await commit('comment.add')) setCommentText('');
  };

  const footer = canReview ? (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button disabled={isSaving} onClick={() => void submitDecision('Approved')} className="min-h-12">
        <CheckCircle2 className="h-4 w-4" />{isSaving ? 'Saving…' : 'Approve delivery'}
      </Button>
      <Button disabled={isSaving} variant="secondary" onClick={() => void submitDecision('Rejected')} className="min-h-12 border-red-200 text-red-700 hover:bg-red-50">
        <XCircle className="h-4 w-4" />Request changes
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted">{stage === 'delivered' ? 'This delivery is approved.' : stage === 'cancelled' ? 'This delivery was cancelled.' : 'Review actions will appear when the delivery is ready.'}</p>
      <Button variant="secondary" onClick={onClose}>Close</Button>
    </div>
  );

  return (
    <SideSheet
      isOpen
      onClose={onClose}
      title="Delivery details"
      description="Review the outcome, timing, files, and conversation in one place."
      className="max-w-2xl"
      footer={footer}
    >
      <div className="space-y-7">
        <section aria-labelledby="delivery-outcome-title">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={stageTone(task)}>{getClientDeliveryStageLabel(task)}</StatusChip>
            <span data-i18n-skip className="text-xs font-medium text-muted">{task.serviceType}</span>
          </div>
          <h3 id="delivery-outcome-title" data-i18n-skip className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-ink text-pretty">{task.title}</h3>
          <p data-i18n-skip className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted text-pretty">{task.description || 'The requested outcome will appear here when the team adds a brief.'}</p>
        </section>

        <section className="rounded-panel bg-inset p-4 sm:p-5" aria-label="Delivery timing and progress">
          <div className="grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs font-medium text-muted">Expected date</p><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><CalendarDays className="h-4 w-4 text-accent" />{dueDate ? format(dueDate, 'd MMM yyyy') : 'To be confirmed'}</p></div>
            <div><p className="text-xs font-medium text-muted">Agency contact</p><p data-i18n-skip className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><UserRound className="h-4 w-4 text-accent" />{contact?.name || 'Agency team'}</p></div>
            <div><p className="text-xs font-medium text-muted">Progress</p><p className="calm-number mt-1 text-sm font-semibold text-ink">{task.completionPercentage}%</p></div>
          </div>
          <ProgressBar className="mt-4" value={task.completionPercentage} max={100} label="Delivery progress" />
          {stage === 'timing_changed' && <div className="mt-4 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Expected timing has changed</p><p className="mt-1">The date above is the latest shared date. Contact the agency team through the conversation below if you need more context.</p></div>}
        </section>

        <section aria-labelledby="delivery-files-title">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-accent" /><h3 id="delivery-files-title" className="font-semibold text-ink">Preview and files</h3></div>
          <div className="mt-3 space-y-2">
            {attachmentUrl && <a data-i18n-skip href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><span className="truncate">{task.attachmentName || 'Open delivery file'}</span><ExternalLink className="h-4 w-4 shrink-0 text-accent" /></a>}
            {task.website && safeHttpsUrl(task.website) && <a data-i18n-skip href={safeHttpsUrl(task.website)!} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset">Website reference<ExternalLink className="h-4 w-4 shrink-0 text-accent" /></a>}
            {!attachmentUrl && !(task.website && safeHttpsUrl(task.website)) && <p className="rounded-control border border-dashed border-line px-4 py-6 text-sm text-muted">No files have been shared for this delivery yet.</p>}
          </div>
        </section>

        {canReview && (
          <section aria-labelledby="delivery-decision-title">
            <h3 id="delivery-decision-title" className="font-semibold text-ink">Your decision</h3>
            <p className="mt-1 text-sm leading-6 text-muted">A note is optional when approving. A clear reason is required when requesting changes.</p>
            <textarea value={decisionNote} onChange={event => { setDecisionNote(event.target.value); setError(''); }} rows={3} className={cn(inputBase, 'mt-3 resize-none px-3 py-2.5')} placeholder="Add context for the team…" aria-label="Decision note" />
          </section>
        )}

        {error && <p role="alert" className="rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">{error}</p>}

        <section aria-labelledby="delivery-conversation-title">
          <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-accent" /><h3 id="delivery-conversation-title" className="font-semibold text-ink">Feedback and updates</h3></div>
          <div className="mt-4 space-y-4">
            {(task.comments || []).map(comment => {
              const author = users.find(user => user.id === comment.userId);
              return <article key={comment.id} className="rounded-control bg-inset px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p data-i18n-skip className="text-sm font-semibold text-ink">{author?.name || 'Team member'}</p><time className="text-xs text-muted">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{comment.text}</p></article>;
            })}
            {(task.comments || []).length === 0 && <p className="rounded-control border border-dashed border-line px-4 py-6 text-sm text-muted">No feedback has been shared yet.</p>}
          </div>
          {canComment && <form onSubmit={submitComment} className="mt-4"><label className="sr-only" htmlFor={`delivery-comment-${task.id}`}>Share feedback</label><div className="flex items-end gap-2"><textarea id={`delivery-comment-${task.id}`} value={commentText} onChange={event => setCommentText(event.target.value)} rows={2} className={cn(inputBase, 'min-h-12 resize-none px-3 py-2.5')} placeholder="Share feedback with the team…" /><Button type="submit" disabled={!commentText.trim() || isSaving} className="h-12 w-12 shrink-0 px-0" aria-label="Send feedback"><Send className="h-4 w-4" /></Button></div></form>}
        </section>

        {(task.approvalHistory || []).length > 0 && (
          <section aria-labelledby="delivery-history-title">
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-accent" /><h3 id="delivery-history-title" className="font-semibold text-ink">Decision history</h3></div>
            <ol className="mt-4 space-y-3 border-l border-line pl-4">
              {[...(task.approvalHistory || [])].reverse().map(event => <li key={event.id} className="relative"><span className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full bg-accent" /><p className="text-sm text-ink"><span data-i18n-skip className="font-semibold">{users.find(user => user.id === event.userId)?.name || 'Client'}</span> {event.status === 'Approved' ? 'approved the delivery' : 'requested changes'}.</p><p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><Clock3 className="h-3.5 w-3.5" />{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</p>{event.note && <p data-i18n-skip className="mt-2 rounded-control bg-inset px-3 py-2 text-sm text-muted">{event.note}</p>}</li>)}
            </ol>
          </section>
        )}
      </div>
    </SideSheet>
  );
};

export default ClientDeliveryFocus;
