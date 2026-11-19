import '../lib/pageCopy';
import '../lib/staffWorkflowCopy';
import '../lib/taskStageCopy';
import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { canCreateTasksFromAnywhere, canEditTask, getVisibleTasks, isBossKoo, isDepartmentScopedUser } from '../lib/access';
import { buildManageWork, defaultManageTab, filterManageTasks, MANAGE_TAB_ORDER, summarizeManageClients, summarizeManageTeam, type ManageTabId } from '../lib/manageWork';
import { isTaskAtRisk } from '../lib/taskRisk';
import { Button, PageHeader, SegmentedTabs, Surface } from '../components/ui';
import { pageShell, inputBase } from '../components/uiTokens';
import { useI18n } from '../components/I18nProvider';
import { useLocalToday } from '../hooks/useLocalToday';
import StaffWorkItem from '../components/StaffWorkItem';
import StaffTaskFocus from '../components/StaffTaskFocus';
import TaskDetailsModal from '../components/TaskDetailsModal';
import UnavailableWork from '../components/UnavailableWork';

const TAB_LABEL: Record<ManageTabId, string> = {
  active: 'Active',
  review: 'Needs my review',
  waiting: 'With reviewer',
  revision: 'In revision',
  client: 'With client',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TAB_EMPTY: Record<ManageTabId, string> = {
  active: 'No active work right now.',
  review: 'Nothing is waiting for your decision.',
  waiting: 'Nothing is waiting on another reviewer.',
  revision: 'No work is in revision.',
  client: 'No delivery is waiting on a client.',
  completed: 'No finished work yet.',
  cancelled: 'No cancelled work.',
};

/**
 * Manage work: a Fiverr-style "manage orders" hub for Project Managers and
 * department leads. One list split by what each task needs next, order-style
 * cards with their quick actions, and the clients and people behind the work.
 */
const ManageWork: React.FC = () => {
  const { t } = useI18n();
  const today = useLocalToday();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tasks, currentUser, users, rolePermissions, clients, projects, setCreateTaskModalOpen } = useStore(useShallow(state => ({
    tasks: state.tasks, currentUser: state.currentUser, users: state.users, rolePermissions: state.rolePermissions,
    clients: state.clients, projects: state.projects, setCreateTaskModalOpen: state.setCreateTaskModalOpen,
  })));
  const [query, setQuery] = React.useState('');
  const [riskOnly, setRiskOnly] = React.useState(false);
  const [fullEditorOpen, setFullEditorOpen] = React.useState(false);

  const scope = React.useMemo(() => ({ clients, projects, users }), [clients, projects, users]);
  const visible = React.useMemo(() => getVisibleTasks(currentUser, tasks, rolePermissions, scope), [currentUser, rolePermissions, scope, tasks]);
  const work = React.useMemo(
    () => buildManageWork(visible, { user: currentUser, users, roles: rolePermissions, scope, now: new Date(Math.max(Date.now(), today.getTime())) }),
    [currentUser, rolePermissions, scope, today, users, visible],
  );

  const requestedTab = searchParams.get('tab') as ManageTabId | null;
  const tab: ManageTabId = requestedTab && MANAGE_TAB_ORDER.includes(requestedTab) ? requestedTab : defaultManageTab(work.counts);
  const now = React.useMemo(() => new Date(Math.max(Date.now(), today.getTime())), [today]);
  const atRiskCount = React.useMemo(() => work.byTab[tab].filter(task => isTaskAtRisk(task, now)).length, [now, tab, work.byTab]);
  const shown = React.useMemo(() => {
    const matching = filterManageTasks(work.byTab[tab], query, users);
    return riskOnly ? matching.filter(task => isTaskAtRisk(task, now)) : matching;
  }, [now, query, riskOnly, tab, users, work.byTab]);
  const clientRows = React.useMemo(() => summarizeManageClients(visible), [visible]);
  const teamRows = React.useMemo(() => summarizeManageTeam(visible, users, new Date(Math.max(Date.now(), today.getTime()))), [today, users, visible]);

  const taskId = searchParams.get('taskId');
  const selectedTask = taskId ? visible.find(task => task.id === taskId) || null : null;
  const setParam = (key: string, value?: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });

  // The hub is for people who manage work; everyone else keeps their own home.
  if (!currentUser || !(isBossKoo(currentUser) || currentUser.role === 'Project Manager' || isDepartmentScopedUser(currentUser, rolePermissions))) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={`${pageShell} max-w-6xl`}>
      <PageHeader
        compact
        title={t('Manage work')}
        description={t('Every task you manage, split by what it needs next.')}
        action={canCreateTasksFromAnywhere(currentUser, rolePermissions) ? (
          <Button onClick={() => setCreateTaskModalOpen(true)}><Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />{t('New task')}</Button>
        ) : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="manage-work-list" className="min-w-0 space-y-4">
          <h2 id="manage-work-list" className="sr-only">{t('Work list')}</h2>
          <SegmentedTabs<ManageTabId>
            items={MANAGE_TAB_ORDER.map(id => ({ id, label: t(TAB_LABEL[id]), count: work.counts[id] }))}
            value={tab}
            onChange={id => setParam('tab', id)}
            label={t('Work by stage')}
            idPrefix="manage-work"
            panelId="manage-work-panel"
            variant="underline"
          />
          <label className="relative block">
            <span className="sr-only">{t('Search task, company or person')}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('Search task, company or person')}
              className={`${inputBase} w-full pl-9`}
            />
          </label>

          {(atRiskCount > 0 || riskOnly) && (
            <button
              type="button"
              aria-pressed={riskOnly}
              onClick={() => setRiskOnly(value => !value)}
              className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${riskOnly ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-line text-muted hover:bg-inset'}`}
            >
              {t('Show only at-risk work')} ({atRiskCount})
            </button>
          )}

          {taskId && !selectedTask && <UnavailableWork onDismiss={() => setParam('taskId')} />}
          <Surface as="div" id="manage-work-panel" role="tabpanel" aria-labelledby={`manage-work-tab-${tab}`} tabIndex={0} className="overflow-hidden divide-y divide-line/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
            {shown.slice(0, 50).map(task => <StaffWorkItem key={task.id} task={task} allTasks={visible} users={users} onOpen={item => setParam('taskId', item.id)} />)}
            {shown.length === 0 && (
              <p className="px-5 py-14 text-center text-sm text-muted">{query.trim() ? t('No work matches your search.') : t(TAB_EMPTY[tab])}</p>
            )}
          </Surface>
          {shown.length > 50 && <p className="text-center text-xs text-muted">{t('Showing the first 50. Search to narrow the list.')}</p>}
        </section>

        <aside aria-label={t('Clients and team')} className="space-y-4">
          <Surface className="p-4">
            <h2 className="text-sm font-semibold text-ink">{t('Clients')}</h2>
            {clientRows.length === 0 ? <p className="mt-2 text-sm text-muted">{t('No client work yet.')}</p> : (
              <ul className="mt-2 divide-y divide-line/60">
                {clientRows.map(row => (
                  <li key={row.clientName} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span data-i18n-skip className="block truncate font-medium text-ink">{row.clientName}</span>
                      <span className="text-xs text-muted">{t('ui.openCount', { count: row.open })}{row.waitingOnClient > 0 ? ` · ${t('ui.waitingOnClientCount', { count: row.waitingOnClient })}` : ''}</span>
                    </span>
                    {row.ratingAverage !== undefined && <span className="shrink-0 text-xs font-medium text-amber-700"><span aria-hidden="true">★</span> {row.ratingAverage.toFixed(1)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Surface>
          <Surface className="p-4">
            <h2 className="text-sm font-semibold text-ink">{t('Team')}</h2>
            {teamRows.length === 0 ? <p className="mt-2 text-sm text-muted">{t('No team work yet.')}</p> : (
              <ul className="mt-2 divide-y divide-line/60">
                {teamRows.map(row => (
                  <li key={row.userId} className="py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => { setQuery(row.name); setParam('tab', 'active'); }}
                      aria-label={`${t('Show work for')} ${row.name}`}
                      className="flex w-full items-start justify-between gap-3 rounded-control text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                    >
                      <span className="min-w-0">
                        <span data-i18n-skip className="block truncate font-medium text-ink">{row.name}</span>
                        <span className="block text-xs text-muted">
                          {t('ui.openCount', { count: row.open })}
                          {row.overdue > 0 && <> · <span className="font-medium text-red-700">{t('ui.overdueCount', { count: row.overdue })}</span></>}
                          {row.atRisk > 0 && <> · <span className="font-medium text-amber-700">{t('ui.atRiskCount', { count: row.atRisk })}</span></>}
                        </span>
                        <span className="block text-xs text-muted">
                          {row.onTimePercent === undefined ? t('No due dates') : t('ui.onTimePercent', { percent: row.onTimePercent })} · {t('ui.finishedCount', { count: row.finished })}
                          {row.acceptanceHours !== undefined && <> · {t('ui.acceptsInHours', { hours: row.acceptanceHours })}</>}
                        </span>
                      </span>
                      {row.ratingAverage !== undefined && <span className="shrink-0 text-xs font-medium text-amber-700"><span aria-hidden="true">★</span> {row.ratingAverage.toFixed(1)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </aside>
      </div>

      <StaffTaskFocus
        isOpen={Boolean(selectedTask) && !fullEditorOpen}
        task={selectedTask}
        onClose={() => setParam('taskId')}
        onOpenFullEditor={() => setFullEditorOpen(true)}
      />
      <TaskDetailsModal
        isOpen={Boolean(selectedTask) && fullEditorOpen && canEditTask(currentUser, selectedTask, rolePermissions, { clients, projects })}
        task={selectedTask}
        onClose={() => { setFullEditorOpen(false); setParam('taskId'); }}
      />
    </div>
  );
};

export default ManageWork;
