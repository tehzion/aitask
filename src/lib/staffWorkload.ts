export type WorkloadRow = { id: string; name: string; departments: string[]; open: number; overdue: number; dueThisWeek: number };

/** Validates the workload RPC reply; any unexpected shape is rejected as a whole. */
export const parseWorkloadRows = (value: unknown): WorkloadRow[] | null => {
  if (!value || typeof value !== 'object' || !('ok' in value) || value.ok !== true || !('members' in value) || !Array.isArray(value.members)) return null;
  const rows: WorkloadRow[] = [];
  for (const item of value.members) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string'
      || !Array.isArray(item.departments) || !item.departments.every((department: unknown) => typeof department === 'string')
      || ![item.open, item.overdue, item.dueThisWeek].every(count => Number.isSafeInteger(count) && count >= 0)) return null;
    rows.push({ id: item.id, name: item.name, departments: item.departments, open: item.open, overdue: item.overdue, dueThisWeek: item.dueThisWeek });
  }
  return rows;
};

/** "Name · 3 open" for an assignee list, or the bare name when the load is not known. */
export const assigneeLabelWithLoad = (name: string, load: { open: number; overdue: number } | undefined, openLabel: (count: number) => string, overdueLabel: (count: number) => string) => {
  if (!load) return name;
  return `${name} · ${openLabel(load.open)}${load.overdue > 0 ? ` · ${overdueLabel(load.overdue)}` : ''}`;
};
