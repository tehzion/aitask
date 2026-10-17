import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { msg } from '../lib/messages';
import { useToastStore } from './useToastStore';

describe('toast lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useToastStore.getState().toasts.forEach(toast => useToastStore.getState().removeToast(toast.id));
    vi.useRealTimers();
  });

  it('deduplicates identical messages and refreshes their lifetime', () => {
    useToastStore.getState().addToast(msg('feedback.changesSaved'), 'success');
    const first = useToastStore.getState().toasts[0];

    vi.advanceTimersByTime(4000);
    useToastStore.getState().addToast(msg('feedback.changesSaved'), 'success');

    expect(useToastStore.getState().toasts).toEqual([first]);
    vi.advanceTimersByTime(4499);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('keeps error feedback visible longer than success feedback', () => {
    useToastStore.getState().addToast('Saved', 'success');
    vi.advanceTimersByTime(4500);
    expect(useToastStore.getState().toasts).toEqual([]);

    useToastStore.getState().addToast('Could not save', 'error');
    vi.advanceTimersByTime(11999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
