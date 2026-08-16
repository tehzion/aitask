import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileCheck2, UsersRound, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isBefore, isToday } from 'date-fns';
import { useStore } from '../store';
import { canViewServicePrices, getClientKey, getDashboardPersona, getVisibleClientNames, getVisibleTasks } from '../lib/access';
import { formatMoney } from '../lib/serviceManagement';
import { parseOptionalDate } from '../lib/utils';
import { DataRow, ProgressBar, StatGroup, StatusChip, Surface } from './ui';

type WorkspaceTask = ReturnType<typeof useStore.getState>['tasks'][number];

const WorkbenchHeader = ({ id, title, description, action }: { id: string; title: string; description: string; action?: React.ReactNode }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div><h2 id={id} className="text-xl font-semibold tracking-[-0.025em] text-ink">{title}</h2><p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted">{description}</p></div>
    {action}
  </div>
);

const SpotlightMetric = ({ label, value, icon: Icon, detail, tone = 'accent' }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; detail: string; tone?: 'accent' | 'danger' }) => (
  <div className={`calm-raised min-h-44 border-l-2 p-5 sm:p-6 ${tone === 'danger' ? 'border-red-500' : 'border-accent'}`}>
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted">{label}</p><span className={tone === 'danger' ? 'rounded-control bg-red-50 p-2 text-red-700' : 'rounded-control bg-accent-soft p-2 text-accent'}><Icon className="h-5 w-5" /></span></div>
      <div><p className="calm-number text-4xl font-semibold tracking-[-0.055em] text-ink">{value}</p><p className="mt-2 text-xs leading-5 text-muted">{detail}</p></div>
    </div>
  </div>
);

const CompactStat = ({ label, value, icon: Icon, tone = 'neutral' }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: 'neutral' | 'danger' | 'warning' | 'success' }) => {
  const toneClass = tone === 'danger' ? 'bg-red-50 text-red-700' : tone === 'warning' ? 'bg-amber-50 text-amber-700' : tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-accent-soft text-accent';
  return <div className="min-h-36 p-5"><div className={`inline-flex rounded-control p-2 ${toneClass}`}><Icon className="h-4 w-4" /></div><p className="calm-number mt-5 text-2xl font-semibold tracking-[-0.04em] text-ink">{value}</p><p className="mt-1 text-xs font-medium text-muted">{label}</p></div>;
};

const TaskQueue = ({ title, tasks, empty, accent = false }: { title: string; tasks: WorkspaceTask[]; empty: string; accent?: boolean }) => (
  <Surface className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">{title}</h3><StatusChip tone={accent ? 'amber' : 'slate'}>{tasks.length}</StatusChip></div>
    <div className="divide-y divide-line/60">
      {tasks.slice(0, 6).map(task => <DataRow key={task.id} title={<Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="hover:text-accent">{task.title}</Link>} description={`${task.clientName} · ${task.dueDate || 'No deadline'}`} meta={task.assignedTo ? 'Assigned' : 'Unassigned'} action={<StatusChip tone={task.isCompleted ? 'emerald' : task.status === 'Waiting Approval' ? 'amber' : 'slate'}>{task.status}</StatusChip>} />)}
      {tasks.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>}
    </div>
  </Surface>
);

const ServiceRoleDashboard = () => {
  const store = useStore();
  const persona = getDashboardPersona(store.currentUser);
  const canSeePrices = canViewServicePrices(store.currentUser, store.rolePermissions);
  const now = new Date();
  const visibleTasks = React.useMemo(
    () => getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions),
    [store.currentUser, store.rolePermissions, store.tasks],
  );
  const visibleClientKeys = React.useMemo(() => new Set(
    getVisibleClientNames(store.currentUser, store.tasks, store.projects, store.rolePermissions).map(getClientKey)
  ), [store.currentUser, store.projects, store.rolePermissions, store.tasks]);
  const serviceTasks = visibleTasks.filter(task => Boolean(task.clientId));
  const myTasks = serviceTasks.filter(task => task.assignedTo === store.currentUser?.id);
  const scopeTasks = persona === 'production' ? myTasks : persona === 'boss' ? visibleTasks : serviceTasks;
  const overdue = scopeTasks.filter(task => { const due = parseOptionalDate(task.dueDate); return Boolean(due && !task.isCompleted && task.status !== 'Cancelled' && isBefore(due, now) && !isToday(due)); });
  const dueToday = scopeTasks.filter(task => { const due = parseOptionalDate(task.dueDate); return Boolean(due && !task.isCompleted && isToday(due)); });
  const activePlans = store.clientPlans.filter(plan => plan.status === 'Active' && visibleClientKeys.has(getClientKey(plan.clientName)));
  const contractedMonthly = canSeePrices ? activePlans.reduce((sum, plan) => sum + (store.servicePricingSnapshots.find(item => item.parentType === 'client_plan' && item.parentId === plan.id)?.totalMinor || 0), 0) : 0;
  const delivered = store.deliverables.filter(item => item.status === 'Delivered' && visibleClientKeys.has(getClientKey(item.clientName)));
  const waitingInternal = scopeTasks.filter(task => task.status === 'Waiting Approval' && task.visibility !== 'client-visible');
  const waitingClient = scopeTasks.filter(task => task.status === 'Waiting Approval' && task.visibility === 'client-visible');
  const revisions = scopeTasks.filter(task => task.revisionCount > 0 && !task.isCompleted);
  const completed = scopeTasks.filter(task => task.isCompleted);
  const renewalPlans = activePlans.filter(plan => plan.contractEndDate).sort((a, b) => (a.contractEndDate || '').localeCompare(b.contractEndDate || ''));
  const workers = store.users.filter(user => user.role === 'Staff').map(user => ({
    user,
    open: serviceTasks.filter(task => task.assignedTo === user.id && !task.isCompleted).length,
    completed: serviceTasks.filter(task => task.assignedTo === user.id && task.isCompleted).length,
    delivered: delivered.filter(item => serviceTasks.some(task => task.assignedTo === user.id && task.deliverableId === item.id)).length,
  }));

  if (persona === 'client') return null;

  if (persona === 'production') {
    const open = myTasks.filter(task => !task.isCompleted);
    return <section className="space-y-5" aria-labelledby="production-workbench-title">
      <WorkbenchHeader id="production-workbench-title" title="Production workbench" description="Assigned deadlines, revisions, review queues and completed output." />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label="My open tasks" value={open.length} icon={Clock3} detail="Only tasks assigned to you are included." /><StatGroup className="grid-cols-3"><CompactStat label="Overdue" value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label="Revisions" value={revisions.length} icon={FileCheck2} tone="warning" /><CompactStat label="Completed" value={completed.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]"><TaskQueue title="Deadline" tasks={[...open].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))} empty="No assigned deadlines." accent /><TaskQueue title="Revision / internal review" tasks={[...revisions, ...waitingInternal.filter(task => !revisions.some(item => item.id === task.id))]} empty="No revision or review work." /></div>
    </section>;
  }

  if (persona === 'operation') return <section className="space-y-5" aria-labelledby="operation-workbench-title">
    <WorkbenchHeader id="operation-workbench-title" title="Operation workbench" description="Delivery queues, team workload and cycle execution. Pricing is not shown." action={<Link to="/calendar" className="inline-flex min-h-10 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent hover:bg-accent-soft"><CalendarDays className="h-4 w-4" />Content calendar</Link>} />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label="Due today" value={dueToday.length} icon={Clock3} detail={`${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} require attention.`} /><StatGroup className="grid-cols-3"><CompactStat label="Overdue" value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label="Internal review" value={waitingInternal.length} icon={FileCheck2} tone="warning" /><CompactStat label="Client approval" value={waitingClient.length} icon={UsersRound} /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-3"><TaskQueue title="Today / overdue" tasks={[...overdue, ...dueToday]} empty="No urgent production work." accent /><TaskQueue title="Waiting internal review" tasks={waitingInternal} empty="Internal review queue is clear." /><TaskQueue title="Waiting client approval" tasks={waitingClient} empty="No client approval is waiting." /></div>
    <Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">Staff workload</h3></div><div className="grid divide-y divide-line/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">{workers.slice(0, 4).map(item => <div key={item.user.id} className="p-4"><p className="font-semibold text-ink">{item.user.name}</p><p className="mt-1 text-xs text-muted">{item.open} open · {item.completed} completed</p><ProgressBar className="mt-4" label="Delivered output" value={item.delivered} max={Math.max(1, item.completed)} /></div>)}</div></Surface>
  </section>;

  if (persona === 'account') return <section className="space-y-5" aria-labelledby="account-workbench-title">
    <WorkbenchHeader id="account-workbench-title" title="Account & Finance workbench" description="Client packages, internal monthly management fees, renewals and production output." />
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><SpotlightMetric label="Monthly management value" value={canSeePrices ? formatMoney(contractedMonthly) : 'Restricted'} icon={WalletCards} detail={`${activePlans.length} active client package${activePlans.length === 1 ? '' : 's'}.`} /><StatGroup className="grid-cols-3"><CompactStat label="Active packages" value={activePlans.length} icon={UsersRound} /><CompactStat label="Contract reminders" value={renewalPlans.length} icon={CalendarDays} tone="warning" /><CompactStat label="Delivered outputs" value={delivered.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
    <div className="grid gap-4 xl:grid-cols-2"><Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">Client package & renewal</h3></div><div className="divide-y divide-line/60">{activePlans.map(plan => <DataRow key={plan.id} title={<Link to={`/clients/${encodeURIComponent(plan.clientId)}`} className="hover:text-accent">{plan.clientName}</Link>} description={`${plan.name} · contract reminder ${plan.contractEndDate || 'not set'}`} action={canSeePrices ? <span className="calm-number text-sm font-semibold text-ink">{formatMoney(store.servicePricingSnapshots.find(item => item.parentId === plan.id)?.totalMinor || 0)}</span> : undefined} />)}</div></Surface><Surface className="overflow-hidden"><div className="border-b border-line/70 px-5 py-4"><h3 className="font-semibold text-ink">Employee / supplier / freelancer output</h3></div><div className="divide-y divide-line/60">{workers.map(item => <DataRow key={item.user.id} title={item.user.name} description={item.user.workerType || 'employee'} action={<span className="calm-number text-xs text-muted">{item.completed} tasks · {item.delivered} delivered</span>} />)}</div></Surface></div>
  </section>;

  return <section className="space-y-5" aria-labelledby="management-workbench-title">
    <WorkbenchHeader id="management-workbench-title" title="Service management overview" description="Company-wide client delivery, workload, output and contracted monthly value." />
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]"><SpotlightMetric label="Contracted monthly value" value={formatMoney(contractedMonthly)} icon={WalletCards} detail={`${activePlans.length} active client${activePlans.length === 1 ? '' : 's'} under management.`} /><StatGroup className="grid-cols-3"><CompactStat label="Active clients" value={activePlans.length} icon={UsersRound} /><CompactStat label="Overdue production" value={overdue.length} icon={AlertTriangle} tone="danger" /><CompactStat label="Delivered outputs" value={delivered.length} icon={CheckCircle2} tone="success" /></StatGroup></div>
  </section>;
};

export default ServiceRoleDashboard;
