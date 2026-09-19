import React from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, ListChecks, RotateCcw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getDashboardPersona, getVisibleClientNames, getVisibleTasks, isHodUser } from '../lib/access';
import { buildStaffWorkQueue, getStaffBucketLabel, getStaffFocusTask, type StaffWorkBucketKey } from '../lib/staffWorkspace';
import { getRelativeDueDateString, getTodayInputDate } from '../lib/utils';
import { pageShell } from './uiTokens';
import { Button, MetaLine, SegmentedTabs, StatusChip, Surface } from './ui';
import BackendFreshness from './BackendFreshness';
import StaffWorkItem from './StaffWorkItem';
import { formatLocalizedWeekdayDate } from '../lib/i18n';
import { useI18n } from './I18nProvider';

const bucketOrder: StaffWorkBucketKey[] = ['needs_action', 'up_next', 'waiting', 'done'];

const StaffMyWork: React.FC = () => {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const { currentUser, tasks: allTasks, clients, projects, users, rolePermissions, clientPlans } = useStore(useShallow(state => ({
    currentUser: state.currentUser,
    tasks: state.tasks,
    clients: state.clients,
    projects: state.projects,
    users: state.users,
    rolePermissions: state.rolePermissions,
    clientPlans: state.clientPlans,
  })));
  const today = getTodayInputDate();
  const isHod = isHodUser(currentUser, rolePermissions);
  const tasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients, projects })
      .filter(task => isHod || task.assignedTo === currentUser?.id),
    [allTasks, clients, currentUser, isHod, projects, rolePermissions],
  );
  const queue = React.useMemo(() => buildStaffWorkQueue(tasks, today), [tasks, today]);
  const focusTask = getStaffFocusTask(queue);
  const defaultBucket = queue.needs_action.length > 0 ? 'needs_action' : queue.up_next.length > 0 ? 'up_next' : queue.waiting.length > 0 ? 'waiting' : 'done';
  const [activeBucket, setActiveBucket] = React.useState<StaffWorkBucketKey>(defaultBucket);
  const hasSelectedBucketRef = React.useRef(false);

  React.useEffect(() => {
    if (!hasSelectedBucketRef.current) setActiveBucket(defaultBucket);
  }, [defaultBucket]);

  const incompleteTaskIds = new Set(tasks.filter(task => !task.isCompleted && task.status !== 'Completed').map(task => task.id));
  const blockedCount = tasks.filter(task => (task.predecessorTaskIds || []).some(id => incompleteTaskIds.has(id))).length;
  const persona = getDashboardPersona(currentUser);
  const visibleClients = getVisibleClientNames(currentUser, allTasks, projects, rolePermissions, { clients, projects });
  const visibleClientKeys = new Set(visibleClients.map(name => name.trim().toLowerCase()));
  const activePlans = clientPlans.filter(plan => plan.status === 'Active' && visibleClientKeys.has(plan.clientName.trim().toLowerCase()));
  const renewals = activePlans.filter(plan => Boolean(plan.contractEndDate && plan.contractEndDate >= today && plan.contractEndDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)));
  const linkedOutputs = new Set(tasks.map(task => task.deliverableId).filter(Boolean)).size;
  const dueToday = tasks.filter(task => !task.isCompleted && task.dueDate === today).length;
  const waitingReview = queue.waiting.length;
  const revisions = tasks.filter(task => !task.isCompleted && task.revisionCount > 0).length;
  const roleInsight = persona === 'operation'
    ? { title: t('Operation context'), description: t('Your assigned delivery and review queue.'), values: [[t('Due today'), dueToday], [t('Waiting review'), waitingReview], [t('Blocked steps'), blockedCount]] as const }
    : persona === 'account'
      ? { title: t('Account context'), description: t('Clients and plans connected to your assigned work.'), values: [[t('Assigned clients'), visibleClients.length], [t('Active plans'), activePlans.length], [t('Renewals'), renewals.length]] as const }
    : isHod
      ? { title: t('Department context'), description: t('Department workload, delegated tasks, and review risk.'), values: [[t('Department tasks'), tasks.length], [t('Waiting review'), waitingReview], [t('Blocked steps'), blockedCount]] as const }
      : { title: t('Production context'), description: t('Output, blockers, and revision work linked to your assignments.'), values: [[t('Linked outputs'), linkedOutputs], [t('Blocked steps'), blockedCount], [t('Revisions'), revisions]] as const };

  const openTask = (taskId: string) => navigate(`/tasks?taskId=${encodeURIComponent(taskId)}`);

  return (
    <div className={`${pageShell} max-w-6xl space-y-6`}>
      <header className="flex items-start justify-between gap-4 border-b border-line/70 pb-4 sm:items-end">
        <div>
          <p className="calm-eyebrow">{formatLocalizedWeekdayDate(new Date(), locale)}</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-9 tracking-[-0.045em] text-ink sm:text-4xl">{isHod ? t('Department work') : t('My work')}</h1>
          <p className="mt-1 max-w-[55ch] text-sm leading-6 text-muted">{isHod ? t('Start with what needs attention, then review delegated work across your departments.') : t('Start with what needs attention, then move through the rest of your assigned work.')}</p>
        </div>
        <BackendFreshness />
      </header>

      {focusTask ? (
        <section aria-labelledby="staff-focus-title" className="calm-raised border-l-2 border-accent p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="calm-eyebrow">{t('Next due')}</p>
              <h2 data-i18n-skip id="staff-focus-title" className="mt-2 text-balance text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">{focusTask.title}</h2>
              <MetaLine className="mt-2"><span data-i18n-skip>{focusTask.clientName}{focusTask.projectName ? ` · ${focusTask.projectName}` : ''}</span> · {t('Assigned')}</MetaLine>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <StatusChip tone={focusTask.revisionCount > 0 ? 'amber' : focusTask.status === 'In Progress' ? 'blue' : 'slate'}>{focusTask.revisionCount > 0 ? `${t('Revision')} ${focusTask.revisionCount}` : t(focusTask.status)}</StatusChip>
                <span className="calm-meta">{getRelativeDueDateString(focusTask.dueDate, focusTask.isCompleted, focusTask.status)}</span>
                <span className="calm-meta">{t('Priority')}: {t(focusTask.priority)}</span>
              </div>
              {focusTask.status === 'In Progress' && (
                <div className="mt-5 max-w-md">
                  <div className="flex items-center justify-between text-xs font-medium text-muted"><span>{t('Task progress')}</span><span className="calm-number text-ink">{focusTask.completionPercentage}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-inset ring-1 ring-line/60"><div className="h-full rounded-full bg-accent" style={{ width: `${focusTask.completionPercentage}%` }} /></div>
                </div>
              )}
            </div>
            <Button onClick={() => openTask(focusTask.id)} className="w-full lg:w-auto">
              Open work <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : (
        <Surface variant="raised" className="p-6 sm:p-8">
          <CheckCircle2 className="h-9 w-9 text-accent" />
          <h2 className="mt-4 text-xl font-semibold text-ink">{isHod ? t('Your department queue is clear') : t('Your assigned queue is clear')}</h2>
          <p className="mt-1 max-w-[52ch] text-sm leading-6 text-muted">{isHod ? t('Delegated work in your departments will appear here. You can still review completed work or open the full workbench.') : t('New assignments will appear here. You can still review completed work or create a secondary task from More.')}</p>
        </Surface>
      )}

      <section aria-labelledby="staff-queue-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 id="staff-queue-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">{isHod ? t('Department queue') : t('Assigned queue')}</h2><p className="mt-1 text-sm text-muted">{t('Work is ordered by revision, deadline, state, and priority.')}</p></div>
          <Link to="/tasks?period=all" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink hover:text-accent hover:underline">{t('All work')} <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-4">
          <SegmentedTabs<StaffWorkBucketKey>
            items={bucketOrder.map(bucket => ({ id: bucket, label: getStaffBucketLabel(bucket), count: queue[bucket].length }))}
            value={activeBucket}
            onChange={bucket => {
              hasSelectedBucketRef.current = true;
              setActiveBucket(bucket);
            }}
            label="Staff work queue"
            idPrefix="staff-queue"
            variant="underline"
          />
        </div>
        <Surface id={`staff-queue-panel-${activeBucket}`} role="tabpanel" aria-labelledby={`staff-queue-tab-${activeBucket}`} tabIndex={0} className="mt-3 overflow-hidden divide-y divide-line/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {queue[activeBucket].slice(0, 8).map(task => <StaffWorkItem key={task.id} task={task} allTasks={tasks} users={users} onOpen={item => openTask(item.id)} />)}
          {queue[activeBucket].length === 0 && <div className="px-5 py-12 text-center"><ListChecks className="mx-auto h-7 w-7 text-muted/60" /><p className="mt-3 text-sm font-semibold text-ink">Nothing in {getStaffBucketLabel(activeBucket).toLowerCase()}</p><p className="mt-1 text-sm text-muted">Choose another queue to review your work.</p></div>}
        </Surface>
      </section>

      <Surface variant="inset" className="overflow-hidden" aria-labelledby="staff-role-context">
        <div className="px-5 py-4"><h2 id="staff-role-context" className="font-semibold text-ink">{roleInsight.title}</h2><p className="mt-0.5 text-sm text-muted">{roleInsight.description}</p></div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-surface/60">
          {roleInsight.values.map(([label, value]) => <div key={label} className="px-3 py-4 sm:px-5"><p className="calm-number text-xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs leading-4 text-muted">{label}</p></div>)}
        </div>
      </Surface>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link to="/calendar" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink hover:text-accent hover:underline"><CalendarDays className="h-4 w-4" />Open schedule</Link>
        <Link to="/notifications" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink hover:text-accent hover:underline"><Clock3 className="h-4 w-4" />Check inbox</Link>
        {revisions > 0 && <span className="inline-flex items-center gap-2 text-amber-700"><RotateCcw className="h-4 w-4" />{t(`${revisions} active revision${revisions === 1 ? '' : 's'}`)}</span>}
      </div>
    </div>
  );
};

export default StaffMyWork;
