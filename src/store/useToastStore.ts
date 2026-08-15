import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const MAX_VISIBLE_TOASTS = 3;
const TOAST_TTL_MS = 3000;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
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
  const timer = (typeof window !== 'undefined' ? window.setTimeout : setTimeout)(() => {
    toastTimers.delete(id);
    useToastStore.setState((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  }, TOAST_TTL_MS);
  toastTimers.set(id, timer);
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
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
