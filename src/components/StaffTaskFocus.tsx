import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Clock3, ExternalLink, FileText, History, MessageSquare, Send, UsersRound } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useShallow } from 'zustand/react/shallow';
import type { Task, TaskStatus } from '../types';
import { useStore } from '../store';
import { getStaffGuidedAction } from '../lib/staffWorkspace';
import { safeHttpsUrl } from '../lib/security';
import { getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { inputBase } from './uiTokens';
import { Button, ProgressBar, StatusChip } from './ui';
import SideSheet from './SideSheet';

interface StaffTaskFocusProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
}

const StaffTaskFocus: React.FC<StaffTaskFocusProps> = ({ isOpen, task, onClose }) => {
  const {
    tasks,
    users,
    deliverables,
    serviceCycles,
    taskStatuses,
    backend,
    updateTaskStatus,
    addComment,
    commitPendingMutation,
  } = useStore(useShallow(state => ({
    tasks: state.tasks,
    users: state.users,
    deliverables: state.deliverables,
    serviceCycles: state.serviceCycles,
    taskStatuses: state.taskStatuses,
    backend: state.backend,
    updateTaskStatus: state.updateTaskStatus,
    addComment: state.addComment,
    commitPendingMutation: state.commitPendingMutation,
  })));
  const [comment, setComment] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const statusPickerRef = React.useRef<HTMLSelectElement>(null);
  const liveTask = task ? tasks.find(item => item.id === task.id) || task : null;

  React.useEffect(() => {
    setComment('');
    setError('');
    setIsSaving(false);
  }, [task?.id]);

  if (!liveTask) return null;

  const incompletePredecessors = (liveTask.predecessorTaskIds || [])
    .map(id => tasks.find(item => item.id === id))
    .filter((item): item is Task => Boolean(item && !item.isCompleted && item.status !== 'Completed'));
  const guidedAction = getStaffGuidedAction(liveTask, taskStatuses);
  const deliverable = deliverables.find(item => item.id === liveTask.deliverableId);
  const cycle = serviceCycles.find(item => item.id === liveTask.serviceCycleId);
  const dueDate = parseOptionalDate(liveTask.dueDate);
  const attachment = safeHttpsUrl(liveTask.attachmentLink);
  const mutationLocked = backend.upgradeRequired === true || backend.isSaving || backend.isPulling;

  const persistStatus = async (status: TaskStatus) => {
    if (mutationLocked || status === liveTask.status) return;
    if (incompletePredecessors.length > 0 && !['Pending', 'Cancelled'].includes(status)) {
      const confirmed = window.confirm(`This task still has ${incompletePredecessors.length} incomplete predecessor task(s). Start it anyway?`);
      if (!confirmed) return;
    }
    setIsSaving(true);
    setError('');
    updateTaskStatus(liveTask.id, status);
    const result = await commitPendingMutation('task.update');
    setIsSaving(false);
    if (!result.ok) setError(result.error || 'This update is waiting to sync. Use the workspace retry controls to continue.');
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim() || mutationLocked || isSaving) return;
    setIsSaving(true);
    setError('');
    addComment(liveTask.id, comment);
    const result = await commitPendingMutation('comment.add');
    setIsSaving(false);
    if (result.ok) setComment('');
    else setError(result.error || 'This update is waiting to sync. Use the workspace retry controls to continue.');
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">All task statuses</span>
        <select
          ref={statusPickerRef}
          aria-label="All task statuses"
          value={liveTask.status}
          disabled={mutationLocked || isSaving}
          onChange={event => void persistStatus(event.target.value)}
          className={`${inputBase} min-h-11 appearance-none px-3 pr-9`}
        >
          {taskStatuses.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </label>
      <Button
        className="sm:min-w-44"
        disabled={mutationLocked || isSaving || guidedAction.disabled}
        onClick={() => {
          if (guidedAction.kind === 'advance' && guidedAction.targetStatus) void persistStatus(guidedAction.targetStatus);
          else statusPickerRef.current?.focus();
        }}
      >
        {guidedAction.kind === 'waiting' ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {isSaving ? 'Saving…' : guidedAction.label}
      </Button>
    </div>
  );

  return (
    <SideSheet
      isOpen={isOpen}
      onClose={onClose}
      title={liveTask.title}
      description={`${liveTask.clientName} · ${liveTask.serviceType}`}
      className="w-full sm:max-w-xl"
      footer={footer}
    >
      <div className="space-y-6 pb-2">
        {error && <div role="alert" aria-live="assertive" className="rounded-control bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">{error}</div>}

        <section aria-labelledby="staff-task-state" className="calm-raised p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p id="staff-task-state" className="calm-eyebrow">Current work state</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip tone={liveTask.status === 'Waiting Approval' ? 'amber' : liveTask.isCompleted ? 'emerald' : 'blue'}>{liveTask.status}</StatusChip>
                <span className="text-xs font-semibold text-muted">{liveTask.priority} priority</span>
              </div>
            </div>
            <div className="text-right">
              <p className="calm-number text-2xl font-semibold text-ink">{liveTask.completionPercentage}%</p>
              <p className="text-xs text-muted">progress</p>
            </div>
          </div>
          <ProgressBar className="mt-4" label="Task progress" value={liveTask.completionPercentage} />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{getRelativeDueDateString(liveTask.dueDate, liveTask.isCompleted, liveTask.status)}</span>
            {liveTask.revisionCount > 0 && <span className="text-amber-700">Revision {liveTask.revisionCount}</span>}
          </div>
        </section>

        {incompletePredecessors.length > 0 && (
          <section className="rounded-panel bg-amber-50 p-4 text-[#6b3f00] ring-1 ring-amber-200 dark:bg-[#31240f] dark:text-[#fff2c2] dark:ring-[#765d22]" aria-labelledby="staff-task-blockers">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><h3 id="staff-task-blockers" className="font-semibold">Check the earlier step</h3><p className="mt-1 text-sm leading-6">You can continue after confirming, but these predecessor tasks are incomplete.</p><ul className="mt-2 space-y-1 text-sm">{incompletePredecessors.map(item => <li data-i18n-skip key={item.id}>• {item.title}</li>)}</ul></div>
            </div>
          </section>
        )}

        <section aria-labelledby="staff-task-brief">
          <h3 id="staff-task-brief" className="flex items-center gap-2 font-semibold text-ink"><FileText className="h-4 w-4 text-accent" />Brief</h3>
          <div className="mt-3 rounded-panel bg-inset p-4 text-sm leading-6 text-ink">
            <p data-i18n-skip className="whitespace-pre-wrap">{liveTask.description || 'No task brief has been added.'}</p>
            {liveTask.notes && <p data-i18n-skip className="mt-3 border-t border-line pt-3 text-muted">{liveTask.notes}</p>}
          </div>
        </section>

        <section aria-labelledby="staff-delivery-context">
          <h3 id="staff-delivery-context" className="flex items-center gap-2 font-semibold text-ink"><UsersRound className="h-4 w-4 text-accent" />Delivery context</h3>
          <dl className="mt-3 grid gap-3 rounded-panel bg-inset p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-muted">Client</dt><dd data-i18n-skip className="mt-1 font-semibold text-ink">{liveTask.clientName}</dd></div>
            <div><dt className="text-xs font-medium text-muted">Service</dt><dd data-i18n-skip className="mt-1 font-semibold text-ink">{liveTask.serviceType}</dd></div>
            {deliverable && <div><dt className="text-xs font-medium text-muted">Deliverable</dt><dd data-i18n-skip className="mt-1 font-semibold text-ink">{deliverable.title}</dd></div>}
            {cycle && <div><dt className="text-xs font-medium text-muted">Service cycle</dt><dd className="mt-1 font-semibold text-ink">{cycle.periodStart} – {cycle.periodEnd}</dd></div>}
            {dueDate && <div><dt className="text-xs font-medium text-muted">Due date</dt><dd className="mt-1 font-semibold text-ink">{format(dueDate, 'd MMM yyyy')}</dd></div>}
          </dl>
        </section>

        {liveTask.attachmentLink && (
          <section aria-labelledby="staff-task-file">
            <h3 id="staff-task-file" className="font-semibold text-ink">File</h3>
            {attachment ? <a data-i18n-skip href={attachment} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-control bg-inset px-4 text-sm font-semibold text-ink hover:bg-accent-soft hover:text-accent"><span className="truncate">{liveTask.attachmentName || 'Open attachment'}</span><ExternalLink className="h-4 w-4 shrink-0" /></a> : <p className="mt-2 text-sm text-red-700">This attachment link is invalid.</p>}
          </section>
        )}

        <section aria-labelledby="staff-task-updates">
          <h3 id="staff-task-updates" className="flex items-center gap-2 font-semibold text-ink"><MessageSquare className="h-4 w-4 text-accent" />Updates</h3>
          <div className="mt-3 space-y-3">
            {(liveTask.comments || []).map(item => {
              const author = users.find(user => user.id === item.userId);
              return <article key={item.id} className="rounded-panel bg-inset p-4"><div className="flex items-baseline justify-between gap-3"><p data-i18n-skip className="text-sm font-semibold text-ink">{author?.name || 'Team member'}</p><time className="shrink-0 text-xs text-muted">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{item.text}</p></article>;
            })}
            {(liveTask.comments || []).length === 0 && <p className="rounded-panel bg-inset px-4 py-8 text-center text-sm text-muted">No updates yet. Add the first work note below.</p>}
          </div>
          <form onSubmit={submitComment} className="mt-3 flex items-end gap-2">
            <label className="min-w-0 flex-1"><span className="sr-only">Add work update</span><textarea value={comment} onChange={event => setComment(event.target.value)} rows={2} placeholder="Add a work update…" className={`${inputBase} resize-none px-3 py-2.5`} /></label>
            <Button type="submit" aria-label="Send work update" disabled={!comment.trim() || mutationLocked || isSaving} className="h-11 w-11 shrink-0 px-0"><Send className="h-4 w-4" /></Button>
          </form>
        </section>

        <section aria-labelledby="staff-task-history">
          <h3 id="staff-task-history" className="flex items-center gap-2 font-semibold text-ink"><History className="h-4 w-4 text-accent" />History</h3>
          <div className="mt-3 space-y-3 border-l border-line pl-4">
            {[...(liveTask.approvalHistory || [])].reverse().map(event => {
              const author = users.find(user => user.id === event.userId);
              return (
                <article key={event.id} className="relative text-sm">
                  <span className="absolute -left-[1.31rem] top-1.5 h-2 w-2 rounded-full bg-accent ring-4 ring-surface" />
                  <p className="text-ink"><span data-i18n-skip className="font-semibold">{author?.name || 'Team member'}</span> marked client review <span className="font-semibold">{event.status}</span>.</p>
                  {event.note && <p data-i18n-skip className="mt-1 text-muted">{event.note}</p>}
                  <time className="mt-1 block text-xs text-muted">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</time>
                </article>
              );
            })}
            {liveTask.updatedAt && (
              <article className="relative text-sm">
                <span className="absolute -left-[1.31rem] top-1.5 h-2 w-2 rounded-full bg-line ring-4 ring-surface" />
                <p className="text-ink">Task updated</p>
                <time className="mt-1 block text-xs text-muted">{formatDistanceToNow(new Date(liveTask.updatedAt), { addSuffix: true })}</time>
              </article>
            )}
            {!liveTask.updatedAt && (liveTask.approvalHistory || []).length === 0 && <p className="text-sm text-muted">No recorded history yet.</p>}
          </div>
        </section>
      </div>
    </SideSheet>
  );
};

export default StaffTaskFocus;
