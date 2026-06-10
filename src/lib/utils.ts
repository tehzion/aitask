import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parseISO, differenceInDays, startOfDay } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRelativeDueDateString(dueDateStr: string, isCompleted: boolean, status: string): string {
  const today = startOfDay(new Date());
  const dueDate = startOfDay(parseISO(dueDateStr));
  const diff = differenceInDays(dueDate, today);

  if (diff === 0) {
    return 'Due today';
  } else if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (isCompleted || status === 'Cancelled') {
      return `${absDiff} day${absDiff === 1 ? '' : 's'} ago`;
    }
    return `${absDiff} day${absDiff === 1 ? '' : 's'} overdue`;
  } else {
    return `Due in ${diff} day${diff === 1 ? '' : 's'}`;
  }
}
