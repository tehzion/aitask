import '../lib/pageCopy';
import React from 'react';
import { Link } from 'react-router-dom';
import type { Project, Task, User } from '../types';
import { getStaffingGaps, type ProjectGap } from '../lib/staffingGaps';
import { CountLabel, StatusChip, Surface } from './ui';
import { useI18n } from './I18nProvider';

const VISIBLE_PROJECTS = 5;

/**
 * Boss view of where work cannot reach a Staff member (team feedback item 7):
 * departments with no Staff, active projects with no Staff, and projects with
 * no HOD. It only reads; people are added in Settings or on the project.
 */
const StaffingGapsPanel = ({ users, projects, tasks }: {
  users: readonly User[];
  projects: readonly Project[];
  tasks: readonly Task[];
}) => {
  const { t } = useI18n();
  const gaps = React.useMemo(() => getStaffingGaps(users, projects, tasks), [users, projects, tasks]);
  const titleId = React.useId();
  const total = gaps.departmentsWithoutStaff.length + gaps.projectsWithoutStaff.length + gaps.projectsWithoutHod.length;
  if (!total) return null;

  return <Surface className="overflow-hidden" aria-labelledby={titleId}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div>
        <h3 id={titleId} className="font-semibold text-ink">{t('Staffing gaps')}</h3>
        <p className="mt-1 text-sm text-muted">{t('Where work cannot reach a Staff member. Open a department to add or approve its Staff, or add them to the project.')}</p>
      </div>
      <Link to="/approvals?tab=members" className="text-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t('Manage team')}</Link>
    </div>
    {gaps.departmentsWithoutStaff.length > 0 && <GapGroup title={t('Departments with no Staff')} count={gaps.departmentsWithoutStaff.length}>
      {gaps.departmentsWithoutStaff.map(gap => <li key={gap.department} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
        <Link to={`/approvals?tab=members&department=${encodeURIComponent(gap.department)}`} aria-label={t('Manage {department} team', { department: t(gap.department) })} className="min-w-0 flex-1 font-medium text-ink hover:underline">{t(gap.department)}</Link>
        <span className="text-muted">{gap.hodNames.length ? t('HOD: {names}', { names: gap.hodNames.join(', ') }) : t('No HOD')}</span>
        {gap.openTasks > 0 && <StatusChip tone="amber">{t(gap.openTasks === 1 ? '{count} open task' : '{count} open tasks', { count: gap.openTasks })}</StatusChip>}
      </li>)}
    </GapGroup>}
    {gaps.projectsWithoutStaff.length > 0 && <ProjectGroup title={t('Active projects with no Staff')} items={gaps.projectsWithoutStaff} />}
    {gaps.projectsWithoutHod.length > 0 && <ProjectGroup title={t('Projects with no HOD')} note={t('The PM assigns tasks directly on these projects.')} items={gaps.projectsWithoutHod} />}
  </Surface>;
};

const GapGroup = ({ title, note, count, children }: { title: string; note?: string; count: number; children: React.ReactNode }) => {
  const id = React.useId();
  return <div className="border-b border-line/70 last:border-b-0">
    <div className="flex items-center justify-between gap-3 bg-canvas/60 px-5 py-2">
      <div>
        <h4 id={id} className="text-sm font-semibold text-ink">{title}</h4>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      <CountLabel>{count}</CountLabel>
    </div>
    <ul className="divide-y divide-line/60" aria-labelledby={id}>{children}</ul>
  </div>;
};

const ProjectGroup = ({ title, note, items }: { title: string; note?: string; items: ProjectGap[] }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? items : items.slice(0, VISIBLE_PROJECTS);
  return <GapGroup title={title} note={note} count={items.length}>
    {shown.map(({ project, openTasks }) => <li key={project.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <Link
        to={project.clientId ? `/clients/${encodeURIComponent(project.clientId)}` : '/projects'}
        className="min-w-0 flex-1 truncate font-medium text-ink hover:underline"
        data-i18n-skip
      >{project.clientName ? `${project.clientName} · ` : ''}{project.projectName}</Link>
      {openTasks > 0 && <StatusChip tone="amber">{t(openTasks === 1 ? '{count} open task' : '{count} open tasks', { count: openTasks })}</StatusChip>}
    </li>)}
    {items.length > VISIBLE_PROJECTS && !expanded && <li className="px-5 py-2">
      <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setExpanded(true)}>
        {t('Show {count} more', { count: items.length - VISIBLE_PROJECTS })}
      </button>
    </li>}
  </GapGroup>;
};

export default StaffingGapsPanel;
