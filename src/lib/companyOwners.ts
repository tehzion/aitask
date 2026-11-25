import type { ClientProfile, Project, User } from '../types';

type OwnerProject = Pick<Project, 'clientId' | 'clientName' | 'projectManagerIds'>;

/**
 * A company is owned by the Project Managers of its projects; the creator only
 * stands in while no project of the company has a PM yet. Changing a project's
 * PM therefore changes who is shown as the company owner.
 */
export function getCompanyOwnerIds(
  client: Pick<ClientProfile, 'id' | 'clientName' | 'createdBy'>,
  projects: readonly OwnerProject[],
): string[] {
  const fromProjects = Array.from(new Set(projects
    .filter(project => project.clientId === client.id || (!project.clientId && project.clientName === client.clientName))
    .flatMap(project => project.projectManagerIds ?? [])));
  if (fromProjects.length) return fromProjects;
  return client.createdBy ? [client.createdBy] : [];
}

export function getCompanyOwnerNames(
  client: Pick<ClientProfile, 'id' | 'clientName' | 'createdBy'>,
  projects: readonly OwnerProject[],
  users: readonly Pick<User, 'id' | 'name'>[],
): string[] {
  return getCompanyOwnerIds(client, projects)
    .map(id => users.find(user => user.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}
