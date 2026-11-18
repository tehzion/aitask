import { useStore } from '../store';
import type { Task } from '../types';
import { useI18n } from '../components/I18nProvider';
import { getRevisionAllowance, revisionLabelKey, type RevisionAllowance } from '../lib/revisionAllowance';

/** Revision usage for a task, with a translated "Revision 1 of 2" label. */
export const useRevisionAllowance = (task: Pick<Task, 'revisionCount' | 'projectId'>): { allowance: RevisionAllowance; label: string } => {
  const projects = useStore(state => state.projects);
  const { t } = useI18n();
  const allowance = getRevisionAllowance(task, projects);
  return { allowance, label: t(revisionLabelKey(allowance), { used: allowance.used, included: allowance.included ?? 0 }) };
};
