import { userFacingText } from '../utils/userFacingMessage';
import { getTodayInputDate } from '../utils/utils';
export const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const profileEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PHONE_PATTERN = /^\+?[0-9\s\-()]{7,20}$/;

export const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object') return userFacingText(error, fallback);
  const context = (error as { context?: unknown }).context;
  if (typeof Response !== 'undefined' && context instanceof Response) {
    const payload = await context.clone().json().catch(() => null) as { error?: unknown; message?: unknown } | null;
    if (payload?.error || payload?.message) return userFacingText(payload.error || payload.message, fallback);
  }
  return userFacingText(error, fallback);
};

export const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const normalizeOptionalIsoDate = (value?: string) => value?.trim() || '';

export const normalizeRequiredStartDate = (value?: string) => normalizeOptionalIsoDate(value) || getTodayInputDate();

export const cleanProfileText = (value?: string, maxLength = 5000) => value?.trim().slice(0, maxLength) || undefined;

export const cleanAccountEmail = (value?: string) => value?.trim().toLowerCase().slice(0, 320) || undefined;
