import { PresetServiceType, Project, ServiceType, Task, User } from '../types';

export const PRESET_SERVICES: PresetServiceType[] = ['Social Media', 'Design', 'Video', 'Website', 'SEO', 'Ads', 'Branding'];

const normalizeChoiceKey = (value: string) => value.trim().toLowerCase();

export const hasChoice = (choices: string[], value: string) => {
  const key = normalizeChoiceKey(value);
  return choices.some(choice => normalizeChoiceKey(choice) === key);
};

export const uniqueSortedChoices = (values: Array<string | undefined | null>) => {
  const choices = new Map<string, string>();

  values.forEach(value => {
    const trimmed = value?.trim();
    if (!trimmed) return;

    const key = normalizeChoiceKey(trimmed);
    if (!choices.has(key)) choices.set(key, trimmed);
  });

  return Array.from(choices.values()).sort((a, b) => a.localeCompare(b));
};

export const getClientOptions = (projects: Project[], tasks: Task[], users: User[]) => uniqueSortedChoices([
  ...projects.map(project => project.clientName),
  ...tasks.map(task => task.clientName),
  ...users
    .filter(user => user.role === 'Client')
    .map(user => user.companyName),
]);

export const getServiceOptions = (projects: Project[], tasks: Task[]): ServiceType[] => {
  const savedServices = uniqueSortedChoices([
    ...projects.flatMap(project => project.services),
    ...tasks.map(task => task.serviceType),
  ]);

  const customServices = savedServices.filter(service => !hasChoice(PRESET_SERVICES, service));
  return [...PRESET_SERVICES, ...customServices];
};
