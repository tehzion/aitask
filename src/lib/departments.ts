import type { Department } from '../types';

export const STAFF_DEPARTMENTS = [
  'Operation',
  'Management',
  'Videoshooting',
  'Video Shooting',
  'Editor',
  'Video Editor',
  'Ads Management',
  'Account & Finance',
  'Designer',
] as const satisfies readonly Department[];

export const DEPARTMENTS = [
  ...STAFF_DEPARTMENTS,
  'Client',
] as const satisfies readonly Department[];

const departmentAliases: Record<string, Department> = {
  operation: 'Operation',
  management: 'Management',
  videoshooting: 'Videoshooting',
  'video shooting': 'Video Shooting',
  editor: 'Editor',
  'video editor': 'Video Editor',
  'ads management': 'Ads Management',
  'account & finance': 'Account & Finance',
  designer: 'Designer',
  client: 'Client',
};

export const normalizeDepartment = (value: unknown): Department | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return departmentAliases[normalized] || null;
};
