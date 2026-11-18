import type { Project, Task } from '../types';

export const MAX_INCLUDED_REVISIONS = 20;

export interface RevisionAllowance {
  used: number;
  /** Revision rounds the project includes; undefined when no allowance is set. */
  included?: number;
  remaining?: number;
  /** More revision rounds than the project includes. */
  over: boolean;
}

/** Whole number 0-20, or undefined when the value is not a valid allowance. */
export const normalizeIncludedRevisions = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.min(MAX_INCLUDED_REVISIONS, number);
};

/**
 * Fiverr-style revision allowance: what the task has used against what its
 * project includes. Tasks outside a project, or projects with no allowance,
 * report usage only.
 */
export const getRevisionAllowance = (
  task: Pick<Task, 'revisionCount' | 'projectId'>,
  projects: readonly Pick<Project, 'id' | 'includedRevisions'>[],
): RevisionAllowance => {
  const used = Math.max(0, Math.trunc(Number(task.revisionCount) || 0));
  const included = normalizeIncludedRevisions(projects.find(project => project.id === task.projectId)?.includedRevisions);
  if (included === undefined) return { used, over: false };
  return { used, included, remaining: Math.max(0, included - used), over: used > included };
};

/** Message id for the "Revision 1 of 2" label; pass { used, included }. */
export const revisionLabelKey = (allowance: RevisionAllowance) => (
  allowance.included === undefined ? 'delivery.revision' : 'delivery.revisionOf'
) as 'delivery.revision' | 'delivery.revisionOf';
