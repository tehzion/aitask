import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { parseISO, differenceInDays, startOfDay } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseOptionalDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getTodayInputDate(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function getRelativeDueDateString(dueDateStr: string | undefined, isCompleted: boolean, status: string): string {
  const parsedDueDate = parseOptionalDate(dueDateStr);
  if (!parsedDueDate) return 'No due date';

  const today = startOfDay(new Date());
  const dueDate = startOfDay(parsedDueDate);
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
