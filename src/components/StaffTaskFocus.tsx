import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Clock3, ExternalLink, FileText, History, MessageSquare, Send, UsersRound } from 'lucide-react';
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
import { formatLocalizedDate, formatLocalizedDistanceToNow } from '../lib/i18n';
import { getVisibleTasks, getTaskAccess } from '../lib/access';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ConfirmDialog from './ConfirmDialog';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { announceTaskStatusSaved } from '../lib/taskStatusFeedback';

interface StaffTaskFocusProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onOpenFullEditor?: () => void;
}

const StaffTaskFocus: React.FC<StaffTaskFocusProps> = ({ isOpen, task, onClose, onOpenFullEditor }) => {
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
    addComment: state.addComment,
    commitPendingMutation: state.commitPendingMutation,
    rolePermissions: state.rolePermissions,
  })));
  const [comment, setComment] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [pendingStatus, setPendingStatus] = React.useState<TaskStatus | null>(null);
  const [pendingSave, setPendingSave] = React.useState<{ taskId: string; commentId?: string; text?: string; status?: TaskStatus; failed?: boolean } | null>(null);
  const [exitAction, setExitAction] = React.useState<(() => void) | null>(null);
  const [isDiscarding, setIsDiscarding] = React.useState(false);
  const discardTitleId = React.useId();
  const currentTaskId = React.useRef(task?.id);
  currentTaskId.current = task?.id;
  const pendingSaveRef = React.useRef(pendingSave);
  pendingSaveRef.current = pendingSave;
  const observedResolution = React.useRef(false);
  const operationGeneration = React.useRef(0);
  const clearUnsaved = useUnsavedChanges(isOpen && Boolean(comment.trim() || isSaving || pendingSave));
  const statusPickerRef = React.useRef<HTMLSelectElement>(null);
  const liveTask = task ? tasks.find(item => item.id === task.id) || null : null;

  React.useEffect(() => {
    setComment('');
    setError('');
    setIsSaving(false);
    setPendingStatus(null);
    setPendingSave(null);
    setExitAction(null);
    setIsDiscarding(false);
    operationGeneration.current++;
  }, [task?.id]);

  const finishSave = React.useCallback((submitted: NonNullable<typeof pendingSave>) => {
    if (currentTaskId.current !== submitted.taskId) return;
    if (submitted.text !== undefined) setComment(current => current === submitted.text ? '' : current);
    if (submitted.status) announceTaskStatusSaved(submitted.status);
    setPendingSave(null);
    setError('');
    observedResolution.current = false;
  }, []);

  React.useEffect(() => {
    if (!pendingSave?.failed || isSaving) return;
    if (isPendingMutationResolution(backend)) { observedResolution.current = true; return; }
    if (!observedResolution.current || backend.status !== 'live' || backend.hasLocalChanges || backend.pendingMutations || backend.isSaving || backend.isPulling) return;
    const savedTask = tasks.find(item => item.id === pendingSave.taskId);
    const acknowledged = pendingSave.commentId
      ? savedTask?.comments?.some(item => item.id === pendingSave.commentId)
      : savedTask?.status === pendingSave.status;
    if (acknowledged) finishSave(pendingSave);
    else { setPendingSave(null); setError(''); observedResolution.current = false; }
  }, [backend, finishSave, isSaving, pendingSave, tasks]);

  if (!liveTask) return null;

  const visibleTasks = getVisibleTasks(currentUser, tasks, rolePermissions, { clients, projects });
  const incompletePredecessors = getTaskBlockers(liveTask, visibleTasks);
  const unavailablePredecessorCount = getUnavailableTaskDependencyCount(liveTask, visibleTasks);
  const guidedAction = getStaffGuidedAction(liveTask, taskStatuses);
  const deliverable = deliverables.find(item => item.id === liveTask.deliverableId);
  const cycle = serviceCycles.find(item => item.id === liveTask.serviceCycleId);
  const dueDate = parseOptionalDate(liveTask.dueDate);
  const attachment = safeHttpsUrl(liveTask.attachmentLink);
  const pendingResolution = isPendingMutationResolution(backend);
  const mutationLocked = backend.upgradeRequired === true || pendingResolution || backend.isSaving || backend.isPulling;
  const taskAccess = getTaskAccess(currentUser, liveTask, rolePermissions, { clients, projects });
  if (!taskAccess.canView) return null;
  const canEdit = taskAccess.canEdit;
  const canComment = taskAccess.canComment;

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
      if (result.ok) finishSave(submitted);
      else {
        setPendingSave({ ...submitted, failed: true });
        observedResolution.current = isPendingMutationResolution(useStore.getState().backend);
        setError(result.error || t('This update is waiting to sync. Use the workspace retry controls to continue.'));
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
    if (isSaving) return;
    if (comment.trim() || pendingSave) setExitAction(() => action);
    else { clearUnsaved(); action(); }
  };

  const confirmExit = async () => {
    if (!exitAction || isDiscarding) return;
    const session = captureWorkspaceSession();
    const taskId = liveTask.id;
    setIsDiscarding(true);
    try {
      if (pendingSave) {
        await useStore.getState().discardMutation();
        const current = useStore.getState().backend;
        if (current.mode === 'supabase' && current.status !== 'live') throw new Error(current.error || t('The change is waiting to be saved.'));
      }
      if (!isWorkspaceSessionCurrent(session) || currentTaskId.current !== taskId) return;
      operationGeneration.current++;
      setComment(''); setPendingSave(null); setError('');
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
    if (isSaving || pendingSave || mutationLocked || !canEdit || status === liveTask.status) return;
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

  const footer = canEdit ? (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
      {canEdit && onOpenFullEditor && <Button variant="secondary" disabled={isSaving || Boolean(pendingSave)} onClick={() => requestExit(onOpenFullEditor)}>{t('Full edit')}</Button>}
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t('All task statuses')}</span>
        <select
          ref={statusPickerRef}
          aria-label={t('All task statuses')}
          value={liveTask.status}
          disabled={mutationLocked || !canEdit || isSaving || Boolean(pendingSave) || pendingStatus !== null}
          onChange={event => void persistStatus(event.target.value)}
          className={`${inputBase} min-h-11 appearance-none px-3 pr-9`}
        >
          {taskStatuses.map(status => <option key={status} value={status}>{t(status)}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </label>
      <Button
        className="sm:min-w-44"
        disabled={mutationLocked || !canEdit || isSaving || Boolean(pendingSave) || guidedAction.disabled || pendingStatus !== null}
        onClick={() => {
          if (guidedAction.kind === 'advance' && guidedAction.targetStatus) void persistStatus(guidedAction.targetStatus);
          else statusPickerRef.current?.focus();
        }}
      >
        {guidedAction.kind === 'waiting' ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {isSaving ? t('Saving…') : t(guidedAction.label)}
      </Button>
    </div>
  ) : null;

  return (
    <>
    <SideSheet
      isOpen={isOpen}
      onClose={() => requestExit(onClose)}
      closeDisabled={isSaving || isDiscarding}
      title={liveTask.title}
      description={`${liveTask.clientName} · ${liveTask.serviceType}`}
      titleIsUserContent
      descriptionIsUserContent
      className="w-full sm:max-w-xl"
      footer={footer}
    >
      <div className="space-y-6 pb-2">
        {pendingStatus && (
          <section role="alertdialog" aria-labelledby="staff-dependency-confirm-title" aria-describedby="staff-dependency-confirm-description" className="rounded-panel border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm dark:bg-[#31240f] dark:text-[#fff2c2] dark:ring-1 dark:ring-[#765d22]">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="staff-dependency-confirm-title" className="font-semibold">{t('Start with an incomplete earlier step?')}</h3>
                <p id="staff-dependency-confirm-description" className="mt-1 text-sm leading-6">{t('This task still has {count} incomplete predecessor task(s). Confirm before moving it to {status}.', { count: incompletePredecessors.length, status: t(pendingStatus) })}</p>
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
            <p>{error || t('Your change is waiting to be saved. Use Retry my changes in the workspace banner.')}</p>
            {pendingResolution && <BackendFreshness compact className="mt-3" onRetry={async () => { const submitted = pendingSaveRef.current; if (submitted && !isSaving) await performSave(submitted, true); else await useStore.getState().retryPendingSave(); }} onDiscard={pendingSave ? () => requestExit(() => undefined) : undefined} />}
            {pendingSave?.failed && !pendingResolution && <Button variant="secondary" className="mt-3" disabled={isSaving} onClick={() => void performSave(pendingSave, true)}>{t('Retry save')}</Button>}
          </div>
        )}

        <section aria-labelledby="staff-task-state" className="calm-raised p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p id="staff-task-state" className="calm-eyebrow">{t('Status')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip tone={liveTask.status === 'Waiting Approval' ? 'amber' : liveTask.isCompleted ? 'emerald' : 'blue'}>{t(liveTask.status)}</StatusChip>
                <span className="text-xs font-semibold text-muted">{t(liveTask.priority)} {t('priority')}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="calm-number text-2xl font-semibold text-ink">{liveTask.completionPercentage}%</p>
              <p className="text-xs text-muted">{t('progress')}</p>
            </div>
          </div>
          <ProgressBar className="mt-4" label={t('Task progress')} value={liveTask.completionPercentage} />
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{getRelativeDueDateString(liveTask.dueDate, liveTask.isCompleted, liveTask.status, locale)}</span>
            {liveTask.revisionCount > 0 && <span className="text-amber-700">{t('Revision')} {liveTask.revisionCount}</span>}
          </div>
        </section>

        {incompletePredecessors.length > 0 && (
          <section className="rounded-panel bg-amber-50 p-4 text-[#6b3f00] ring-1 ring-amber-200 dark:bg-[#31240f] dark:text-[#fff2c2] dark:ring-[#765d22]" aria-labelledby="staff-task-blockers">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><h3 id="staff-task-blockers" className="font-semibold">{t('Check the earlier step')}</h3><p className="mt-1 text-sm leading-6">{t('You can continue after confirming, but these predecessor tasks are incomplete.')}</p><ul className="mt-2 space-y-1 text-sm">{incompletePredecessors.map(item => <li key={item.id}><span aria-hidden="true">• </span><span data-i18n-skip>{item.title}</span></li>)}</ul></div>
            </div>
          </section>
        )}
        {unavailablePredecessorCount > 0 && (
          <section className="rounded-panel bg-slate-50 p-4 text-sm text-muted ring-1 ring-line" aria-label={t('Dependency status unavailable')}>
            {t(`Dependency status for ${unavailablePredecessorCount} earlier step${unavailablePredecessorCount === 1 ? '' : 's'} is unavailable. Confirm with the task owner before starting.`)}
          </section>
        )}

        <section aria-labelledby="staff-task-brief">
          <h3 id="staff-task-brief" className="flex items-center gap-2 font-semibold text-ink"><FileText className="h-4 w-4 text-accent" />{t('Brief')}</h3>
          <div className="mt-3 rounded-panel bg-inset p-4 text-sm leading-6 text-ink">
            <p className="whitespace-pre-wrap">{liveTask.description ? <span data-i18n-skip>{liveTask.description}</span> : t('No task brief has been added.')}</p>
            {liveTask.notes && <p data-i18n-skip className="mt-3 border-t border-line pt-3 text-muted">{liveTask.notes}</p>}
          </div>
        </section>

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
              return <article key={item.id} className="rounded-panel bg-inset p-4"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold text-ink">{author?.name ? <span data-i18n-skip>{author.name}</span> : t('Team member')}</p><time className="shrink-0 text-xs text-muted">{formatLocalizedDistanceToNow(new Date(item.createdAt), locale)}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{item.text}</p></article>;
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

export default StaffTaskFocus;
