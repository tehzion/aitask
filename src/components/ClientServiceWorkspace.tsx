import React from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Download, FileText, MessageSquareText, PackageCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { getVisibleTasks } from '../lib/access';
import { getClientDeliveryStageLabel, getClientFocusTask, groupClientDeliveries } from '../lib/clientPortal';
import { formatLocalizedDate, formatLocalizedMonth } from '../lib/i18n';
import { downloadServiceFile } from '../lib/serviceFiles';
import { parseOptionalDate } from '../lib/utils';
import { EmptyState, PageHeader, ProgressBar, SegmentedTabs, StatusChip, Surface } from './ui';
import { pageShell } from './uiTokens';
import { useI18n } from './I18nProvider';

type ClientWorkspaceTab = 'overview' | 'deliveries' | 'activity' | 'services';
const TABS_ID = 'client-service-workspace-v2';

const ClientServiceWorkspace = () => {
  const { locale, t } = useI18n();
  const { clientId = '' } = useParams();
  const store = useStore();
  const [tab, setTab] = React.useState<ClientWorkspaceTab>('overview');
  const [message, setMessage] = React.useState('');
  const [downloadingFileId, setDownloadingFileId] = React.useState<string | null>(null);
  const client = store.clients.find(item => item.id === clientId);
  const isWorkspaceAvailable = Boolean(
    client
    && store.currentUser?.role === 'Client'
    && store.currentUser.companyName?.trim().toLowerCase() === client.clientName.trim().toLowerCase(),
  );
  if (!isWorkspaceAvailable || !client) {
    return (
      <div className={pageShell}>
        <PageHeader
          title={t('Workspace unavailable')}
          description={t('This company workspace is not available for your account.')}
        />
        <section role="status" className="rounded-panel bg-surface p-6 ring-1 ring-line/80 sm:p-8">
          <p className="text-sm leading-6 text-muted">{t('Open your deliveries to continue.')}</p>
          <Link to="/clients" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-white dark:text-[rgb(var(--calm-accent-ink))]">
            {t('Back to Deliveries')}<ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    );
  }

  const activePlan = [...store.clientPlans]
    .filter(item => item.clientId === client.id && ['Active', 'Paused'].includes(item.status))
    .sort((left, right) => right.revision - left.revision)[0];
  const cycles = [...store.serviceCycles]
    .filter(item => item.clientId === client.id && ['Published', 'Completed'].includes(item.status))
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart));
  const currentCycle = cycles[0];
  const deliverables = store.deliverables.filter(item => item.clientId === client.id);
  const currentDeliverables = currentCycle ? deliverables.filter(item => item.cycleId === currentCycle.id) : [];
  const deliveredCount = currentDeliverables.filter(item => item.status === 'Delivered').length;
  const cycleCompletion = currentDeliverables.length ? Math.round((deliveredCount / currentDeliverables.length) * 100) : 0;
  const tasks = getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions).filter(task => task.clientName.trim().toLowerCase() === client.clientName.trim().toLowerCase());
  const taskGroups = groupClientDeliveries(tasks);
  const focusTask = getClientFocusTask(tasks);
  const comments = [...store.cycleComments]
    .filter(item => item.clientId === client.id && item.visibility === 'client-visible')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const tabs = [
    { id: 'overview' as const, label: t('Overview') },
    { id: 'deliveries' as const, label: t('Deliveries') },
    { id: 'activity' as const, label: t('Files & updates'), compactLabel: t('Updates') },
    { id: 'services' as const, label: t('Services') },
  ];
  const taskForDeliverable = (deliverable: { primaryTaskId?: string; taskIds?: string[] }) => {
    const byPrimary = deliverable.primaryTaskId ? tasks.find(task => task.id === deliverable.primaryTaskId) : undefined;
    if (byPrimary) return byPrimary;
    const ids = deliverable.taskIds || [];
    if (ids.length === 0) return undefined;
    return tasks
      .filter(task => ids.includes(task.id))
      .sort((left, right) => (right.workflowStepOrder || 0) - (left.workflowStepOrder || 0))[0];
  };

  const download = async (attachment: Parameters<typeof downloadServiceFile>[0]) => {
    if (downloadingFileId) return;
    setDownloadingFileId(attachment.id);
    setMessage('');
    try {
      const result = await downloadServiceFile(attachment);
      if (!result.ok) setMessage(t(result.error));
    } finally {
      setDownloadingFileId(null);
    }
  };

  return (
    <div className={pageShell}>
      <PageHeader
        compact
        title={<span data-i18n-skip>{client.clientName}</span>}
        description={t('Your services, delivery progress, shared files, and team updates.')}
        meta={<><StatusChip tone={activePlan?.status === 'Active' ? 'emerald' : 'slate'}>{activePlan ? t(activePlan.status) : t('No active service')}</StatusChip>{currentCycle && <span>{formatLocalizedDate(parseOptionalDate(currentCycle.periodStart)!, locale)} – {formatLocalizedDate(parseOptionalDate(currentCycle.periodEnd)!, locale)}</span>}</>}
      />
      <div className="sticky top-[4.5rem] z-20 border-b border-line/80 bg-canvas/95 py-3 backdrop-blur-md">
        <SegmentedTabs<ClientWorkspaceTab> items={tabs} value={tab} onChange={setTab} label={t('Client service workspace')} idPrefix={TABS_ID} />
      </div>
      {message && <p role="alert" className="rounded-control border border-[rgb(var(--calm-danger)/.35)] bg-[rgb(var(--calm-danger-soft))] px-4 py-3 text-sm text-[rgb(var(--calm-danger))]">{message}</p>}

      {tab === 'overview' && (
        <div id={`${TABS_ID}-panel-overview`} role="tabpanel" aria-labelledby={`${TABS_ID}-tab-overview`} tabIndex={0} className="grid scroll-mt-36 gap-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
          <Surface variant="inset" className="p-6 sm:p-8">
            <p className="calm-eyebrow">{t('Delivery progress')}</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="calm-number text-5xl font-semibold tracking-tight text-ink">{cycleCompletion}%</p><p className="mt-2 text-sm text-muted">{currentDeliverables.length ? t(`${deliveredCount} of ${currentDeliverables.length} delivered this cycle`) : t('No published deliverables yet')}</p></div>{currentCycle && <StatusChip tone="emerald">{t(currentCycle.status)}</StatusChip>}</div>
            <ProgressBar className="mt-7" value={deliveredCount} max={Math.max(currentDeliverables.length, 1)} label={t('Current cycle')} />
            <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-control bg-surface ring-1 ring-line/70">{[[t('Included'), currentDeliverables.length], [t('Delivered'), deliveredCount], [t('Remaining'), Math.max(0, currentDeliverables.length - deliveredCount)]].map(([label, value]) => <div key={label} className="border-r border-line/70 p-4 last:border-r-0"><p className="calm-number text-xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div>)}</div>
          </Surface>
          <Surface className="p-6">
            <p className="calm-eyebrow">{t('What needs attention')}</p>
            {focusTask ? <div className="mt-5"><StatusChip tone={taskGroups.needs_review.some(task => task.id === focusTask.id) ? 'amber' : 'blue'}>{getClientDeliveryStageLabel(focusTask)}</StatusChip><h2 data-i18n-skip className="mt-3 text-lg font-semibold text-ink text-pretty">{focusTask.title}</h2><p className="mt-2 text-sm text-muted">{focusTask.dueDate ? <>{t('Expected')} {formatLocalizedDate(parseOptionalDate(focusTask.dueDate)!, locale)}</> : t('Date to be confirmed')}</p><Link to={`/tasks?taskId=${encodeURIComponent(focusTask.id)}`} className="mt-5 inline-flex min-h-11 w-full items-center justify-between rounded-control bg-accent px-4 text-sm font-semibold text-white dark:text-[rgb(var(--calm-accent-ink))]">{taskGroups.needs_review.some(task => task.id === focusTask.id) ? t('Review deliverable') : t('View delivery')}<ArrowRight className="h-4 w-4" /></Link></div> : <div className="mt-5"><CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" /><p className="mt-3 font-semibold text-ink">{t('Nothing needs your attention')}</p><p className="mt-1 text-sm leading-6 text-muted">{t('New review requests and timing updates will appear here.')}</p></div>}
          </Surface>
        </div>
      )}

      {tab === 'deliveries' && (
        <div id={`${TABS_ID}-panel-deliveries`} role="tabpanel" aria-labelledby={`${TABS_ID}-tab-deliveries`} tabIndex={0} className="scroll-mt-36 space-y-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {cycles.map(cycle => {
            const cycleDeliverables = deliverables.filter(item => item.cycleId === cycle.id);
            return <section key={cycle.id} className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-4 sm:px-5"><div><p className="text-sm font-semibold text-ink">{formatLocalizedMonth(parseOptionalDate(cycle.periodStart)!, locale)}</p><p className="mt-1 text-xs text-muted">{cycleDeliverables.filter(item => item.status === 'Delivered').length}/{cycleDeliverables.length} {t('delivered')}</p></div><StatusChip tone="emerald">{t(cycle.status)}</StatusChip></header><div className="divide-y divide-line/70">{cycleDeliverables.map(deliverable => { const task = taskForDeliverable(deliverable); const dueDate = task ? parseOptionalDate(task.dueDate) : null; return <article key={deliverable.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p data-i18n-skip className="truncate text-sm font-semibold text-ink">{deliverable.title}</p><StatusChip tone={deliverable.status === 'Delivered' ? 'emerald' : deliverable.status === 'Ready' ? 'amber' : 'slate'}>{task ? getClientDeliveryStageLabel(task) : t(deliverable.status)}</StatusChip></div><p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{dueDate ? formatLocalizedDate(dueDate, locale) : t('Date to be confirmed')}</p></div>{task && <Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold text-accent transition-colors duration-160 hover:bg-accent-soft">{t('View delivery')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}</article>; })}{cycleDeliverables.length === 0 && <p className="px-5 py-8 text-sm text-muted">{t('No deliveries have been published for this period.')}</p>}</div></section>;
          })}
          {cycles.length === 0 && <EmptyState title={t('No published deliveries yet')} description={t('Published service periods will appear here without exposing internal team details.')} />}
        </div>
      )}

      {tab === 'activity' && (
        <div id={`${TABS_ID}-panel-activity`} role="tabpanel" aria-labelledby={`${TABS_ID}-tab-activity`} tabIndex={0} className="scroll-mt-36 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80">
            <header className="border-b border-line/70 px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" /><h2 className="font-semibold text-ink">{t('Files and team updates')}</h2></div><p className="mt-1 text-sm text-muted">{t('Only updates explicitly shared with your company appear here.')}</p></header>
            <div className="divide-y divide-line/70">{comments.map(item => { const author = store.users.find(user => user.id === item.userId); return <article key={item.id} className="px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{author?.name ? <span data-i18n-skip>{author.name}</span> : t('Agency team')}</p><time className="text-xs text-muted">{formatLocalizedDate(new Date(item.updatedAt), locale)}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{item.text}</p>{item.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map(attachment => <button key={attachment.id} data-i18n-skip type="button" disabled={Boolean(downloadingFileId)} aria-busy={downloadingFileId === attachment.id} onClick={() => void download(attachment)} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-wait disabled:opacity-60"><Download className="h-4 w-4 text-accent" aria-hidden="true" />{attachment.fileName}</button>)}</div>}</article>; })}{comments.length === 0 && <EmptyState title={t('No shared updates yet')} description={t('Client-visible notes and files from the team will appear here.')} className="m-4" />}</div>
          </section>
        </div>
      )}

      {tab === 'services' && (
        <div id={`${TABS_ID}-panel-services`} role="tabpanel" aria-labelledby={`${TABS_ID}-tab-services`} tabIndex={0} className="scroll-mt-36 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <section className="overflow-hidden rounded-panel bg-surface ring-1 ring-line/80">
            <header className="border-b border-line/70 px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-accent" aria-hidden="true" /><h2 className="font-semibold text-ink">{activePlan?.name ? <span data-i18n-skip>{activePlan.name}</span> : t('Services')}</h2></div><p className="mt-1 text-sm text-muted">{t('Your included services and quantities. Internal team details and pricing stay private.')}</p></header>
            {activePlan ? <div className="divide-y divide-line/70">{activePlan.serviceItems.map(item => <article key={item.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div><p data-i18n-skip className="text-sm font-semibold text-ink">{item.name}</p><p className="mt-1 text-xs text-muted">{item.platforms.length > 0 ? <span data-i18n-skip>{item.platforms.join(', ')}</span> : t('No platform specified')}</p></div><p data-i18n-skip className="text-sm font-medium text-muted">{item.quantity} {item.unit}</p></article>)}</div> : <EmptyState title={t('No active services')} description={t('Your active service package will appear here when it is published.')} className="m-4" />}
            {activePlan && <footer className="grid gap-3 border-t border-line/70 bg-inset/60 px-4 py-4 text-sm sm:grid-cols-2 sm:px-5"><p><span className="text-muted">{t('Billing day')}</span><span className="calm-number ml-2 font-semibold text-ink">{t('Day')} {activePlan.billingDay}</span></p>{activePlan.contractEndDate && <p className="sm:text-right"><span className="text-muted">{t('Service reminder')}</span><span className="calm-number ml-2 font-semibold text-ink">{formatLocalizedDate(parseOptionalDate(activePlan.contractEndDate)!, locale)}</span></p>}</footer>}
          </section>
        </div>
      )}

      <div className="flex flex-wrap gap-2"><Link to="/clients?period=all" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><FileText className="h-4 w-4 text-accent" aria-hidden="true" />{t('All deliveries')}</Link><Link to="/notifications" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm font-semibold text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" />{t('Open Inbox')}</Link></div>
    </div>
  );
};

export default ClientServiceWorkspace;
