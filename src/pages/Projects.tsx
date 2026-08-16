import React, { useState } from 'react';
import { useStore } from '../store';
import { FolderKanban, Users, ArrowRight, Pencil, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import CreateProjectModal from '../components/CreateProjectModal';
import { Link } from 'react-router-dom';
import { Badge, Button, EmptyState, PageHeader, ProgressBar } from '../components/ui';
import { pageShell, tableShell } from '../components/uiTokens';
import { canDeleteProject, canEditProject, canManageProjects, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { isTaskOpen } from '../lib/taskReporting';
import { useI18n } from '../components/I18nProvider';
import { Project } from '../types';

const Projects: React.FC = () => {
  const { t } = useI18n();
  const { projects: allProjects, tasks: allTasks, users, currentUser, rolePermissions, deleteProject, commitPendingMutation } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const tasks = React.useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions),
    [allTasks, currentUser, rolePermissions]
  );
  const projects = React.useMemo(
    () => getVisibleProjects(currentUser, allProjects, allTasks, rolePermissions),
    [allProjects, allTasks, currentUser, rolePermissions]
  );
  const isClientUser = currentUser?.role === 'Client';

  const openCreateCompany = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const openEditCompany = (project: Project) => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const closeCompanyModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleDeleteProject = async (project: Project) => {
    const confirmed = window.confirm(t(`Delete "${project.clientName}"? Existing tasks will be kept and unlinked from this company.`));
    if (!confirmed) return;
    const result = deleteProject(project.id);
    if (!result.ok) {
      window.alert(result.error || 'Unable to delete this company.');
      return;
    }
    const saveResult = await commitPendingMutation();
    if (!saveResult.ok) window.alert(saveResult.error || 'The company deletion is waiting to be saved.');
  };

  const getProjectStats = (projectId: string) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const total = projectTasks.length;
    const completed = projectTasks.filter(t => t.isCompleted).length;
    const pending = projectTasks.filter(isTaskOpen).length;
    
    // Get unique team members
    const teamMemberIds = [...new Set(projectTasks.map(t => t.assignedTo))];
    const teamMembers = teamMemberIds.map(id => users.find(u => u.id === id)).filter(Boolean);

    return { total, completed, pending, teamMembers };
  };

  return (
    <div className={`${pageShell} flex flex-col h-full`}>
      <PageHeader
        title="Companies"
        description="Review company task groupings, service scope, and assigned team members."
        action={canManageProjects(currentUser, rolePermissions) ? (
          <Button onClick={openCreateCompany}>
            <Plus className="h-4 w-4" />
            New company
          </Button>
        ) : null}
      />

      <section className={`${tableShell} divide-y divide-line/70`} aria-label="Companies">
        <div className={clsx(
          'hidden items-center gap-4 border-b border-line/80 bg-inset/70 px-5 py-3 text-xs font-semibold text-muted xl:grid',
          isClientUser ? 'xl:grid-cols-[minmax(15rem,1.45fr)_minmax(12rem,1fr)_auto]' : 'xl:grid-cols-[minmax(15rem,1.45fr)_minmax(12rem,1fr)_minmax(11rem,.8fr)_auto]'
        )}>
          <span>Company</span>
          <span>Delivery progress</span>
          {!isClientUser && <span>Assigned team</span>}
          <span className="text-right">Actions</span>
        </div>
        {projects.map(project => {
          const stats = getProjectStats(project.id);
          const canEdit = canEditProject(currentUser, project, rolePermissions);
          const canDelete = canDeleteProject(currentUser, project, rolePermissions);
          const hasLegacyProjectName = project.projectName && project.projectName !== project.clientName;

          return (
            <article
              key={project.id}
              className={clsx(
                'grid gap-5 px-4 py-5 transition-colors duration-160 hover:bg-inset/60 sm:px-5 xl:items-center',
                isClientUser ? 'xl:grid-cols-[minmax(15rem,1.45fr)_minmax(12rem,1fr)_auto]' : 'xl:grid-cols-[minmax(15rem,1.45fr)_minmax(12rem,1fr)_minmax(11rem,.8fr)_auto]'
              )}
            >
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
                    <FolderKanban className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 data-i18n-skip className="truncate text-base font-semibold text-ink">{project.clientName}</h2>
                    <p className="mt-0.5 text-sm text-muted">{hasLegacyProjectName ? project.projectName : 'Company'}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.services.map(service => (
                    <Badge key={service} tone="slate" className="text-[10px]">{service}</Badge>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <ProgressBar value={stats.completed} max={Math.max(stats.total, 1)} label="Task progress" />
                <p className="mt-2 text-xs text-muted"><span className="calm-number font-semibold text-ink">{stats.completed}</span> of {stats.total} complete · {stats.pending} open</p>
              </div>

              {!isClientUser && (
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Users className="h-4 w-4 shrink-0 text-accent" />
                    <span className="font-medium text-ink">Assigned team</span>
                  </div>
                  {stats.teamMembers.length > 0 ? (
                    <div className="mt-2 flex items-center gap-1.5" aria-label={`Assigned team for ${project.clientName}`}>
                      {stats.teamMembers.slice(0, 3).map(user => user ? (
                        <div key={user.id} className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-control bg-inset text-[10px] font-semibold text-ink ring-1 ring-line" title={user.name}>
                          {user.avatar ? <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" /> : user.name.charAt(0)}
                        </div>
                      ) : null)}
                      {stats.teamMembers.length > 3 && <span className="calm-number ml-1 text-xs font-medium text-muted">+{stats.teamMembers.length - 3}</span>}
                    </div>
                  ) : <p className="mt-2 text-xs text-muted">No assignees yet</p>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditCompany(project)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                    title="Edit company"
                    aria-label={`Edit ${project.clientName}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(project)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    title="Delete company"
                    aria-label={`Delete ${project.clientName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <Link to={`/tasks?projectId=${encodeURIComponent(project.id)}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
                  View Tasks <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          );
        })}
        {projects.length === 0 && (
          <EmptyState title="No companies yet" description="Companies will appear here when they are created or linked to visible task work." className="m-4" />
        )}
      </section>
      
      <CreateProjectModal isOpen={isModalOpen} project={editingProject} onClose={closeCompanyModal} />
    </div>
  );
};

export default Projects;
