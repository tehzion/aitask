import React from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, ListChecks, RotateCcw } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { getDashboardPersona, getVisibleClientNames, getVisibleTasks, isHodUser } from '../lib/access';
import { buildStaffWorkQueue, getHodScopeTasks, getTaskBlockers, type HodWorkScope, getStaffBucketLabel, getStaffFocusTask, type StaffWorkBucketKey } from '../lib/staffWorkspace';
import { getMemberDepartments, isMemberInDepartment } from '../lib/departments';
import { getTeamWorkloadSummaries, isTaskOpen } from '../lib/taskReporting';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const scope: HodWorkScope = searchParams.get('scope') === 'mine' ? 'mine' : searchParams.get('scope') === 'delegated' ? 'delegated' : 'department';
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
  const visibleTasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients, projects })
      .filter(task => isHod || task.assignedTo === currentUser?.id),
    [allTasks, clients, currentUser, isHod, projects, rolePermissions],
  );
  const tasks = React.useMemo(() => isHod ? getHodScopeTasks(visibleTasks, currentUser?.id, scope) : visibleTasks, [currentUser?.id, isHod, scope, visibleTasks]);
  const departmentTasks = React.useMemo(() => visibleTasks.filter(task => isMemberInDepartment(currentUser, task.department)), [currentUser, visibleTasks]);
  const workload = React.useMemo(() => {
    if (!isHod || !currentUser) return [];
    const members = users.filter(member => getMemberDepartments(currentUser).some(department => isMemberInDepartment(member, department)));
    return getTeamWorkloadSummaries(departmentTasks, members, 'overall')
      .sort((left, right) => right.overdue - left.overdue || right.open - left.open || left.member.name.localeCompare(right.member.name));
  }, [currentUser, departmentTasks, isHod, users]);
  const queue = React.useMemo(() => buildStaffWorkQueue(tasks, today), [tasks, today]);
  const focusTask = getStaffFocusTask(queue);
  const defaultBucket = queue.needs_action.length > 0 ? 'needs_action' : queue.up_next.length > 0 ? 'up_next' : queue.waiting.length > 0 ? 'waiting' : 'done';
  const [activeBucket, setActiveBucket] = React.useState<StaffWorkBucketKey>(defaultBucket);
  const hasSelectedBucketRef = React.useRef(false);

  React.useEffect(() => {
    if (!hasSelectedBucketRef.current) setActiveBucket(defaultBucket);
  }, [defaultBucket, scope]);

  const reportableTasks = tasks.filter(task => task.status !== 'Cancelled');
  const blockedCount = tasks.filter(task => getTaskBlockers(task, visibleTasks).length > 0).length;
  const persona = getDashboardPersona(currentUser);
  const visibleClients = getVisibleClientNames(currentUser, allTasks, projects, rolePermissions, { clients, projects });
  const visibleClientKeys = new Set(visibleClients.map(name => name.trim().toLowerCase()));
  const activePlans = clientPlans.filter(plan => plan.status === 'Active' && visibleClientKeys.has(plan.clientName.trim().toLowerCase()));
  const renewals = activePlans.filter(plan => Boolean(plan.contractEndDate && plan.contractEndDate >= today && plan.contractEndDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)));
  const linkedOutputs = new Set(reportableTasks.map(task => task.deliverableId).filter(Boolean)).size;
  const dueToday = tasks.filter(task => isTaskOpen(task) && task.dueDate === today).length;
  const waitingReview = queue.waiting.length;
  const revisions = tasks.filter(task => isTaskOpen(task) && task.revisionCount > 0).length;
  const roleInsight = isHod
    ? { title: t('Department context'), description: t('Department workload, delegated tasks, and review risk.'), values: [[t('Active tasks'), departmentTasks.filter(isTaskOpen).length], [t('Waiting review'), departmentTasks.filter(task => isTaskOpen(task) && task.status === 'Waiting Approval').length], [t('Blocked steps'), departmentTasks.filter(task => getTaskBlockers(task, visibleTasks).length > 0).length]] as const }
    : persona === 'operation'
    ? { title: t('Operation context'), description: t('Your assigned delivery and review queue.'), values: [[t('Due today'), dueToday], [t('Waiting review'), waitingReview], [t('Blocked steps'), blockedCount]] as const }
    : persona === 'account'
      ? { title: t('Account context'), description: t('Clients and plans connected to your assigned work.'), values: [[t('Assigned clients'), visibleClients.length], [t('Active plans'), activePlans.length], [t('Renewals'), renewals.length]] as const }
    : { title: t('Production context'), description: t('Output, blockers, and revision work linked to your assignments.'), values: [[t('Linked outputs'), linkedOutputs], [t('Blocked steps'), blockedCount], [t('Revisions'), revisions]] as const };

  const openTask = (taskId: string) => {
    const params = new URLSearchParams({ taskId });
    if (isHod) params.set('scope', scope);
    navigate(`/tasks?${params}`);
  };

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

      {isHod && <SegmentedTabs<HodWorkScope>
        items={[
          { id: 'mine', label: t('My assignments'), count: getHodScopeTasks(visibleTasks, currentUser?.id, 'mine').filter(isTaskOpen).length },
          { id: 'delegated', label: t('Delegated by me'), count: getHodScopeTasks(visibleTasks, currentUser?.id, 'delegated').filter(isTaskOpen).length },
          { id: 'department', label: t('Department work'), count: visibleTasks.filter(isTaskOpen).length },
        ]}
        value={scope}
        onChange={value => {
          hasSelectedBucketRef.current = false;
          setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('scope', value); return next; }, { replace: true });
        }}
        label={t('HOD work scope')}
        idPrefix="hod-dashboard-scope"
        panelId="hod-dashboard-work"
        variant="underline"
      />}
      <div id="hod-dashboard-work" role={isHod ? 'tabpanel' : undefined} aria-labelledby={isHod ? `hod-dashboard-scope-tab-${scope}` : undefined} tabIndex={isHod ? 0 : undefined} className="space-y-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
      {focusTask ? (
        <section aria-labelledby="staff-focus-title" className="calm-raised border-l-2 border-accent p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="calm-eyebrow">{t('Needs attention')}</p>
              <h2 data-i18n-skip id="staff-focus-title" className="mt-2 text-balance text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl">{focusTask.title}</h2>
              <MetaLine className="mt-2"><span data-i18n-skip>{focusTask.clientName}{focusTask.projectName ? ` · ${focusTask.projectName}` : ''}</span> · {t('Assigned')}: <span data-i18n-skip>{users.find(member => member.id === focusTask.assignedTo)?.name || t('Unassigned')}</span></MetaLine>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <StatusChip tone={focusTask.revisionCount > 0 ? 'amber' : focusTask.status === 'In Progress' ? 'blue' : 'slate'}>{focusTask.revisionCount > 0 ? `${t('Revision')} ${focusTask.revisionCount}` : t(focusTask.status)}</StatusChip>
                <span className="calm-meta">{getRelativeDueDateString(focusTask.dueDate, focusTask.isCompleted, focusTask.status, locale)}</span>
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
              {t('Open work')} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      ) : (
        <Surface variant="raised" className="p-6 sm:p-8">
          {queue.waiting.length > 0 ? <Clock3 aria-hidden="true" className="h-9 w-9 text-accent" /> : <CheckCircle2 aria-hidden="true" className="h-9 w-9 text-accent" />}
          <h2 className="mt-4 text-xl font-semibold text-ink">{queue.waiting.length > 0 ? t('Waiting for review') : isHod && scope === 'department' ? t('Your department queue is clear') : t('Your assigned queue is clear')}</h2>
          <p className="mt-1 max-w-[52ch] text-sm leading-6 text-muted">{queue.waiting.length > 0 ? <>{queue.waiting.length} {t('Waiting review')}</> : isHod ? t('Delegated work in your departments will appear here. You can still review completed work or open the full workbench.') : t('New assignments will appear here. You can still review completed work or create a secondary task from More.')}</p>
        </Surface>
      )}

      <section aria-labelledby="staff-queue-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 id="staff-queue-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">{isHod && scope === 'department' ? t('Department queue') : isHod && scope === 'delegated' ? t('Delegated by me') : t('Assigned queue')}</h2><p className="mt-1 text-sm text-muted">{t('Work is ordered by revision, deadline, state, and priority.')}</p></div>
          <Link to={isHod ? `/tasks?scope=${scope}` : "/tasks?period=all"} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink hover:text-accent hover:underline">{t('All work')} <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-4">
          <SegmentedTabs<StaffWorkBucketKey>
            items={bucketOrder.map(bucket => ({ id: bucket, label: t(getStaffBucketLabel(bucket)), count: queue[bucket].length }))}
            value={activeBucket}
            onChange={bucket => {
              hasSelectedBucketRef.current = true;
              setActiveBucket(bucket);
            }}
            label={t('Staff work queue')}
            idPrefix="staff-queue"
            variant="underline"
          />
        </div>
        <Surface id={`staff-queue-panel-${activeBucket}`} role="tabpanel" aria-labelledby={`staff-queue-tab-${activeBucket}`} tabIndex={0} className="mt-3 overflow-hidden divide-y divide-line/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {queue[activeBucket].slice(0, 8).map(task => <StaffWorkItem key={task.id} task={task} allTasks={visibleTasks} users={users} onOpen={item => openTask(item.id)} />)}
          {queue[activeBucket].length === 0 && <div className="px-5 py-12 text-center"><ListChecks className="mx-auto h-7 w-7 text-muted/60" aria-hidden="true" /><p className="mt-3 text-sm font-semibold text-ink">{t('Nothing in')} {t(getStaffBucketLabel(activeBucket))}</p><p className="mt-1 text-sm text-muted">{t('Choose another queue to review your work.')}</p></div>}
        </Surface>
      </section>

      </div>

      <Surface variant="inset" className="overflow-hidden" aria-labelledby="staff-role-context">
        <div className="px-5 py-4"><h2 id="staff-role-context" className="font-semibold text-ink">{roleInsight.title}</h2><p className="mt-0.5 text-sm text-muted">{roleInsight.description}</p></div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-surface/60">
          {roleInsight.values.map(([label, value]) => <div key={label} className="px-3 py-4 sm:px-5"><p className="calm-number text-xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs leading-4 text-muted">{label}</p></div>)}
        </div>
      </Surface>

      {isHod && <section aria-labelledby="hod-workload-title">
        <h2 id="hod-workload-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">{t('Department workload')}</h2>
        <p className="mt-1 text-sm text-muted">{t('Visible department work only.')}</p>
        <Surface className="mt-4 divide-y divide-line/70 overflow-hidden">
          {workload.map(summary => <Link key={summary.member.id} to={`/tasks?scope=department&assignee=${encodeURIComponent(summary.member.id)}`} className="block px-5 py-4 hover:bg-inset/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40">
            <div className="flex items-center justify-between gap-3"><span data-i18n-skip className="font-semibold text-ink">{summary.member.name}</span><ArrowRight aria-hidden="true" className="h-4 w-4 text-muted" /></div>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-muted">{t('Active tasks')}</dt><dd className="calm-number mt-1 font-semibold text-ink">{summary.open}</dd></div>
              <div><dt className="text-xs text-muted">{t('Overdue')}</dt><dd className="calm-number mt-1 font-semibold text-ink">{summary.overdue}</dd></div>
              <div><dt className="text-xs text-muted">{t('Due this week')}</dt><dd className="calm-number mt-1 font-semibold text-ink">{summary.dueThisWeek}</dd></div>
            </dl>
          </Link>)}
          {workload.length === 0 && <p className="px-5 py-8 text-sm text-muted">{t('No department members available.')}</p>}
        </Surface>
      </section>}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link to="/calendar" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink hover:text-accent hover:underline"><CalendarDays className="h-4 w-4" aria-hidden="true" />{t('Open schedule')}</Link>
        <Link to="/notifications" className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink hover:text-accent hover:underline"><Clock3 className="h-4 w-4" aria-hidden="true" />{t('Check inbox')}</Link>
        {revisions > 0 && <span className="inline-flex items-center gap-2 text-amber-700"><RotateCcw className="h-4 w-4" />{t(`${revisions} active revision${revisions === 1 ? '' : 's'}`)}</span>}
      </div>
    </div>
  );
};

export default StaffMyWork;
