import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, User } from '../types';
import { useToastStore } from '../store/useToastStore';
import { acknowledgeActionFeedback, clearActionFeedback, dismissActionFeedback, queueActionFeedback } from './actionFeedback';
import { msg } from './messages';
import { invalidateWorkspaceSession } from './workspaceSession';

const actor = { id: 'staff', name: 'Staff', role: 'Staff' } as User;
const task = (priority = 'High') => ({ id: 'task', priority } as Task);
beforeEach(() => { vi.useFakeTimers(); clearActionFeedback(); useToastStore.setState({ toasts: [] }); });
afterEach(() => { useToastStore.getState().toasts.forEach(toast => useToastStore.getState().removeToast(toast.id)); vi.useRealTimers(); });
describe('acknowledged action feedback', () => {
  it('does not call optimistic work saved and confirms a retry only once', () => {
    const current = { currentUser: actor, tasks: [task()], clients: [] };
    queueActionFeedback(actor.id, 'priority', msg('task.priorityUpdated', { priority: 'High' }), saved => saved.tasks.some(item => item.priority === 'High'));
    expect(useToastStore.getState().toasts).toEqual([]);
    acknowledgeActionFeedback(current, { tasks: [task('Low')], clients: [] });
    expect(useToastStore.getState().toasts).toEqual([]);
    acknowledgeActionFeedback(current); acknowledgeActionFeedback(current);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
  it('does not acknowledge a newer attempt from an older saved snapshot', () => {
    const current = { currentUser: actor, tasks: [task('Urgent')], clients: [] };
    queueActionFeedback(actor.id, 'priority', msg('task.priorityUpdated', { priority: 'High' }), saved => saved.tasks.some(item => item.priority === 'High'));
    queueActionFeedback(actor.id, 'priority', msg('task.priorityUpdated', { priority: 'Urgent' }), saved => saved.tasks.some(item => item.priority === 'Urgent'));
    acknowledgeActionFeedback(current, { tasks: [task('High')], clients: [] });
    expect(useToastStore.getState().toasts).toEqual([]);
    acknowledgeActionFeedback(current);
    expect(useToastStore.getState().toasts.map(toast => toast.message)).toEqual([msg('task.priorityUpdated', { priority: 'Urgent' })]);
  });
  it.each(['discard', 'session', 'account'])('never announces an abandoned %s attempt', reason => {
    queueActionFeedback(actor.id, 'create', msg('feedback.changesSaved'), () => true);
    if (reason === 'discard') clearActionFeedback();
    if (reason === 'session') invalidateWorkspaceSession();
    acknowledgeActionFeedback({ currentUser: reason === 'account' ? { ...actor, id: 'hod' } : actor, tasks: [], clients: [] });
    expect(useToastStore.getState().toasts).toEqual([]);
  });
  it('suppresses a former task confirmation after navigation without abandoning its save', () => {
    queueActionFeedback(actor.id, 'task:old:comment:1', msg('feedback.workUpdateAdded'), () => true);
    dismissActionFeedback(actor.id, 'task:old');
    acknowledgeActionFeedback({ currentUser: actor, tasks: [], clients: [] });
    expect(useToastStore.getState().toasts).toEqual([]);
  });
  it('allows an inline confirmation without a duplicate toast', () => {
    queueActionFeedback(actor.id, 'dates', msg('feedback.datesSaved'), () => true, false);
    acknowledgeActionFeedback({ currentUser: actor, tasks: [], clients: [] });
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
