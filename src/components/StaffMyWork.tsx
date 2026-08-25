import React from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Layers3, ListChecks, RotateCcw, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getDashboardPersona, getVisibleClientNames, getVisibleTasks } from '../lib/access';
import { buildStaffWorkQueue, getStaffBucketLabel, getStaffFocusTask, type StaffWorkBucketKey } from '../lib/staffWorkspace';
import { getRelativeDueDateString, getTodayInputDate } from '../lib/utils';
import { pageShell } from './uiTokens';
import { Button, StatusChip, Surface } from './ui';
import BackendFreshness from './BackendFreshness';
import StaffWorkItem from './StaffWorkItem';

const bucketOrder: StaffWorkBucketKey[] = ['needs_action', 'up_next', 'waiting', 'done'];

const StaffMyWork: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, tasks: allTasks, projects, rolePermissions, clientPlans } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    tasks: state.tasks,
    projects: state.projects,
    rolePermissions: state.rolePermissions,
    clientPlans: state.clientPlans,
  })));
  const today = getTodayInputDate();
  const tasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions).filter(task => task.assignedTo === currentUser?.id),
    [allTasks, currentUser, rolePermissions],
  );
  const queue = React.useMemo(() => buildStaffWorkQueue(tasks, today), [tasks, today]);
  const focusTask = getStaffFocusTask(queue);
  const defaultBucket = queue.needs_action.length > 0 ? 'needs_action' : queue.up_next.length > 0 ? 'up_next' : queue.waiting.length > 0 ? 'waiting' : 'done';
  const [activeBucket, setActiveBucket] = React.useState<StaffWorkBucketKey>(defaultBucket);

  React.useEffect(() => {
    if (queue[activeBucket].length > 0) return;
    setActiveBucket(defaultBucket);
  }, [activeBucket, defaultBucket, queue]);

  const incompleteTaskIds = new Set(tasks.filter(task => !task.isCompleted && task.status !== 'Completed').map(task => task.id));
  const blockedCount = tasks.filter(task => (task.predecessorTaskIds || []).some(id => incompleteTaskIds.has(id))).length;
  const persona = getDashboardPersona(currentUser);
  const visibleClients = getVisibleClientNames(currentUser, allTasks, projects, rolePermissions);
  const visibleClientKeys = new Set(visibleClients.map(name => name.trim().toLowerCase()));
  const activePlans = clientPlans.filter(plan => plan.status === 'Active' && visibleClientKeys.has(plan.clientName.trim().toLowerCase()));
  const renewals = activePlans.filter(plan => Boolean(plan.contractEndDate && plan.contractEndDate >= today && plan.contractEndDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)));
  const linkedOutputs = new Set(tasks.map(task => task.deliverableId).filter(Boolean)).size;
  const dueToday = tasks.filter(task => !task.isCompleted && task.dueDate === today).length;
  const waitingReview = queue.waiting.length;
  const revisions = tasks.filter(task => !task.isCompleted && task.revisionCount > 0).length;
  const roleInsight = persona === 'operation'
    ? { title: 'Operation context', description: 'Your assigned delivery and review queue.', values: [['Due today', dueToday], ['Waiting review', waitingReview], ['Blocked steps', blockedCount]] as const }
    : persona === 'account'
      ? { title: 'Account context', description: 'Clients and plans connected to your assigned work.', values: [['Assigned clients', visibleClients.length], ['Active plans', activePlans.length], ['Renewals', renewals.length]] as const }
      : { title: 'Production context', description: 'Output, blockers, and revision work linked to your assignments.', values: [['Linked outputs', linkedOutputs], ['Blocked steps', blockedCount], ['Revisions', revisions]] as const };

  const openTask = (taskId: string) => navigate(`/tasks?taskId=${encodeURIComponent(taskId)}`);

  return (
    <div className={`${pageShell} max-w-6xl space-y-6`}>
      <header className="flex items-start justify-between gap-4 border-b border-line/70 pb-4 sm:items-end">
        <div>
          <p className="calm-eyebrow">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-9 tracking-[-0.045em] text-ink sm:text-4xl">My work</h1>
          <p className="mt-1 max-w-[55ch] text-sm leading-6 text-muted">Start with what needs attention, then move through the rest of your assigned work.</p>
        </div>
        <BackendFreshness />
      </header>

      {focusTask ? (
        <section aria-labelledby="staff-focus-title" className="relative overflow-hidden rounded-panel bg-[rgb(var(--calm-accent-ink))] p-5 text-white shadow-float sm:p-6 dark:bg-inset dark:text-ink">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/65 dark:text-muted"><Sparkles className="h-4 w-4" />Your next move</p>
              <h2 data-i18n-skip id="staff-focus-title" className="mt-3 text-balance text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{focusTask.title}</h2>
              <p data-i18n-skip className="mt-2 truncate text-sm text-white/70 dark:text-muted">{focusTask.clientName}{focusTask.projectName ? ` · ${focusTask.projectName}` : ''}</p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <StatusChip tone={focusTask.revisionCount > 0 ? 'amber' : focusTask.status === 'In Progress' ? 'blue' : 'slate'}>{focusTask.revisionCount > 0 ? `Revision ${focusTask.revisionCount}` : focusTask.status}</StatusChip>
                <span className="rounded-tag bg-white/10 px-2 py-1 text-white/80 ring-1 ring-white/10 dark:bg-surface dark:text-muted dark:ring-line">{getRelativeDueDateString(focusTask.dueDate, focusTask.isCompleted, focusTask.status)}</span>
                <span className="rounded-tag bg-white/10 px-2 py-1 text-white/80 ring-1 ring-white/10 dark:bg-surface dark:text-muted dark:ring-line">{focusTask.priority}</span>
              </div>
              {focusTask.status === 'In Progress' && (
                <div className="mt-5 max-w-md">
                  <div className="flex items-center justify-between text-xs font-medium text-white/65 dark:text-muted"><span>Current task progress</span><span className="calm-number">{focusTask.completionPercentage}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15 dark:bg-line"><div className="h-full rounded-full bg-accent dark:bg-accent" style={{ width: `${focusTask.completionPercentage}%` }} /></div>
                </div>
              )}
            </div>
            <Button onClick={() => openTask(focusTask.id)} className="w-full bg-white text-[rgb(var(--calm-accent-ink))] hover:bg-white/90 dark:bg-accent dark:text-[rgb(var(--calm-accent-ink))] lg:w-auto">
              Open task <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : (
        <Surface variant="raised" className="p-6 sm:p-8">
          <CheckCircle2 className="h-9 w-9 text-accent" />
          <h2 className="mt-4 text-xl font-semibold text-ink">Your assigned queue is clear</h2>
          <p className="mt-1 max-w-[52ch] text-sm leading-6 text-muted">New assignments will appear here. You can still review completed work or create a secondary task from More.</p>
        </Surface>
      )}

      <section aria-labelledby="staff-queue-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 id="staff-queue-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">Assigned queue</h2><p className="mt-1 text-sm text-muted">Work is ordered by revision, deadline, state, and priority.</p></div>
          <Link to="/tasks" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline">All work <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div role="tablist" aria-label="Staff work queue" className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-line">
          {bucketOrder.map(bucket => (
            <button key={bucket} type="button" role="tab" aria-selected={activeBucket === bucket} onClick={() => setActiveBucket(bucket)} className={`relative min-h-11 shrink-0 px-3 text-sm font-semibold transition-colors duration-160 ${activeBucket === bucket ? 'text-accent after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:text-ink'}`}>
              {getStaffBucketLabel(bucket)} <span className="calm-number ml-1 text-xs">{queue[bucket].length}</span>
            </button>
          ))}
        </div>
        <Surface className="mt-3 overflow-hidden divide-y divide-line/70">
          {queue[activeBucket].slice(0, 8).map(task => <StaffWorkItem key={task.id} task={task} allTasks={tasks} onOpen={item => openTask(item.id)} />)}
          {queue[activeBucket].length === 0 && <div className="px-5 py-12 text-center"><ListChecks className="mx-auto h-7 w-7 text-muted/60" /><p className="mt-3 text-sm font-semibold text-ink">Nothing in {getStaffBucketLabel(activeBucket).toLowerCase()}</p><p className="mt-1 text-sm text-muted">Choose another queue to review your work.</p></div>}
        </Surface>
      </section>

      <Surface variant="inset" className="overflow-hidden" aria-labelledby="staff-role-context">
        <div className="flex items-start gap-3 px-5 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface text-accent"><Layers3 className="h-5 w-5" /></span><div><h2 id="staff-role-context" className="font-semibold text-ink">{roleInsight.title}</h2><p className="mt-0.5 text-sm text-muted">{roleInsight.description}</p></div></div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-surface/60">
          {roleInsight.values.map(([label, value]) => <div key={label} className="px-3 py-4 sm:px-5"><p className="calm-number text-xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs leading-4 text-muted">{label}</p></div>)}
        </div>
      </Surface>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link to="/calendar" className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent hover:underline"><CalendarDays className="h-4 w-4" />Open schedule</Link>
        <Link to="/notifications" className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent hover:underline"><Clock3 className="h-4 w-4" />Check inbox</Link>
        {revisions > 0 && <span className="inline-flex items-center gap-2 text-amber-700"><RotateCcw className="h-4 w-4" />{revisions} active revision{revisions === 1 ? '' : 's'}</span>}
      </div>
    </div>
  );
};

export default StaffMyWork;
