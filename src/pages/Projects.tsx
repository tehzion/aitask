import React, { useState } from 'react';
import { useStore } from '../store';
import { format, parseISO, differenceInDays } from 'date-fns';
import { FolderKanban, Users, CheckCircle2, Clock, CalendarDays, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import CreateProjectModal from '../components/CreateProjectModal';
import { Link } from 'react-router-dom';
import { Badge, Button, PageHeader } from '../components/ui';
import { cardBase, pageShell } from '../components/uiTokens';
import { canDeleteProject, canEditProject, canManageProjects, getVisibleProjects, getVisibleTasks } from '../lib/access';
import { Project } from '../types';

const Projects: React.FC = () => {
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
    const confirmed = window.confirm(`Delete "${project.clientName}"? Existing tasks will be kept and unlinked from this company.`);
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
    const pending = total - completed;
    
    // Get unique team members
    const teamMemberIds = [...new Set(projectTasks.map(t => t.assignedTo))];
    const teamMembers = teamMemberIds.map(id => users.find(u => u.id === id)).filter(Boolean);

    return { total, completed, pending, teamMembers };
  };

  const getDeadlineStatus = (deadline: string) => {
    if (!deadline) return { text: 'No Deadline', color: 'text-slate-600 bg-slate-100 border-slate-200' };
    try {
      const today = new Date();
      const dueDate = parseISO(deadline);
      const diff = differenceInDays(dueDate, today);

      if (diff < 0) return { text: 'Overdue', color: 'text-red-600 bg-red-100 border-red-200' };
      if (diff <= 3) return { text: 'At Risk', color: 'text-amber-600 bg-amber-100 border-amber-200' };
      return { text: 'On Track', color: 'text-emerald-600 bg-emerald-100 border-emerald-200' };
    } catch {
      return { text: 'Invalid Date', color: 'text-slate-600 bg-slate-100 border-slate-200' };
    }
  };

  const safeFormatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'MMM dd, yyyy');
    } catch {
      return 'Invalid Date';
    }
  };

  return (
    <div className={`${pageShell} flex flex-col h-full`}>
      <PageHeader
        title="Companies / Brands"
        description="Monitor owned client companies, task participation, and service scope."
        action={canManageProjects(currentUser, rolePermissions) ? <Button onClick={openCreateCompany}>+ New Company / Brand</Button> : null}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {projects.map(project => {
          const stats = getProjectStats(project.id);
          const deadlineStatus = getDeadlineStatus(project.deadline);
          const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
          const canEdit = canEditProject(currentUser, project, rolePermissions);
          const canDelete = canDeleteProject(currentUser, project, rolePermissions);
          const hasLegacyProjectName = project.projectName && project.projectName !== project.clientName;

          return (
            <div key={project.id} className={`${cardBase} hover:shadow-md transition-shadow overflow-hidden flex flex-col`}>
              <div className="p-5 border-b border-slate-100">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 leading-tight">{project.clientName}</h3>
                      <p className="text-sm text-slate-500 font-medium">{hasLegacyProjectName ? project.projectName : 'Company / Brand'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx("text-xs px-2.5 py-1 rounded-full font-semibold border shrink-0", deadlineStatus.color)}>
                      {deadlineStatus.text}
                    </span>
                    {(canEdit || canDelete) && (
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditCompany(project)}
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Delete company"
                            aria-label={`Delete ${project.clientName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {project.services.map(service => (
                    <Badge key={service} tone="slate" className="rounded-md text-[10px] uppercase tracking-wider">
                      {service}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Task Progress</span>
                    <span className="font-bold text-slate-800">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={clsx("h-2.5 rounded-full transition-all duration-500", progress === 100 ? "bg-emerald-500" : "bg-blue-500")}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-slate-50 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm"><strong className="text-slate-900">{stats.completed}</strong> Completed</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm"><strong className="text-slate-900">{stats.pending}</strong> Pending</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <CalendarDays className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium">Start: {safeFormatDate(project.startDate)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="font-medium">End: {safeFormatDate(project.deadline)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-slate-600 pt-2 border-t border-slate-200">
                    <Users className="w-4 h-4 text-blue-500" />
                    <div className="flex -space-x-2">
                      {stats.teamMembers.slice(0, 3).map((user) => (
                        user ? (
                          <div 
                            key={user.id} 
                            className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-700 overflow-hidden shrink-0 z-10"
                            title={user.name}
                          >
                            {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                          </div>
                        ) : null
                      ))}
                      {stats.teamMembers.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 z-0">
                          +{stats.teamMembers.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 p-4 bg-white flex justify-center">
                <Link to={`/tasks?projectId=${encodeURIComponent(project.id)}`} className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center gap-1 transition-colors group">
                  View Tasks <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      
      <CreateProjectModal isOpen={isModalOpen} project={editingProject} onClose={closeCompanyModal} />
    </div>
  );
};

export default Projects;
