/**
 * Per-person memory of the last Create task choices (click reduction, item 5).
 * Browser storage is optional: every read and write tolerates it being blocked.
 */
export interface CreateTaskChoice {
  department: string;
  assignedTo: string;
  projectId: string;
}

const storageKey = (userId: string) => `aitask:create-task-last:${userId}`;

export const readCreateTaskChoice = (userId: string | undefined): CreateTaskChoice | null => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CreateTaskChoice>;
    return {
      department: typeof value.department === 'string' ? value.department : '',
      assignedTo: typeof value.assignedTo === 'string' ? value.assignedTo : '',
      projectId: typeof value.projectId === 'string' ? value.projectId : '',
    };
  } catch {
    return null;
  }
};

export const rememberCreateTaskChoice = (userId: string | undefined, choice: CreateTaskChoice) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(choice));
  } catch {
    // Remembering is a convenience; the form works without it.
  }
};

/** A month-end due date for work counted toward a month, never in the past. */
export const defaultDueDateForMonth = (periodEnd: string | undefined, todayKey: string) => (
  periodEnd && periodEnd >= todayKey ? periodEnd : ''
);
