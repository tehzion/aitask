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

export function parseDateOnlyLocal(dateStr?: string): Date | null {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return parseOptionalDate(dateStr);
  const [year, month, day] = dateStr.split('-').map(Number);
  const local = new Date(year, month - 1, day);
  return Number.isNaN(local.getTime()) ? null : local;
}

export function getTodayInputDate(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function themeTokenColor(token: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value ? `rgb(${value})` : fallback;
}

export function getRelativeDueDateString(dueDateStr: string | undefined, isCompleted: boolean, status: string): string {
  const parsedDueDate = parseDateOnlyLocal(dueDateStr);
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
