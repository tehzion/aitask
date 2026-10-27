import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Flag, FolderKanban, Settings2, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import type { Project, ProjectMilestoneStatus } from '../types';
import { useI18n } from './I18nProvider';
import { Badge, Button, SegmentedTabs } from './ui';
import { assessProjectHealth } from '../lib/pmDashboard';
import { canManageProjectLifecycle, effectiveMilestoneStatus, getProjectClosureWarnings, hasProjectClosureWarnings, milestoneTaskProgress, projectStatus } from '../lib/projectManagement';
import { formatLocalizedDate } from '../lib/i18n';
import SystemMessage from './SystemMessage';
import ModalShell from './ModalShell';
import { useSaveAction } from '../hooks/useSaveAction';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { sameSavedValue } from '../lib/saveConfirmation';
import BackendFreshness from './BackendFreshness';
import { isTaskInListScope, type TaskListScope } from '../lib/taskListScope';

const tabs = ['overview', 'tasks', 'team', 'milestones', 'settings'] as const;
type Tab = typeof tabs[number];
const milestoneStatuses: ProjectMilestoneStatus[] = ['Not Started', 'In Progress', 'Completed', 'Delayed'];

export default function ProjectManagementPanel({ projectId, onClose, onEdit }: {
  projectId: string;
  onClose: () => void;
  onEdit: (project: Project) => void;
}) {
  const { t, locale } = useI18n();
  const state = useStore(useShallow(store => ({
    project: store.projects.find(project => project.id === projectId),
    tasks: store.tasks,
    users: store.users,
    currentUser: store.currentUser,
    backend: store.backend,
    setProjectStatus: store.setProjectStatus,
    saveProjectMilestone: store.saveProjectMilestone,
    deleteProjectMilestone: store.deleteProjectMilestone,
    commitPendingMutation: store.commitPendingMutation,
  })));
  const [tab, setTab] = React.useState<Tab>('overview');
  const [message, setMessage] = React.useState('');
  const { busy, run } = useSaveAction(projectId);
  const pending = React.useRef<{ matches: (project?: Project) => boolean; milestone: boolean } | null>(null);
  const [hasPending, setHasPending] = React.useState(false);
  const [confirmClosure, setConfirmClosure] = React.useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = React.useState('');
  const [milestone, setMilestone] = React.useState({ name: '', description: '', targetDate: '', responsiblePersonId: '', status: 'Not Started' as ProjectMilestoneStatus });
  const baseline = React.useRef(milestone);
  const dirty = !sameSavedValue(milestone, baseline.current);
  useUnsavedChanges(dirty || busy || hasPending, busy || hasPending);
  React.useEffect(() => {
    pending.current = null; setHasPending(false); setMessage(''); setEditingMilestoneId(''); setConfirmClosure(false);
    const blank = { name: '', description: '', targetDate: '', responsiblePersonId: '', status: 'Not Started' as const };
    baseline.current = blank; setMilestone(blank);
  }, [projectId, state.currentUser?.id]);
  const [taskScope, setTaskScope] = React.useState<TaskListScope>('active');
  const requestClose = () => { if (!busy && !hasPending && (!dirty || window.confirm(t('Discard unsaved changes?')))) onClose(); };

  if (!state.project) return null;
  const project = state.project;
  const projectTasks = state.tasks.filter(task => task.projectId === project.id);
  const scopedProjectTasks = projectTasks.filter(task => isTaskInListScope(task, taskScope));
  const health = assessProjectHealth(project, state.tasks);
  const warnings = getProjectClosureWarnings(project, state.tasks);
  const canManage = canManageProjectLifecycle(state.currentUser, project);
  const status = projectStatus(project);
  const members = state.users.filter(user => [
    ...(project.projectManagerIds || []),
    ...(project.hodMemberIds || []),
    ...(project.staffMemberIds || []),
  ].includes(user.id));

  const persist = async (mutate: () => { ok: boolean; error?: string }, describe: () => NonNullable<typeof pending.current>) => {
    const result = await run(async isCurrent => {
      const retry = Boolean(pending.current);
      if (!retry) {
        const staged = mutate();
        if (!staged.ok) return staged;
        pending.current = describe(); setHasPending(true);
      }
      const saved = retry ? await useStore.getState().retryPendingSave('project.update') : await state.commitPendingMutation('project.update');
      if (!isCurrent()) return { ok: false };
      if (!saved.ok) return saved;
      const submission = pending.current;
      const canonical = useStore.getState().projects.find(item => item.id === projectId);
      if (!submission || !submission.matches(canonical)) {
        pending.current = null; setHasPending(false);
        return { ok: false, error: 'The pending project change is no longer available. Review your draft before saving again.' };
      }
      return { ok: true };
    }, saved => {
      if (!saved.ok) { setMessage(saved.error || 'The change is waiting to be saved.'); return; }
      const wasMilestone = pending.current?.milestone;
      pending.current = null; setHasPending(false); setMessage(''); setConfirmClosure(false);
      if (wasMilestone) {
        const blank = { name: '', description: '', targetDate: '', responsiblePersonId: '', status: 'Not Started' as const };
        baseline.current = blank; setMilestone(blank); setEditingMilestoneId('');
      }
    });
    return result?.ok === true;
  };

  const changeStatus = async (next: 'Active' | 'Completed' | 'Closed', confirmed = false) => {
    await persist(() => state.setProjectStatus(project.id, next, confirmed), () => ({ milestone: false, matches: saved => saved?.status === next }));
  };
  const restorePending = async () => {
    const result = await run(async () => {
      await useStore.getState().discardMutation();
      const backend = useStore.getState().backend;
      return backend.mode === 'supabase' && (backend.status !== 'live' || backend.error)
        ? { ok: false, error: backend.error || 'Unable to reload saved data. Try again.' } : { ok: true };
    }, restored => {
      if (!restored.ok) { setMessage(restored.error || 'Unable to reload saved data. Try again.'); return; }
      pending.current = null; setHasPending(false); setMessage('Synchronization restored. Review and save your draft.');
    });
    if (result && !result.ok) throw new Error(result.error);
  };

  const editMilestone = (id: string) => {
    if (busy || hasPending) return;
    const value = (project.milestones || []).find(item => item.id === id);
    if (!value) return;
    setEditingMilestoneId(id);
    const draft = { name: value.name, description: value.description || '', targetDate: value.targetDate, responsiblePersonId: value.responsiblePersonId || '', status: value.status };
    baseline.current = draft; setMilestone(draft);
  };

  const saveMilestone = async (event: React.FormEvent) => {
    event.preventDefault();
    let id = editingMilestoneId;
    await persist(() => {
      const result = state.saveProjectMilestone(project.id, { ...milestone, id: id || undefined });
      id = result.id || id;
      return result;
    }, () => {
      const submitted = structuredClone(useStore.getState().projects.find(item => item.id === project.id)?.milestones?.find(item => item.id === id));
      return { milestone: true, matches: saved => sameSavedValue(saved?.milestones?.find(item => item.id === id), submitted) && Boolean(submitted) };
    });
  };

  return <ModalShell labelledBy="project-workspace-title" onClose={requestClose} overlayClassName="justify-end p-0 sm:p-0" panelClassName="h-full max-h-full w-full max-w-3xl rounded-none">
    <section className="flex h-full w-full max-w-3xl flex-col bg-surface shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === 'Closed' ? 'slate' : status === 'Completed' ? 'emerald' : 'blue'}>{t(status)}</Badge>
            <Badge tone={health.health === 'atRisk' ? 'red' : health.health === 'attentionRequired' ? 'amber' : 'emerald'}>{t(health.health === 'atRisk' ? 'At Risk' : health.health === 'attentionRequired' ? 'Attention Required' : 'On Track')}</Badge>
          </div>
          <h2 id="project-workspace-title" data-i18n-skip className="mt-2 truncate text-xl font-semibold tracking-tight text-ink">{project.projectName}</h2>
          <p data-i18n-skip className="mt-1 text-sm text-muted">{project.clientName}</p>
        </div>
        <button type="button" disabled={busy || hasPending} onClick={requestClose} className="rounded-control p-2 text-muted transition hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" aria-label={t('Close')}><X className="h-5 w-5" /></button>
      </header>

      <div className="px-5 pt-4 sm:px-6"><SegmentedTabs items={tabs.map(value => ({ id: value, label: t(value[0].toUpperCase() + value.slice(1)) }))} value={tab} onChange={value => setTab(value as Tab)} label={t('Project sections')} idPrefix="project-workspace" variant="underline" /></div>
      {message && <div className="mx-5 mt-4 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><SystemMessage message={message} /></div>}
      {hasPending && <div className="mx-5 mt-3 space-y-2"><BackendFreshness compact onDiscard={restorePending} /><Button disabled={busy} onClick={() => void persist(() => ({ ok: true }), () => pending.current!)}>{t('Retry pending save')}</Button></div>}

      <main className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {tab === 'overview' && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            {[[t('Open tasks'), health.openCount], [t('Overdue'), health.overdueCount], [t('Pending approvals'), health.pendingApprovalCount], [t('Milestones'), health.milestoneCount]].map(([label, value]) => <div key={String(label)} className="rounded-panel bg-inset p-4"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</p></div>)}
          </div>
          <section className="rounded-panel border border-line p-5">
            <h3 className="font-semibold text-ink">{t('Project status')}</h3>
            <p className="mt-1 text-sm leading-6 text-muted">{t('Active work can move to Completed, then Closed. Reopen a closed project before changing tasks or milestones.')}</p>
            {canManage && <div className="mt-4 flex flex-wrap gap-2">
              {status === 'Active' && <Button onClick={() => void changeStatus('Completed')} disabled={busy || hasPending}>{t('Mark completed')}</Button>}
              {status === 'Completed' && <><Button variant="secondary" onClick={() => void changeStatus('Active')} disabled={busy || hasPending}>{t('Return to active')}</Button><Button onClick={() => hasProjectClosureWarnings(warnings) ? setConfirmClosure(true) : void changeStatus('Closed')} disabled={busy || hasPending}>{t('Close project')}</Button></>}
              {status === 'Closed' && <Button onClick={() => void changeStatus('Active')} disabled={busy || hasPending}>{t('Reopen project')}</Button>}
            </div>}
          </section>
          {confirmClosure && <section className="rounded-panel border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="font-semibold">{t('Closure checklist warnings')}</h3><p className="mt-1 text-sm">{t('You can confirm closure unless this project requires a clear checklist.')}</p></div></div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div>{t('Outstanding tasks')}: {warnings.outstandingTasks}</div><div>{t('Pending approvals')}: {warnings.pendingApprovals}</div><div>{t('Overdue work')}: {warnings.overdueTasks}</div><div>{t('Incomplete milestones')}: {warnings.incompleteMilestones}</div></dl>
            <div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => setConfirmClosure(false)}>{t('Cancel')}</Button><Button onClick={() => void changeStatus('Closed', true)} disabled={busy || hasPending || project.requireClearClosureChecklist}>{t('Confirm closure')}</Button></div>
          </section>}
        </div>}

        {tab === 'tasks' && <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('Task list scope')}>
            {([['active', t('Active work')], ['completed', t('Completed')], ['all', t('All tasks')]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={taskScope === value} onClick={() => setTaskScope(value)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${taskScope === value ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-muted hover:bg-inset'}`}>
                {label} <span className="calm-number">{projectTasks.filter(task => isTaskInListScope(task, value)).length}</span>
              </button>
            ))}
          </div>
          {scopedProjectTasks.map(task => <article key={task.id} className="flex items-center justify-between gap-3 rounded-panel border border-line p-4"><div className="min-w-0"><p data-i18n-skip className="truncate font-semibold text-ink">{task.title}</p><p className="mt-1 text-xs text-muted">{t(task.status)} · {task.dueDate ? formatLocalizedDate(new Date(`${task.dueDate}T00:00:00`), locale) : t('No due date')}</p></div><Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} aria-disabled={busy || hasPending} onClick={event => { if (busy || hasPending || dirty) { event.preventDefault(); requestClose(); } else onClose(); }} className="rounded-control p-2 text-accent hover:bg-accent-soft"><ArrowRight className="h-4 w-4" /></Link></article>)}
          {!scopedProjectTasks.length && <p className="rounded-panel bg-inset px-5 py-10 text-center text-sm text-muted">{t(projectTasks.length && taskScope === 'active' ? 'No active tasks. Completed work stays under Completed.' : 'No tasks recorded')}</p>}
        </div>}

        {tab === 'team' && <div className="space-y-3">
          {members.map(member => <article key={member.id} className="flex items-center justify-between gap-4 rounded-panel border border-line p-4"><div><p data-i18n-skip className="font-semibold text-ink">{member.name}</p><p className="mt-1 text-xs text-muted">{t(member.role)}{project.memberResponsibilities?.[member.id] ? ` · ${project.memberResponsibilities[member.id]}` : ''}</p></div><Badge tone={member.role === 'Project Manager' ? 'purple' : member.role === 'HOD' ? 'blue' : 'slate'}>{t(member.role)}</Badge></article>)}
          {!members.length && <p className="rounded-panel bg-inset px-5 py-10 text-center text-sm text-muted">{t('No project members assigned.')}</p>}
          {canManage && <Button variant="secondary" disabled={busy || hasPending || dirty} onClick={() => onEdit(project)}><Users className="h-4 w-4" />{t('Manage team')}</Button>}
        </div>}

        {tab === 'milestones' && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-3">{(project.milestones || []).map(item => { const progress = milestoneTaskProgress(item.id, projectTasks); const effective = effectiveMilestoneStatus(item, projectTasks); return <article key={item.id} className="rounded-panel border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p data-i18n-skip className="font-semibold text-ink">{item.name}</p><p className="mt-1 text-xs text-muted">{formatLocalizedDate(new Date(`${item.targetDate}T00:00:00`), locale)}</p></div><Badge tone={effective === 'Delayed' ? 'red' : effective === 'Completed' ? 'emerald' : 'slate'}>{t(effective)}</Badge></div>{item.description && <p data-i18n-skip className="mt-3 text-sm leading-6 text-muted">{item.description}</p>}{progress.percent !== undefined && <div className="mt-3"><div className="flex justify-between text-xs text-muted"><span>{progress.completedCount}/{progress.taskCount} {t('tasks')}</span><span>{progress.percent}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-inset"><div className="h-full bg-accent" style={{ width: `${progress.percent}%` }} /></div></div>}{canManage && <div className="mt-3 flex gap-2"><Button variant="secondary" disabled={busy || hasPending} onClick={() => editMilestone(item.id)}>{t('Edit')}</Button><Button variant="danger" disabled={busy || hasPending} onClick={() => void persist(() => state.deleteProjectMilestone(project.id, item.id), () => ({ milestone: false, matches: saved => Boolean(saved) && !saved?.milestones?.some(value => value.id === item.id) }))}>{t('Delete')}</Button></div>}</article>; })}{!(project.milestones || []).length && <p className="rounded-panel bg-inset px-5 py-10 text-center text-sm text-muted">{t('Milestones are optional. Add one when a project needs a dated checkpoint.')}</p>}</div>
          {canManage && status !== 'Closed' && <form onSubmit={saveMilestone} className="space-y-3 rounded-panel border border-line p-4"><fieldset disabled={busy || hasPending} className="space-y-3"><h3 className="font-semibold text-ink">{t(editingMilestoneId ? 'Edit milestone' : 'Add milestone')}</h3><input required maxLength={160} value={milestone.name} onChange={event => setMilestone(value => ({ ...value, name: event.target.value }))} placeholder={t('Milestone name')} className="min-h-11 w-full rounded-control border border-line bg-surface px-3" /><textarea maxLength={2000} value={milestone.description} onChange={event => setMilestone(value => ({ ...value, description: event.target.value }))} placeholder={t('Description (optional)')} className="min-h-24 w-full rounded-control border border-line bg-surface px-3 py-2" /><input required type="date" value={milestone.targetDate} onChange={event => setMilestone(value => ({ ...value, targetDate: event.target.value }))} className="min-h-11 w-full rounded-control border border-line bg-surface px-3" /><select value={milestone.responsiblePersonId} onChange={event => setMilestone(value => ({ ...value, responsiblePersonId: event.target.value }))} className="min-h-11 w-full rounded-control border border-line bg-surface px-3"><option value="">{t('No responsible person')}</option>{members.map(member => <option key={member.id} value={member.id} data-i18n-skip>{member.name}</option>)}</select><select value={milestone.status} onChange={event => setMilestone(value => ({ ...value, status: event.target.value as ProjectMilestoneStatus }))} className="min-h-11 w-full rounded-control border border-line bg-surface px-3">{milestoneStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}</select><Button type="submit" disabled={busy || hasPending}><Flag className="h-4 w-4" />{t('Save milestone')}</Button></fieldset></form>}
        </div>}

        {tab === 'settings' && <div className="space-y-4"><section className="rounded-panel border border-line p-5"><div className="flex items-start gap-3"><Settings2 className="mt-0.5 h-5 w-5 text-accent" /><div><h3 className="font-semibold text-ink">{t('Approval settings')}</h3><p className="mt-1 text-sm text-muted">{t('Project default')}: {t(project.defaultApprovalMode === 'hod' ? 'HOD approval' : project.defaultApprovalMode === 'pm' ? 'PM approval' : 'No approval')}</p><p className="mt-1 text-xs leading-5 text-muted">{t('Task-level overrides remain unchanged.')}</p></div></div></section><section className="rounded-panel border border-line p-5"><div className="flex items-start gap-3">{project.requireClearClosureChecklist ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <CircleDot className="mt-0.5 h-5 w-5 text-muted" />}<div><h3 className="font-semibold text-ink">{t('Closure requirement')}</h3><p className="mt-1 text-sm text-muted">{t(project.requireClearClosureChecklist ? 'All checklist warnings must be resolved before closure.' : 'Warnings are advisory and may be confirmed by the Project Manager.')}</p></div></div></section>{canManage && <Button disabled={busy || hasPending || dirty} onClick={() => onEdit(project)}><FolderKanban className="h-4 w-4" />{t('Edit project settings')}</Button>}</div>}
      </main>
    </section>
  </ModalShell>;
}
