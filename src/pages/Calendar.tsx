import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import {
  ArrowRight,
  Calendar as CalendarIcon,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Flag,
  GripVertical,
  Loader2,
  Plus,
  User,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import ModalShell from '../components/ModalShell';
import { Badge, Button } from '../components/ui';
import { cardBase, fieldLabel, inputBase, modalFooter, pageShell, panelHeader } from '../components/uiTokens';
import {
  buildCalendarWeekLayout,
  normalizeCalendarTaskRange,
  resizeCalendarTaskRange,
  shiftCalendarTaskRange,
  taskOccursOnCalendarDate,
  type CalendarRangeSegment,
} from '../lib/calendarRanges';
import { canCreateTasks, canEditTask as canEditTaskByRole, getVisibleTasks } from '../lib/access';
import { getHolidaysForDate, HOLIDAY_COLORS, type MalaysiaHoliday } from '../lib/malaysiaHolidays';
import { getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { useStore } from '../store';
import type { Task } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DragMode = 'move' | 'start' | 'due';

interface TaskDragState {
  taskId: string;
  mode: DragMode;
  anchorDate: string;
}

interface DateEditorDraft {
  startDate: string;
  dueDate: string;
}

interface PendingDateAttempt {
  taskId: string;
  original: DateEditorDraft & { updatedAt?: string };
  attempted: DateEditorDraft;
  source: 'editor' | 'drag';
  lastPulledAt?: string;
}

const taskDateLabel = (task: Task) => {
  const range = normalizeCalendarTaskRange(task);
  if (!range) return 'Task dates unavailable';
  if (!range.hasDueDate) return `Starts ${format(range.start, 'd MMM yyyy')} · No due date`;
  if (range.durationDays === 1) return `${format(range.start, 'd MMM yyyy')} · One day`;
  return `${format(range.start, 'd MMM yyyy')} to ${format(range.end, 'd MMM yyyy')} · ${range.durationDays} days`;
};

const Calendar: React.FC = () => {
  const {
    tasks: allTasks,
    users,
    currentUser,
    rolePermissions,
    backend,
    updateTask,
    setCreateTaskModalOpen,
    commitPendingMutation,
    retryMutation,
    discardMutation,
  } = useStore();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [showHolidays, setShowHolidays] = useState(true);
  const [dragState, setDragState] = useState<TaskDragState | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [dropSuccess, setDropSuccess] = useState<string | null>(null);
  const [syncError, setSyncError] = useState('');
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState<DateEditorDraft | null>(null);
  const [dateDraftError, setDateDraftError] = useState('');
  const [pendingDateAttempt, setPendingDateAttempt] = useState<PendingDateAttempt | null>(null);
  const successTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (successTimer.current) window.clearTimeout(successTimer.current);
  }, []);

  const tasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions),
    [allTasks, currentUser, rolePermissions],
  );
  const taskById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const editingTask = editingTaskId ? taskById.get(editingTaskId) : undefined;
  const editingPendingAttempt = pendingDateAttempt?.taskId === editingTaskId
    ? pendingDateAttempt
    : null;
  const hasBlockedMutation = backend.pendingMutations > 0
    && ['offline', 'conflict', 'retry_required'].includes(backend.status);

  const nextPeriod = () => setCurrentDate(viewMode === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  const prevPeriod = () => setCurrentDate(viewMode === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  const goToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const handleAddTaskForDate = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    setSelectedDate(day);
    setCurrentDate(day);
    useStore.setState({ createTaskInitialDate: dateStr });
    setCreateTaskModalOpen(true);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = viewMode === 'month' ? startOfWeek(monthStart) : startOfWeek(currentDate);
  const calendarEnd = viewMode === 'month' ? endOfWeek(monthEnd) : endOfWeek(currentDate);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const maxVisibleLanes = viewMode === 'month' ? 3 : 6;
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => {
    const weekDays = days.slice(index * 7, index * 7 + 7);
    return {
      days: weekDays,
      layout: buildCalendarWeekLayout(tasks, weekDays[0], maxVisibleLanes),
    };
  });

  const getUserName = (id: string) => users.find(user => user.id === id)?.name || 'Unknown';
  const getTasksForDay = (day: Date) => tasks.filter(task => taskOccursOnCalendarDate(task, day));
  const getHolidaysForDay = (day: Date): MalaysiaHoliday[] => (
    showHolidays ? getHolidaysForDate(format(day, 'yyyy-MM-dd')) : []
  );
  const canEditTaskDates = useCallback(
    (task: Task) => (
      canEditTaskByRole(currentUser, task, rolePermissions)
      && savingTaskId !== task.id
      && !backend.isSaving
      && !hasBlockedMutation
    ),
    [backend.isSaving, currentUser, hasBlockedMutation, rolePermissions, savingTaskId],
  );

  const showSavedMessage = (title: string) => {
    if (successTimer.current) window.clearTimeout(successTimer.current);
    setDropSuccess(title);
    successTimer.current = window.setTimeout(() => setDropSuccess(null), 2500);
  };

  const saveTaskDateRange = async (
    taskId: string,
    nextDates: DateEditorDraft,
    successMessage = 'dates updated',
    source: PendingDateAttempt['source'] = 'editor',
  ) => {
    const task = useStore.getState().tasks.find(item => item.id === taskId);
    if (!task) {
      const error = 'This task is no longer available.';
      setSyncError(error);
      return { ok: false, error };
    }
    if (savingTaskId === taskId) return { ok: false, error: 'This task is already being saved.' };
    if (task.startDate === nextDates.startDate && task.dueDate === nextDates.dueDate) {
      setSyncError('');
      return { ok: true };
    }

    const previous = {
      startDate: task.startDate,
      dueDate: task.dueDate,
      updatedAt: task.updatedAt,
    };
    setSavingTaskId(taskId);
    setSyncError('');

    const updateResult = updateTask(taskId, nextDates);
    if (!updateResult.ok) {
      const error = updateResult.error || 'Unable to update the task dates.';
      setSavingTaskId(null);
      setSyncError(error);
      if (source === 'drag') {
        setEditingTaskId(taskId);
        setDateDraft(nextDates);
        setDateDraftError(error);
      }
      return { ok: false, error };
    }

    const saveResult = await commitPendingMutation('task.update');
    if (!saveResult.ok) {
      const error = saveResult.error || 'The date change was rolled back. Review the attempted dates before retrying.';
      useStore.setState(state => ({
        tasks: state.tasks.map(item => (
          item.id === taskId
            ? {
                ...item,
                startDate: previous.startDate,
                dueDate: previous.dueDate,
                updatedAt: previous.updatedAt,
              }
          : item
        )),
      }));
      setPendingDateAttempt({
        taskId,
        original: previous,
        attempted: nextDates,
        source,
        lastPulledAt: useStore.getState().backend.lastPulledAt,
      });
      setEditingTaskId(taskId);
      setDateDraft(nextDates);
      setDateDraftError(error);
      setSavingTaskId(null);
      setSyncError(error);
      return { ok: false, error };
    }

    setSavingTaskId(null);
    setPendingDateAttempt(null);
    setSyncError('');
    showSavedMessage(`${task.title} · ${successMessage}`);
    return { ok: true };
  };

  const openDateEditor = (task: Task) => {
    if (!canEditTaskByRole(currentUser, task, rolePermissions)) {
      navigate(`/tasks?taskId=${encodeURIComponent(task.id)}`);
      return;
    }
    setEditingTaskId(task.id);
    const pending = pendingDateAttempt?.taskId === task.id ? pendingDateAttempt : null;
    setDateDraft(pending?.attempted || { startDate: task.startDate, dueDate: task.dueDate });
    setDateDraftError(pending ? 'Review the attempted dates, then retry or use the latest saved range.' : '');
  };

  const closeDateEditor = () => {
    if (savingTaskId === editingTaskId || editingPendingAttempt) return;
    setEditingTaskId(null);
    setDateDraft(null);
    setDateDraftError('');
  };

  const handleDateEditorSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTask || !dateDraft) return;
    if (!DATE_PATTERN.test(dateDraft.startDate)) {
      setDateDraftError('Choose a valid start date.');
      return;
    }
    if (dateDraft.dueDate && !DATE_PATTERN.test(dateDraft.dueDate)) {
      setDateDraftError('Choose a valid due date or leave it blank.');
      return;
    }
    if (dateDraft.dueDate && isBefore(parseISO(dateDraft.dueDate), parseISO(dateDraft.startDate))) {
      setDateDraftError('Due date cannot be earlier than the start date.');
      return;
    }

    setDateDraftError('');
    const result = await saveTaskDateRange(editingTask.id, dateDraft);
    if (result.ok) {
      closeDateEditor();
    } else {
      setDateDraftError(result.error || 'Unable to save these dates.');
    }
  };

  const handleRetryDates = async () => {
    if (!editingPendingAttempt || savingTaskId === editingPendingAttempt.taskId) return;
    setSavingTaskId(editingPendingAttempt.taskId);
    setDateDraftError('');
    const result = await retryMutation();
    setSavingTaskId(null);
    if (!result.ok) {
      setDateDraftError(result.error || 'The date change still needs attention.');
      return;
    }

    const latestTask = useStore.getState().tasks.find(item => item.id === editingPendingAttempt.taskId);
    if (!latestTask) {
      setDateDraftError('The task was saved but could not be reloaded. Check the latest workspace state.');
      return;
    }
    setDateDraft({ startDate: latestTask.startDate, dueDate: latestTask.dueDate });
  };

  const handleUseLatestDates = async () => {
    if (!editingPendingAttempt || savingTaskId === editingPendingAttempt.taskId) return;
    setSavingTaskId(editingPendingAttempt.taskId);
    setDateDraftError('');
    await discardMutation();
    setSavingTaskId(null);
  };

  useEffect(() => {
    if (!pendingDateAttempt) return;
    if (
      backend.pendingMutations > 0
      || backend.status !== 'live'
      || backend.isSaving
      || backend.isPulling
      || backend.lastPulledAt === pendingDateAttempt.lastPulledAt
    ) {
      return;
    }

    const latestTask = useStore.getState().tasks.find(item => item.id === pendingDateAttempt.taskId);
    const retryApplied = latestTask?.startDate === pendingDateAttempt.attempted.startDate
      && latestTask?.dueDate === pendingDateAttempt.attempted.dueDate;
    if (retryApplied && latestTask) {
      showSavedMessage(`${latestTask.title} · dates updated`);
    }

    setPendingDateAttempt(null);
    setEditingTaskId(null);
    setDateDraft(null);
    setDateDraftError('');
    setSyncError('');
  }, [
    backend.isPulling,
    backend.isSaving,
    backend.lastPulledAt,
    backend.pendingMutations,
    backend.status,
    pendingDateAttempt,
  ]);

  const startTaskDrag = (
    event: React.DragEvent<HTMLElement>,
    task: Task,
    mode: DragMode,
    anchorDate: string,
  ) => {
    if (!canEditTaskDates(task)) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.setData('application/x-aitask-task-id', task.id);
    event.dataTransfer.setData('application/x-aitask-drag-mode', mode);
    event.dataTransfer.setData('application/x-aitask-anchor-date', anchorDate);
    event.dataTransfer.effectAllowed = 'move';
    setDragState({ taskId: task.id, mode, anchorDate });
    setSyncError('');
  };

  const startTaskBodyDrag = (
    event: React.DragEvent<HTMLButtonElement>,
    task: Task,
    segment: CalendarRangeSegment,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const dayOffset = Math.min(
      segment.spanDays - 1,
      Math.max(0, Math.floor(relativeX * segment.spanDays)),
    );
    const anchorDate = format(addDays(parseISO(segment.startDate), dayOffset), 'yyyy-MM-dd');
    startTaskDrag(event, task, 'move', anchorDate);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDropTargetDate(null);
  };

  const getDayFromWeekPointer = (event: React.DragEvent<HTMLDivElement>, weekDays: Date[]) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const column = Math.min(6, Math.max(0, Math.floor((event.clientX - rect.left) / (rect.width / 7))));
    return weekDays[column] || null;
  };

  const handleWeekDragOver = (event: React.DragEvent<HTMLDivElement>, weekDays: Date[]) => {
    if (!dragState) return;
    const day = getDayFromWeekPointer(event, weekDays);
    if (!day) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetDate(format(day, 'yyyy-MM-dd'));
  };

  const applyDrop = async (event: React.DragEvent, targetDay: Date) => {
    event.preventDefault();
    const taskId = dragState?.taskId || event.dataTransfer.getData('application/x-aitask-task-id');
    const mode = (dragState?.mode || event.dataTransfer.getData('application/x-aitask-drag-mode')) as DragMode;
    const anchorDate = dragState?.anchorDate || event.dataTransfer.getData('application/x-aitask-anchor-date');
    const task = taskById.get(taskId);
    const targetDate = format(targetDay, 'yyyy-MM-dd');

    setDragState(null);
    setDropTargetDate(null);
    if (!task || !canEditTaskDates(task)) return;

    const nextDates = mode === 'move'
      ? shiftCalendarTaskRange(task, anchorDate, targetDate)
      : resizeCalendarTaskRange(task, mode, targetDate);
    if (nextDates.ok === false) {
      setSyncError(nextDates.error);
      return;
    }

    setSelectedDate(targetDay);
    const result = await saveTaskDateRange(
      task.id,
      { startDate: nextDates.startDate, dueDate: nextDates.dueDate },
      mode === 'move' ? 'date range moved' : `${mode === 'start' ? 'start' : 'due'} date adjusted`,
      'drag',
    );
    if (result.ok) setCurrentDate(targetDay);
  };

  const handleWeekDrop = (event: React.DragEvent<HTMLDivElement>, weekDays: Date[]) => {
    const day = getDayFromWeekPointer(event, weekDays);
    if (day) void applyDrop(event, day);
  };

  const handleWeekDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDropTargetDate(null);
  };

  const getDeptDot = (department: string) => {
    switch (department) {
      case 'Designer': return 'bg-pink-400';
      case 'Editor':
      case 'Video Editor': return 'bg-blue-400';
      case 'Videoshooting':
      case 'Video Shooting': return 'bg-violet-400';
      case 'Ads Management': return 'bg-amber-400';
      case 'Account & Finance': return 'bg-emerald-400';
      case 'Management': return 'bg-blue-400';
      case 'Operation': return 'bg-slate-400';
      default: return 'bg-slate-400';
    }
  };

  const getDeptBadge = (department: string) => {
    switch (department) {
      case 'Designer': return 'bg-pink-50 text-pink-700';
      case 'Editor':
      case 'Video Editor': return 'bg-blue-50 text-blue-700';
      case 'Videoshooting':
      case 'Video Shooting': return 'bg-violet-50 text-violet-700';
      case 'Ads Management': return 'bg-amber-50 text-amber-700';
      case 'Account & Finance': return 'bg-emerald-50 text-emerald-700';
      case 'Management': return 'bg-blue-50 text-blue-700';
      case 'Operation': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getTaskBarTone = (task: Task) => {
    if (task.isCompleted || task.status === 'Completed') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100';
    }
    if (task.status === 'Cancelled') {
      return 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200';
    }
    const dueDate = parseOptionalDate(task.dueDate);
    if (dueDate && isBefore(dueDate, new Date()) && !isToday(dueDate)) {
      return 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100';
    }
    return 'border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100';
  };

  const selectedDayTasks = getTasksForDay(selectedDate);
  const selectedDayHolidays = getHolidaysForDay(selectedDate);
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  return (
    <div className={pageShell}>
      <div className="flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-950">Team Calendar</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            See each task from start to due date. Drag a range to move it, or adjust either edge.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHolidays(value => !value)}
              aria-pressed={showHolidays}
              className={clsx(
                'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                showHolidays
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              <Flag className="h-3 w-3" /> MY Holidays
            </button>

            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                aria-pressed={viewMode === 'month'}
                onClick={() => setViewMode('month')}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  viewMode === 'month' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                Month
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'week'}
                onClick={() => setViewMode('week')}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  viewMode === 'week' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                Week
              </button>
            </div>

            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={prevPeriod}
                aria-label={`Previous ${viewMode}`}
                title={`Previous ${viewMode}`}
                className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                <CalendarIcon className="h-4 w-4" />
                {viewMode === 'month'
                  ? format(currentDate, 'MMMM yyyy')
                  : `${format(calendarStart, 'MMM d')} - ${format(calendarEnd, 'MMM d, yyyy')}`}
              </button>
              <button
                type="button"
                onClick={nextPeriod}
                aria-label={`Next ${viewMode}`}
                title={`Next ${viewMode}`}
                className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {canCreateTasks(currentUser, rolePermissions) && (
              <Button onClick={() => handleAddTaskForDate(selectedDate)}>
                <Plus className="h-4 w-4" /> Assign Task
              </Button>
            )}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {showHolidays && (
            <>
              <span className="font-semibold text-slate-600">Malaysia holidays</span>
              {(['national', 'religious', 'cultural', 'federal'] as const).map(category => (
                <span key={category} className="flex items-center gap-1.5 capitalize">
                  <span className={clsx('h-2.5 w-2.5 rounded-sm', HOLIDAY_COLORS[category].dot)} />
                  {category}
                </span>
              ))}
            </>
          )}
        </div>
        <p className="hidden shrink-0 items-center gap-1.5 text-xs text-slate-400 2xl:flex">
          <GripVertical className="h-3 w-3" />
          Drag the bar to move · drag either edge to resize
        </p>
      </div>

      {dropSuccess && (
        <div
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{dropSuccess}</span>
        </div>
      )}
      {syncError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert" aria-live="assertive">
          {syncError}
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className={clsx(cardBase, 'min-w-0 flex-1 overflow-hidden')}>
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map(day => (
              <div key={day} className="py-2.5 text-center text-xs font-semibold uppercase text-slate-400">
                <span className="sm:hidden">{day.slice(0, 1)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-slate-200">
            {weeks.map(week => (
              <div
                key={week.layout.weekStart}
                onDragOver={event => handleWeekDragOver(event, week.days)}
                onDragLeave={handleWeekDragLeave}
                onDrop={event => handleWeekDrop(event, week.days)}
                className={clsx(
                  'relative',
                  viewMode === 'month' ? 'h-24 md:h-[154px]' : 'h-28 md:h-[230px]',
                )}
              >
                <div className="absolute inset-0 grid grid-cols-7 divide-x divide-slate-100">
                  {week.days.map(day => {
                    const dayTasks = getTasksForDay(day);
                    const dayHolidays = getHolidaysForDay(day);
                    const inMonth = viewMode === 'week' || isSameMonth(day, monthStart);
                    const todayDay = isToday(day);
                    const selected = isSameDay(day, selectedDate);
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isDropTarget = dropTargetDate === dateStr;
                    const primaryHoliday = dayHolidays[0];
                    const hiddenCount = week.layout.overflowByDate[dateStr] || 0;

                    return (
                      <div
                        key={dateStr}
                        data-calendar-date={dateStr}
                        onClick={() => setSelectedDate(day)}
                        className={clsx(
                          'relative min-w-0 cursor-pointer select-none transition-colors',
                          !inMonth && 'bg-slate-50',
                          inMonth && !primaryHoliday && !isDropTarget && 'bg-white hover:bg-slate-50',
                          inMonth && primaryHoliday && !isDropTarget && HOLIDAY_COLORS[primaryHoliday.category].bg,
                          isDropTarget && 'bg-blue-100 ring-2 ring-inset ring-blue-400',
                          selected && !isDropTarget && 'ring-2 ring-inset ring-blue-300',
                        )}
                      >
                        <div className="flex items-center justify-between p-1.5">
                          <span className={clsx(
                            'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                            todayDay ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300',
                          )}>
                            {format(day, 'd')}
                          </span>
                          <div className="flex items-center gap-1">
                            {dayHolidays.length > 0 && inMonth && (
                              <span title={dayHolidays.map(holiday => holiday.name).join(', ')}>
                                <Flag className={clsx('h-3 w-3', HOLIDAY_COLORS[primaryHoliday.category].text)} />
                              </span>
                            )}
                            {canCreateTasks(currentUser, rolePermissions) && inMonth && (
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  handleAddTaskForDate(day);
                                }}
                                title={`Assign task on ${format(day, 'd MMM yyyy')}`}
                                aria-label={`Assign task on ${format(day, 'd MMM yyyy')}`}
                                className="hidden h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 sm:flex"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {dayHolidays.length > 0 && inMonth && !isDropTarget && (
                          <div
                            className={clsx(
                              'mx-1 hidden truncate rounded px-1 py-0.5 text-[9px] font-semibold leading-tight md:block',
                              HOLIDAY_COLORS[primaryHoliday.category].badge,
                            )}
                            title={dayHolidays.map(holiday => holiday.name).join(' · ')}
                          >
                            {primaryHoliday.name}
                          </div>
                        )}

                        {isDropTarget && (
                          <span className="absolute left-1/2 top-10 -translate-x-1/2 rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                            Drop
                          </span>
                        )}

                        {dayTasks.length > 0 && (
                          <div className="absolute bottom-1 right-1 md:hidden">
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                              {dayTasks.length}
                            </span>
                          </div>
                        )}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              setSelectedDate(day);
                            }}
                            className="absolute bottom-1 left-1 hidden rounded px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 md:block"
                            aria-label={`Show ${hiddenCount} more task${hiddenCount === 1 ? '' : 's'} active on ${format(day, 'd MMM yyyy')}`}
                          >
                            +{hiddenCount} more
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div
                  className="pointer-events-none absolute inset-x-0 top-14 hidden grid-cols-7 md:grid"
                  style={{ gridAutoRows: '24px', rowGap: '3px' }}
                >
                  {week.layout.segments.filter(segment => !segment.hidden).map(segment => {
                    const task = taskById.get(segment.taskId);
                    if (!task) return null;
                    const editable = canEditTaskDates(task);
                    const range = normalizeCalendarTaskRange(task);
                    const title = taskDateLabel(task);

                    return (
                      <div
                        key={`${task.id}-${week.layout.weekStart}`}
                        role="group"
                        aria-label={`${task.title}. ${title}`}
                        title={`${task.clientName} · ${task.title} · ${title}`}
                        className={clsx(
                          'pointer-events-auto mx-0.5 flex min-w-0 items-stretch overflow-hidden border text-[10px] font-semibold shadow-sm transition-colors',
                          segment.continuesBefore ? 'rounded-l-none border-l-0' : 'rounded-l-md',
                          segment.continuesAfter ? 'rounded-r-none border-r-0' : 'rounded-r-md',
                          getTaskBarTone(task),
                          dragState?.taskId === task.id && 'opacity-40',
                          savingTaskId === task.id && 'animate-pulse',
                        )}
                        style={{
                          gridColumn: `${segment.startColumn} / span ${segment.spanDays}`,
                          gridRow: String(segment.lane + 1),
                        }}
                      >
                        {segment.isActualStart && editable && (
                          <button
                            type="button"
                            draggable
                            onClick={event => event.stopPropagation()}
                            onDragStart={event => startTaskDrag(event, task, 'start', range?.startDate || task.startDate)}
                            onDragEnd={handleDragEnd}
                            aria-label={`Adjust start date for ${task.title}`}
                            title="Drag to adjust start date"
                            className="flex w-2 shrink-0 cursor-ew-resize items-center justify-center border-r border-current/10 bg-white/35 hover:bg-white/70"
                          >
                            <span className="h-3 w-0.5 rounded-full bg-current/50" />
                          </button>
                        )}

                        <button
                          type="button"
                          draggable={editable}
                          onDragStart={editable ? event => startTaskBodyDrag(event, task, segment) : undefined}
                          onDragEnd={handleDragEnd}
                          onClick={() => openDateEditor(task)}
                          className={clsx(
                            'flex min-w-0 flex-1 items-center gap-1 px-1.5 text-left outline-none',
                            editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                          )}
                          aria-label={`${editable ? 'Edit dates for' : 'Open'} ${task.title}. ${title}`}
                        >
                          {savingTaskId === task.id ? (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                          ) : (
                            <span className={clsx('h-2 w-2 shrink-0 rounded-full', getDeptDot(task.department))} />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {task.clientName && segment.spanDays > 1 ? `${task.clientName} · ` : ''}
                            {task.title}
                          </span>
                        </button>

                        {segment.isActualEnd && editable && (
                          <button
                            type="button"
                            draggable
                            onClick={event => event.stopPropagation()}
                            onDragStart={event => startTaskDrag(event, task, 'due', range?.endDate || task.startDate)}
                            onDragEnd={handleDragEnd}
                            aria-label={`Adjust due date for ${task.title}`}
                            title={range?.hasDueDate ? 'Drag to adjust due date' : 'Drag to add a due date'}
                            className="flex w-2 shrink-0 cursor-ew-resize items-center justify-center border-l border-current/10 bg-white/35 hover:bg-white/70"
                          >
                            <span className="h-3 w-0.5 rounded-full bg-current/50" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className={clsx(cardBase, 'flex w-full shrink-0 flex-col overflow-hidden xl:w-80')}>
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-400">Selected day</p>
              <h2 className="mt-0.5 truncate text-base font-bold text-slate-800">
                {format(selectedDate, 'EEEE, d MMMM yyyy')}
              </h2>
            </div>
            {canCreateTasks(currentUser, rolePermissions) && (
              <button
                type="button"
                onClick={() => handleAddTaskForDate(selectedDate)}
                title="Assign task for this day"
                aria-label="Assign task for this day"
                className="shrink-0 rounded-md p-1 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
            {selectedDayHolidays.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
                  <Flag className="h-3 w-3" /> Public Holiday
                </p>
                {selectedDayHolidays.map(holiday => (
                  <div
                    key={`${holiday.date}-${holiday.name}`}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                      HOLIDAY_COLORS[holiday.category].badge,
                    )}
                  >
                    <span className={clsx('h-2 w-2 shrink-0 rounded-full', HOLIDAY_COLORS[holiday.category].dot)} />
                    {holiday.name}
                  </div>
                ))}
              </div>
            )}

            <div
              className={clsx(
                '-m-2 space-y-2 rounded-lg p-2 ring-2 ring-inset ring-transparent transition-colors',
                dropTargetDate === selectedDateStr && 'bg-blue-50 ring-blue-300',
              )}
              onDragOver={event => {
                if (!dragState) return;
                event.preventDefault();
                setDropTargetDate(selectedDateStr);
              }}
              onDragLeave={event => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                setDropTargetDate(null);
              }}
              onDrop={event => void applyDrop(event, selectedDate)}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
                <CalendarRange className="h-3 w-3" />
                {selectedDayTasks.length} active task{selectedDayTasks.length === 1 ? '' : 's'}
              </p>

              {selectedDayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 py-8 text-center">
                  <p className="text-sm text-slate-400">No active tasks</p>
                  <p className="mb-1 text-xs text-slate-300">Choose another day or assign a task</p>
                  {canCreateTasks(currentUser, rolePermissions) && (
                    <Button
                      onClick={() => handleAddTaskForDate(selectedDate)}
                      variant="secondary"
                      className="h-8 min-h-8 px-2.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" /> Assign Task
                    </Button>
                  )}
                </div>
              ) : (
                selectedDayTasks.map(task => {
                  const canEdit = canEditTaskByRole(currentUser, task, rolePermissions);
                  const dueDate = parseOptionalDate(task.dueDate);
                  const isOverdue = Boolean(
                    dueDate
                    && !task.isCompleted
                    && task.status !== 'Cancelled'
                    && isBefore(dueDate, new Date())
                    && !isToday(dueDate),
                  );

                  return (
                    <article
                      key={task.id}
                      className={clsx(
                        'rounded-lg border bg-white p-3 transition-colors',
                        isOverdue ? 'border-red-200 border-l-4 border-l-red-500' : 'border-slate-200',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', getDeptDot(task.department))} />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/tasks?taskId=${encodeURIComponent(task.id)}`}
                            className={clsx(
                              'text-sm font-semibold leading-snug text-slate-800 transition-colors hover:text-blue-700',
                              task.isCompleted && 'text-slate-400 line-through',
                              isOverdue && 'text-red-900',
                            )}
                          >
                            {task.title}
                          </Link>
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">{task.clientName}</p>
                        </div>
                        <Badge tone={task.isCompleted ? 'emerald' : task.priority === 'Urgent' ? 'red' : task.priority === 'High' ? 'amber' : 'slate'}>
                          {task.priority}
                        </Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold', getDeptBadge(task.department))}>
                          {task.department}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <User className="h-2.5 w-2.5" /> {getUserName(task.assignedTo)}
                        </span>
                        <Badge tone={task.status === 'Completed' ? 'emerald' : task.status === 'Cancelled' ? 'slate' : 'blue'} className="px-1.5 py-0.5 text-[10px]">
                          {task.status}
                        </Badge>
                      </div>

                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openDateEditor(task)}
                          disabled={savingTaskId === task.id || hasBlockedMutation}
                          aria-label={`Edit dates for ${task.title}`}
                          className="mt-3 flex w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingTaskId === task.id ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                          ) : (
                            <CalendarRange className="h-4 w-4 shrink-0 text-blue-600" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-semibold uppercase text-slate-400">Start and due</span>
                            <span className="block truncate text-xs font-semibold text-slate-700">{taskDateLabel(task)}</span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </button>
                      ) : (
                        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                          <CalendarRange className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0">
                            <span className="block text-[10px] font-semibold uppercase text-slate-400">Start and due</span>
                            <span className="block truncate text-xs font-semibold text-slate-700">{taskDateLabel(task)}</span>
                          </span>
                        </div>
                      )}

                      <p
                        className={clsx(
                          'mt-2 flex items-center gap-1 text-[10px] font-medium',
                          isOverdue ? 'font-bold text-red-700' : 'text-slate-500',
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      {editingTask && dateDraft && (
        <ModalShell
          labelledBy="calendar-date-editor-title"
          describedBy="calendar-date-editor-description"
          onClose={closeDateEditor}
          closeOnBackdrop={savingTaskId !== editingTask.id && !editingPendingAttempt}
          panelClassName="max-w-md"
        >
          <div className={panelHeader}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="calendar-date-editor-title" className="truncate text-lg font-semibold text-slate-950">
                Edit task dates
              </h2>
              <p id="calendar-date-editor-description" className="truncate text-sm text-slate-500">
                {editingTask.title}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDateEditor}
              disabled={savingTaskId === editingTask.id || Boolean(editingPendingAttempt)}
              aria-label="Close date editor"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleDateEditorSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Current range</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{taskDateLabel(editingTask)}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={fieldLabel}>Start Date</span>
                  <input
                    type="date"
                    required
                    value={dateDraft.startDate}
                    max={dateDraft.dueDate || undefined}
                    disabled={Boolean(editingPendingAttempt)}
                    onChange={event => {
                      setDateDraft(current => current ? { ...current, startDate: event.target.value } : current);
                      setDateDraftError('');
                    }}
                    className={clsx(inputBase, 'h-11 px-3')}
                    data-autofocus
                  />
                </label>
                <label>
                  <span className={fieldLabel}>Due Date <span className="font-normal text-slate-400">(optional)</span></span>
                  <input
                    type="date"
                    value={dateDraft.dueDate}
                    min={dateDraft.startDate || undefined}
                    disabled={Boolean(editingPendingAttempt)}
                    onChange={event => {
                      setDateDraft(current => current ? { ...current, dueDate: event.target.value } : current);
                      setDateDraftError('');
                    }}
                    className={clsx(inputBase, 'h-11 px-3')}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-5 text-slate-500">
                  Leave Due Date blank to show this task only on its Start Date.
                </p>
                {dateDraft.dueDate && (
                  <button
                    type="button"
                    disabled={Boolean(editingPendingAttempt)}
                    onClick={() => {
                      setDateDraft(current => current ? { ...current, dueDate: '' } : current);
                      setDateDraftError('');
                    }}
                    className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    Clear due date
                  </button>
                )}
              </div>

              {dateDraftError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700" role="alert">
                  {dateDraftError}
                </div>
              )}
              {editingPendingAttempt ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="alert">
                  <p className="font-semibold">Attempted range retained</p>
                  <p className="mt-1 leading-5">
                    Retry will save {editingPendingAttempt.attempted.startDate}
                    {editingPendingAttempt.attempted.dueDate
                      ? ` to ${editingPendingAttempt.attempted.dueDate}`
                      : ' with no due date'}.
                    Use latest will discard this attempt.
                  </p>
                </div>
              ) : hasBlockedMutation && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800" role="alert">
                  Resolve the current sync issue with Retry or Discard before changing these dates.
                </div>
              )}
            </div>

            <div className={clsx(modalFooter, 'sm:justify-between')}>
              <Link
                to={`/tasks?taskId=${encodeURIComponent(editingTask.id)}`}
                onClick={event => {
                  if (editingPendingAttempt) event.preventDefault();
                  else closeDateEditor();
                }}
                aria-disabled={Boolean(editingPendingAttempt)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
              >
                Open task <ExternalLink className="h-4 w-4" />
              </Link>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {editingPendingAttempt ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleUseLatestDates()}
                      disabled={savingTaskId === editingTask.id || backend.status === 'offline'}
                    >
                      Use latest
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleRetryDates()}
                      disabled={savingTaskId === editingTask.id || backend.status === 'offline'}
                    >
                      {savingTaskId === editingTask.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      {savingTaskId === editingTask.id ? 'Retrying' : 'Retry dates'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeDateEditor}
                      disabled={savingTaskId === editingTask.id}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={savingTaskId === editingTask.id || hasBlockedMutation}
                    >
                      {savingTaskId === editingTask.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      {savingTaskId === editingTask.id ? 'Saving' : 'Save dates'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
};

export default Calendar;
