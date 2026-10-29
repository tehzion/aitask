import React from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import type { Project } from '../types';
import { useStore } from '../store';
import { isBossKoo } from '../lib/access';
import { getProjectsWithoutPm } from '../lib/opsSignals';
import { isTaskOpen } from '../lib/taskCompletion';
import { useI18n } from './I18nProvider';
import { Button, CountLabel, Surface } from './ui';
import SystemMessage from './SystemMessage';

const AssignRow = ({ project, openTasks }: { project: Project; openTasks: number }) => {
  const { t } = useI18n();
  const users = useStore(state => state.users);
  const [managerId, setManagerId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const managers = users.filter(user => user.role === 'Project Manager' && !user.isSuperAdmin);
  const assign = async () => {
    if (!managerId || saving) return;
    setSaving(true);
    setError('');
    try {
      const store = useStore.getState();
      const local = store.updateProject(project.id, { projectManagerIds: [managerId] });
      if (!local.ok) { setError(local.error || 'Unable to update this project.'); return; }
      const saved = await useStore.getState().commitPendingMutation('project.update');
      if (!saved.ok) setError(saved.error || 'The project is still waiting to be saved.');
    } finally {
      setSaving(false);
    }
  };
  return <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
    <div className="min-w-0">
      <Link to={`/tasks?project=${encodeURIComponent(project.projectName)}`} className="block truncate text-sm font-semibold text-ink hover:text-accent"><span data-i18n-skip>{project.projectName}</span></Link>
      <p className="truncate text-xs text-muted"><span data-i18n-skip>{project.clientName}</span> · {openTasks} {t('open tasks')}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <select value={managerId} onChange={event => setManagerId(event.target.value)} aria-label={t('Project Manager for {project}', { project: project.projectName })}
        className="min-h-11 max-w-[14rem] rounded-control border border-line bg-surface px-3 text-sm text-ink">
        <option value="">{t('Choose a Project Manager')}</option>
        {managers.map(user => <option key={user.id} value={user.id} data-i18n-skip>{user.name}</option>)}
      </select>
      <Button variant="secondary" disabled={!managerId || saving} onClick={() => void assign()}>{t('Assign')}</Button>
    </div>
    {error && <p role="alert" className="basis-full text-sm text-red-700"><SystemMessage message={t(error)} /></p>}
  </li>;
};

/** Boss Koo's admin list of projects nobody runs yet; busiest first. */
const ProjectsWithoutPmPanel = () => {
  const { t } = useI18n();
  const { currentUser, projects, users, tasks } = useStore(useShallow(state => ({
    currentUser: state.currentUser, projects: state.projects, users: state.users, tasks: state.tasks,
  })));
  const rows = React.useMemo(() => getProjectsWithoutPm(projects, users)
    .map(project => ({ project, openTasks: tasks.filter(task => task.projectId === project.id && isTaskOpen(task)).length }))
    .sort((left, right) => right.openTasks - left.openTasks || left.project.projectName.localeCompare(right.project.projectName)),
  [projects, users, tasks]);
  if (!isBossKoo(currentUser) || rows.length === 0) return null;
  return <Surface className="overflow-hidden" aria-labelledby="projects-without-pm-title">
    <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div><h2 id="projects-without-pm-title" className="text-base font-semibold text-ink">{t('Projects without a Project Manager')}</h2><p className="mt-1 text-sm text-muted">{t('Assign a Project Manager so someone runs each project and approves its work.')}</p></div>
      <CountLabel>{rows.length}</CountLabel>
    </div>
    <ul className="divide-y divide-line/60">{rows.slice(0, 8).map(row => <AssignRow key={row.project.id} project={row.project} openTasks={row.openTasks} />)}</ul>
    {rows.length > 8 && <p className="border-t border-line/70 px-5 py-3 text-sm text-muted">{t('Showing the 8 busiest. Assign these first, then the rest will appear here.')}</p>}
  </Surface>;
};

export default ProjectsWithoutPmPanel;
