import { create } from 'zustand';
import type { MessageDescriptor } from '../lib/messages';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastMessage = string | MessageDescriptor;

export interface Toast {
  id: string;
  message: ToastMessage;
  type: ToastType;
}

const MAX_VISIBLE_TOASTS = 3;
const TOAST_TTL_MS: Record<ToastType, number> = {
  success: 4500,
  info: 5000,
  warning: 8000,
  error: 12000,
};
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface ToastState {
  toasts: Toast[];
  addToast: (message: ToastMessage, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const clearToastTimer = (id: string) => {
  const timer = toastTimers.get(id);
  if (timer !== undefined) {
    if (typeof window !== 'undefined') window.clearTimeout(timer);
    else clearTimeout(timer);
  }
  toastTimers.delete(id);
};

const scheduleToastRemoval = (id: string) => {
  clearToastTimer(id);
  const toast = useToastStore.getState().toasts.find(item => item.id === id);
  if (!toast) return;
  const timer = (typeof window !== 'undefined' ? window.setTimeout : setTimeout)(() => {
    toastTimers.delete(id);
    useToastStore.setState((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  }, TOAST_TTL_MS[toast.type]);
  toastTimers.set(id, timer);
};

const sameMessage = (left: ToastMessage, right: ToastMessage) => {
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return left.id === right.id && JSON.stringify(left.values || {}) === JSON.stringify(right.values || {});
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const existing = useToastStore.getState().toasts.find(toast => toast.type === type && sameMessage(toast.message, message));
    if (existing) {
      scheduleToastRemoval(existing.id);
      return;
    }
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let displacedId: string | null = null;
    set((state) => {
      const next = [...state.toasts, { id, message, type }];
      if (next.length > MAX_VISIBLE_TOASTS) {
        const displaced = next.shift();
        displacedId = displaced?.id ?? null;
      }
      return { toasts: next };
    });
    if (displacedId) clearToastTimer(displacedId);
    scheduleToastRemoval(id);
  },
  removeToast: (id) => {
    clearToastTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
