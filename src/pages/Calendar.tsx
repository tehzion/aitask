import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
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
  type LucideIcon,
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
  type CalendarRangeSegment,
} from '../lib/calendarRanges';
import { canCreateTasks, canEditTask as canEditTaskByRole, getVisibleTasks } from '../lib/access';
import { getHolidaysForDate, HOLIDAY_COLORS, type MalaysiaHoliday } from '../lib/malaysiaHolidays';
import { getRelativeDueDateString, parseOptionalDate } from '../lib/utils';
import { DAYS_IN_WORK_WEEK, getWorkWeekRange } from '../lib/workWeek';
import { formatLocalizedDate, formatLocalizedMonth, formatLocalizedWeekdayDate } from '../lib/i18n';
import {
  filterCalendarTasks,
  getCalendarOverview,
  getCalendarTaskSummary,
  type CalendarFilter,
} from '../lib/calendarMetrics';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import type { Task } from '../types';
import { useI18n } from '../components/I18nProvider';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

const taskDateLabel = (
  task: Task,
  formatDate: (value: Date) => string = value => format(value, 'd MMM yyyy'),
  translate: (value: string) => string = value => value,
) => {
  const range = normalizeCalendarTaskRange(task);
  if (!range) return translate('Task dates unavailable');
  if (!range.hasDueDate) return `${translate('Starts')} ${formatDate(range.start)} · ${translate('No due date')}`;
  if (range.durationDays === 1) return `${formatDate(range.start)} · ${translate('One day')}`;
  return `${formatDate(range.start)} ${translate('to')} ${formatDate(range.end)} · ${range.durationDays} ${translate('days')}`;
};

const taskScheduleLabel = (
  task: Task,
  formatDate: (value: Date) => string = value => format(value, 'd MMM yyyy'),
  translate: (value: string) => string = value => value,
) => {
  const range = normalizeCalendarTaskRange(task);
  if (!range) return translate('Task dates unavailable');
  if (!range.hasDueDate) return `${translate('Starts')} ${formatDate(range.start)} · ${translate('No due date')}`;
  return `${translate('Starts')} ${formatDate(range.start)} · ${translate('Due')} ${formatDate(range.end)}`;
};

interface CalendarMetricButtonProps {
  filter: CalendarFilter;
  label: string;
  value: number;
  icon: LucideIcon;
  active: boolean;
  onSelect: (filter: CalendarFilter) => void;
}

const CalendarMetricButton: React.FC<CalendarMetricButtonProps> = ({ filter, label, value, icon: Icon, active, onSelect }) => (
  <button
    type="button"
    data-calendar-filter={filter}
    aria-pressed={active}
    aria-label={`${label}: ${value}`}
    onClick={() => onSelect(filter)}
    className={clsx(
      'flex min-h-20 min-w-0 items-center gap-3 rounded-panel border px-3 py-3 text-left transition-[background-color,border-color,box-shadow,color] duration-160',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
      active
        ? 'border-accent bg-accent-soft text-ink ring-1 ring-accent/20'
        : 'border-line bg-surface text-ink hover:border-accent/35 hover:bg-inset',
    )}
  >
    <span className={clsx(
      'flex h-10 w-10 shrink-0 items-center justify-center rounded-control',
      active ? 'bg-accent text-white' : 'bg-inset text-muted',
    )}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
    <span className="min-w-0">
      <span className="block truncate text-xs font-semibold text-muted">{label}</span>
      <span className="calm-number mt-1 block text-2xl font-semibold leading-7 text-ink">{value}</span>
    </span>
  </button>
);

const Calendar: React.FC = () => {
  const { locale, t } = useI18n();
  const {
    tasks: allTasks,
    users,
    currentUser,
    rolePermissions,
    backend,
    updateTask,
    setCreateTaskModalOpen,
    commitPendingMutation,
    retryPendingSave,
    discardMutation,
    clientProfiles,
    projects,
  } = useStore(useShallow(state => ({
    tasks: state.tasks,
    users: state.users,
    currentUser: state.currentUser,
    rolePermissions: state.rolePermissions,
    backend: state.backend,
    updateTask: state.updateTask,
    setCreateTaskModalOpen: state.setCreateTaskModalOpen,
    commitPendingMutation: state.commitPendingMutation,
    retryPendingSave: state.retryPendingSave,
    discardMutation: state.discardMutation,
    clientProfiles: state.clients,
    projects: state.projects,
  })));
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [showHolidays, setShowHolidays] = useState(true);
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('all');
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

  const visibleTasks = useMemo(
    () => getVisibleTasks(currentUser, allTasks, rolePermissions, { clients: clientProfiles, projects }),
    [allTasks, clientProfiles, currentUser, projects, rolePermissions],
  );
  const overview = getCalendarOverview(visibleTasks);
  const tasks = useMemo(
    () => filterCalendarTasks(visibleTasks, calendarFilter),
    [calendarFilter, visibleTasks],
  );
  const taskById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const rangeByTaskId = useMemo(
    () => new Map(tasks.map(task => [task.id, normalizeCalendarTaskRange(task)])),
    [tasks],
  );
  const editingTask = editingTaskId ? taskById.get(editingTaskId) : undefined;
  const editingPendingAttempt = pendingDateAttempt?.taskId === editingTaskId
    ? pendingDateAttempt
    : null;
  const hasBlockedMutation = backend.pendingMutations > 0
    && ['offline', 'conflict', 'retry_required'].includes(backend.status);
  const savingTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    savingTaskIdRef.current = savingTaskId;
  }, [savingTaskId]);

  const nextPeriod = () => {
    const nextDate = viewMode === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1);
    setCurrentDate(nextDate);
    setSelectedDate(viewMode === 'month' ? nextDate : getWorkWeekRange(nextDate).start);
  };
  const prevPeriod = () => {
    const previousDate = viewMode === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1);
    setCurrentDate(previousDate);
    setSelectedDate(viewMode === 'month' ? previousDate : getWorkWeekRange(previousDate).start);
  };
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
  const firstWeekStart = getWorkWeekRange(viewMode === 'month' ? monthStart : currentDate).start;
  const lastWeekEnd = getWorkWeekRange(viewMode === 'month' ? monthEnd : currentDate).end;
  const maxVisibleLanes = viewMode === 'month' ? 3 : 6;
  const weeks = [];
  for (let weekStart = firstWeekStart; !isAfter(weekStart, lastWeekEnd); weekStart = addDays(weekStart, 7)) {
    const weekDays = Array.from({ length: DAYS_IN_WORK_WEEK }, (_, index) => addDays(weekStart, index));
    weeks.push({
      days: weekDays,
      layout: buildCalendarWeekLayout(tasks, weekStart, maxVisibleLanes),
    });
  }

  const dateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const visibleCalendarDays = weeks.flatMap(week => week.days);
  const focusDateKey = visibleCalendarDays.some(day => isSameDay(day, selectedDate))
    ? format(selectedDate, 'yyyy-MM-dd')
    : format(visibleCalendarDays[0], 'yyyy-MM-dd');
  const getPeriodLabel = () => viewMode === 'month'
    ? formatLocalizedMonth(currentDate, locale)
    : `${formatLocalizedDate(firstWeekStart, locale)} – ${formatLocalizedDate(lastWeekEnd, locale)}`;
  const shiftWorkday = (day: Date, offset: number) => {
    if (Math.abs(offset) === DAYS_IN_WORK_WEEK) {
      return addDays(day, offset + (offset > 0 ? 1 : -1));
    }
    const candidate = addDays(day, offset);
    if (candidate.getDay() === 0) return addDays(candidate, offset < 0 ? -1 : 1);
    return candidate;
  };
  const focusDateButton = (day: Date) => {
    const nextDateKey = format(day, 'yyyy-MM-dd');
    window.requestAnimationFrame(() => dateButtonRefs.current[nextDateKey]?.focus());
  };
  const handleDateKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, day: Date) => {
    let nextDate: Date | null = null;
    if (event.key === 'ArrowLeft') nextDate = shiftWorkday(day, -1);
    if (event.key === 'ArrowRight') nextDate = shiftWorkday(day, 1);
    if (event.key === 'ArrowUp') nextDate = shiftWorkday(day, -DAYS_IN_WORK_WEEK);
    if (event.key === 'ArrowDown') nextDate = shiftWorkday(day, DAYS_IN_WORK_WEEK);
    if (event.key === 'Home') nextDate = getWorkWeekRange(day).start;
    if (event.key === 'End') nextDate = getWorkWeekRange(day).end;
    if (!nextDate) return;
    event.preventDefault();
    setSelectedDate(nextDate);
    if (viewMode === 'month' && !isSameMonth(nextDate, monthStart)) setCurrentDate(nextDate);
    if (viewMode === 'week' && (isBefore(nextDate, firstWeekStart) || isAfter(nextDate, lastWeekEnd))) setCurrentDate(nextDate);
    focusDateButton(nextDate);
  };

  const getUserName = (id: string, fallback = 'Unassigned') => users.find(user => user.id === id)?.name || fallback;
  const getTasksForDay = (day: Date) => {
    const calendarDay = parseISO(format(day, 'yyyy-MM-dd'));
    return tasks.filter(task => {
      const range = rangeByTaskId.get(task.id);
      return Boolean(range && !isBefore(calendarDay, range.start) && !isAfter(calendarDay, range.end));
    });
  };
  const getHolidaysForDay = (day: Date): MalaysiaHoliday[] => (
    showHolidays ? getHolidaysForDate(format(day, 'yyyy-MM-dd')) : []
  );
  const canEditTaskDates = useCallback(
    (task: Task) => (
      canEditTaskByRole(currentUser, task, rolePermissions)
      && savingTaskIdRef.current !== task.id
      && !backend.isSaving
      && !hasBlockedMutation
    ),
    [backend.isSaving, currentUser, hasBlockedMutation, rolePermissions],
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
    if (savingTaskId === editingTaskId) return;
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
    const result = await retryPendingSave('task.update');
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
    const column = Math.min(weekDays.length - 1, Math.max(0, Math.floor((event.clientX - rect.left) / (rect.width / weekDays.length))));
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
      case 'Video Shooting': return 'bg-accent';
      case 'Ads Management': return 'bg-amber-400';
      case 'Account & Finance': return 'bg-emerald-400';
      case 'Management': return 'bg-accent';
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
      case 'Video Shooting': return 'bg-accent-soft text-accent';
      case 'Ads Management': return 'bg-amber-50 text-amber-700';
      case 'Account & Finance': return 'bg-emerald-50 text-emerald-700';
      case 'Management': return 'bg-accent-soft text-accent';
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
  const selectedDaySummary = getCalendarTaskSummary(selectedDayTasks);
  const isClientUser = currentUser?.role === 'Client';
  const localizedTaskDateLabel = (task: Task) => taskDateLabel(
    task,
    value => formatLocalizedDate(value, locale),
    t,
  );
  const localizedTaskScheduleLabel = (task: Task) => taskScheduleLabel(
    task,
    value => formatLocalizedDate(value, locale),
    t,
  );
  const filterLabels: Record<CalendarFilter, string> = {
    all: t('Overall'),
    open: t('Open tasks'),
    'due-today': t('Due today'),
    overdue: t('Overdue'),
    completed: t('Completed'),
    'no-due-date': t('No due date'),
  };
  const activeFilterLabel = filterLabels[calendarFilter];

  return (
    <div className={pageShell}>
      <div className="flex min-w-0 flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0">
          <p className="calm-eyebrow">{t('Schedule')}</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{t(isClientUser ? 'Delivery Schedule' : 'Team Calendar')}</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">
            {isClientUser
              ? t('See each deliverable from its start date to its due date.')
              : t('See each task from start to due date. Drag a range to move it, or adjust either edge.')}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="toolbar" aria-label={t('Calendar controls')}>
          <Button variant="secondary" onClick={goToday} className="shrink-0">
            <CalendarIcon className="h-4 w-4" aria-hidden="true" />
            {t('Today')}
          </Button>

          <div className="flex min-w-0 items-center rounded-control border border-line bg-surface p-1" role="group" aria-label={t('Calendar view')}>
            <button
              type="button"
              aria-pressed={viewMode === 'month'}
              onClick={() => setViewMode('month')}
              className={clsx(
                'min-h-11 rounded-tag px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                viewMode === 'month' ? 'bg-accent text-white' : 'text-muted hover:bg-inset hover:text-ink',
              )}
            >
              {t('Month')}
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'week'}
              onClick={() => setViewMode('week')}
              className={clsx(
                'min-h-11 rounded-tag px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                viewMode === 'week' ? 'bg-accent text-white' : 'text-muted hover:bg-inset hover:text-ink',
              )}
            >
              {t('Week')}
            </button>
          </div>

          <div className="flex min-w-0 items-center rounded-control border border-line bg-surface p-1">
            <button
              type="button"
              onClick={prevPeriod}
              aria-label={t(viewMode === 'month' ? 'Previous month' : 'Previous week')}
              title={t(viewMode === 'month' ? 'Previous month' : 'Previous week')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-tag text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-[8.5rem] px-2 text-center text-sm font-semibold text-ink" aria-live="polite">
              {getPeriodLabel()}
            </div>
            <button
              type="button"
              onClick={nextPeriod}
              aria-label={t(viewMode === 'month' ? 'Next month' : 'Next week')}
              title={t(viewMode === 'month' ? 'Next month' : 'Next week')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-tag text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowHolidays(value => !value)}
            aria-pressed={showHolidays}
            className={clsx(
              'inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              showHolidays
                ? 'border-accent/30 bg-accent-soft text-ink hover:border-accent/50'
                : 'border-line bg-surface text-muted hover:bg-inset hover:text-ink',
            )}
          >
            <Flag className="h-4 w-4" aria-hidden="true" /> {t('MY Holidays')}
          </button>

          {canCreateTasks(currentUser, rolePermissions) && (
            <Button onClick={() => handleAddTaskForDate(selectedDate)} className="shrink-0">
              <Plus className="h-4 w-4" aria-hidden="true" /> {t('Assign Task')}
            </Button>
          )}
        </div>
      </div>

      <section aria-labelledby="calendar-overview-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="calendar-overview-title" className="text-base font-semibold text-ink">{t('Overview')}</h2>
            <p className="mt-0.5 text-sm text-muted">{t('Scan visible work, then select a metric to focus the calendar.')}</p>
          </div>
          {calendarFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setCalendarFilter('all')}
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {t('Showing')}: {activeFilterLabel}
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('Clear filter')}</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <CalendarMetricButton filter="all" label={t('Overall')} value={overview.total} icon={CalendarRange} active={calendarFilter === 'all'} onSelect={setCalendarFilter} />
          <CalendarMetricButton filter="open" label={t('Open tasks')} value={overview.open} icon={Clock} active={calendarFilter === 'open'} onSelect={setCalendarFilter} />
          <CalendarMetricButton filter="due-today" label={t('Due today')} value={overview.dueToday} icon={CalendarIcon} active={calendarFilter === 'due-today'} onSelect={setCalendarFilter} />
          <CalendarMetricButton filter="overdue" label={t('Overdue')} value={overview.overdue} icon={Clock} active={calendarFilter === 'overdue'} onSelect={setCalendarFilter} />
          <CalendarMetricButton filter="completed" label={t('Completed')} value={overview.completed} icon={CheckCircle2} active={calendarFilter === 'completed'} onSelect={setCalendarFilter} />
          <CalendarMetricButton filter="no-due-date" label={t('No due date')} value={overview.noDueDate} icon={CalendarRange} active={calendarFilter === 'no-due-date'} onSelect={setCalendarFilter} />
        </div>
      </section>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {showHolidays && (
            <>
              <span className="font-semibold text-ink">{t('Malaysia holidays')}</span>
              {(['national', 'religious', 'cultural', 'federal'] as const).map(category => (
                <span key={category} className="flex items-center gap-1.5 capitalize">
                  <span className={clsx('h-2.5 w-2.5 rounded-sm', HOLIDAY_COLORS[category].dot)} aria-hidden="true" />
                  {t(category)}
                </span>
              ))}
            </>
          )}
        </div>
        {!isClientUser && (
        <p id="calendar-drag-hint" className="hidden shrink-0 items-center gap-1.5 text-xs text-muted 2xl:flex">
          <GripVertical className="h-3 w-3" aria-hidden="true" />
          {t('Drag the bar to move · drag either edge to resize')}
        </p>
        )}
      </div>

      {dropSuccess && (
        <div
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-control bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{dropSuccess}</span>
        </div>
      )}
      {syncError && (
        <div className="rounded-control border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert" aria-live="assertive">
          {syncError}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-4 xl:flex-row">
        <div className={clsx(cardBase, 'order-2 min-w-0 flex-1 overflow-hidden xl:order-1')} aria-describedby="calendar-drag-hint">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
            <h2 id="calendar-grid-title" className="text-sm font-semibold text-ink">{t('Calendar')}</h2>
            {calendarFilter !== 'all' && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{t('Showing')}: <span className="font-semibold text-ink">{activeFilterLabel}</span></span>
                <button
                  type="button"
                  onClick={() => setCalendarFilter('all')}
                  className="inline-flex min-h-11 items-center rounded-control px-2 font-semibold text-accent transition-colors hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {t('Clear filter')}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-6 border-b border-line bg-inset">
            {WEEKDAYS.map(day => (
              <div key={day} className="py-2.5 text-center text-xs font-semibold text-muted">
                <span className="sm:hidden">{t(day).slice(0, 1)}</span>
                <span className="hidden sm:inline">{t(day)}</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-line">
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
                <div className="absolute inset-0 grid grid-cols-6 divide-x divide-line">
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
                          'group relative min-w-0 cursor-pointer select-none transition-colors',
                          !inMonth && 'bg-inset',
                          inMonth && !primaryHoliday && !isDropTarget && 'bg-surface hover:bg-inset',
                          inMonth && primaryHoliday && !isDropTarget && HOLIDAY_COLORS[primaryHoliday.category].bg,
                          isDropTarget && 'bg-accent-soft ring-2 ring-inset ring-accent',
                          selected && !isDropTarget && 'ring-2 ring-inset ring-accent/60',
                        )}
                      >
                        <div className="flex items-center justify-between p-1.5">
                          <button
                            type="button"
                            ref={element => {
                              dateButtonRefs.current[dateStr] = element;
                            }}
                            tabIndex={dateStr === focusDateKey ? 0 : -1}
                            aria-label={`${t('Select date')} ${formatLocalizedWeekdayDate(day, locale, true)}`}
                            aria-current={selected ? 'date' : undefined}
                            onClick={event => {
                              event.stopPropagation();
                              setSelectedDate(day);
                            }}
                            onKeyDown={event => handleDateKeyDown(event, day)}
                            className={clsx(
                              'flex h-8 min-w-8 items-center justify-center rounded-full text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                              todayDay ? 'bg-accent text-white' : inMonth ? 'text-ink hover:bg-inset' : 'text-muted hover:bg-inset',
                            )}
                          >
                            {format(day, 'd')}
                          </button>
                          <div className="flex items-center gap-1">
                            {dayHolidays.length > 0 && inMonth && (
                              <span
                                role="img"
                                title={dayHolidays.map(holiday => holiday.name).join(', ')}
                                aria-label={`${t('Holiday')}: ${dayHolidays.map(holiday => holiday.name).join(', ')}`}
                              >
                                <Flag className={clsx('h-3 w-3', HOLIDAY_COLORS[primaryHoliday.category].text)} aria-hidden="true" />
                              </span>
                            )}
                            {canCreateTasks(currentUser, rolePermissions) && inMonth && (
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  handleAddTaskForDate(day);
                                }}
                                title={`${t('Assign task on')} ${formatLocalizedDate(day, locale)}`}
                                aria-label={`${t('Assign task on')} ${formatLocalizedDate(day, locale)}`}
                                className={clsx(
                                  'hidden min-h-11 min-w-11 items-center justify-center rounded-control border border-line bg-surface/90 text-muted shadow-sm transition-opacity hover:border-accent/30 hover:bg-accent-soft hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:flex',
                                  selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
                                )}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
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
                            {t('Drop')}
                          </span>
                        )}

                        {dayTasks.length > 0 && (
                          <div className="absolute bottom-1 right-1 md:hidden">
                            <span
                              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white"
                              aria-label={`${dayTasks.length} ${t(dayTasks.length === 1 ? 'task' : 'tasks')} ${t('on')} ${formatLocalizedDate(day, locale)}`}
                            >
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
                            className="absolute bottom-1 left-1 hidden min-h-11 rounded-control px-1.5 py-0.5 text-[9px] font-semibold text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:block"
                            aria-label={`${t('Show')} ${hiddenCount} ${t(hiddenCount === 1 ? 'more task' : 'more tasks')} ${t('on')} ${formatLocalizedDate(day, locale)}`}
                          >
                            +{hiddenCount} {t('more')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div
                  className="pointer-events-none absolute inset-x-0 top-14 hidden grid-cols-6 md:grid"
                  style={{ gridAutoRows: '24px', rowGap: '3px' }}
                >
                  {week.layout.segments.filter(segment => !segment.hidden).map(segment => {
                    const task = taskById.get(segment.taskId);
                    if (!task) return null;
                    const editable = canEditTaskDates(task);
                    const range = normalizeCalendarTaskRange(task);
                    const title = localizedTaskDateLabel(task);

                    return (
                      <div
                        key={`${task.id}-${week.layout.weekStart}`}
                        role="group"
                        aria-label={`${task.title}. ${t(title)}`} data-i18n-skip
                        title={`${task.clientName} · ${task.title} · ${t(title)}`}
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
                            aria-label={`${t('Adjust start date for')} ${task.title}`} data-i18n-skip
                            title={t('Drag to adjust start date')}
                            className="flex h-full min-h-6 w-2.5 shrink-0 cursor-ew-resize items-center justify-center border-r border-current/10 bg-white/35 outline-none transition-colors hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
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
                            'flex h-full min-h-6 min-w-0 flex-1 items-center gap-1 px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                            editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                          )}
                          aria-label={`${t(editable ? 'Edit dates for' : 'Open')} ${task.title}. ${t(title)}`} data-i18n-skip
                        >
                          {savingTaskId === task.id ? (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                          ) : (
                            <span className={clsx('h-2 w-2 shrink-0 rounded-full', isClientUser ? 'bg-accent' : getDeptDot(task.department))} />
                          )}
                          <span data-i18n-skip className="min-w-0 flex-1 truncate">
                            {!isClientUser && task.clientName && segment.spanDays > 1 ? `${task.clientName} · ` : ''}
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
                            aria-label={`${t('Adjust due date for')} ${task.title}`} data-i18n-skip
                            title={t(range?.hasDueDate ? 'Drag to adjust due date' : 'Drag to add a due date')}
                            className="flex h-full min-h-6 w-2.5 shrink-0 cursor-ew-resize items-center justify-center border-l border-current/10 bg-white/35 outline-none transition-colors hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
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

        <aside
          className={clsx(cardBase, 'order-1 flex w-full max-h-[min(70dvh,42rem)] shrink-0 flex-col overflow-hidden xl:order-2 xl:w-80 xl:max-h-[calc(100dvh-10rem)]')}
          aria-labelledby="calendar-selected-day-title"
        >
          <div className="flex items-center justify-between border-b border-line bg-inset px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">{t('Selected day')}</p>
              <h2 id="calendar-selected-day-title" className="mt-0.5 truncate text-base font-semibold text-ink">
                {formatLocalizedWeekdayDate(selectedDate, locale, true)}
              </h2>
            </div>
            {canCreateTasks(currentUser, rolePermissions) && (
              <button
                type="button"
                onClick={() => handleAddTaskForDate(selectedDate)}
                title={t('Assign task for this day')}
                aria-label={t('Assign task for this day')}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-accent transition-colors hover:bg-accent-soft hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
            {selectedDayHolidays.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Flag className="h-3 w-3" aria-hidden="true" /> {t('Public Holiday')}
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
                dropTargetDate === selectedDateStr && 'bg-accent-soft ring-accent',
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <CalendarRange className="h-3 w-3" aria-hidden="true" />
                    {t('Tasks on this day')}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {selectedDaySummary.open} {t('open tasks')} · {selectedDaySummary.completed} {t('completed')}
                    {selectedDaySummary.overdue > 0 && ` · ${selectedDaySummary.overdue} ${t('overdue')}`}
                  </p>
                </div>
                <span className="calm-number text-xl font-semibold text-ink" aria-label={`${selectedDaySummary.total} ${t('tasks')}`}>
                  {selectedDaySummary.total}
                </span>
              </div>

              {selectedDayTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line py-8 text-center">
                  <p className="text-sm text-muted">
                    {calendarFilter === 'all' ? t('No tasks scheduled for this day.') : t('No tasks match this filter.')}
                  </p>
                  <p className="mb-1 text-xs text-muted">
                    {calendarFilter === 'all' ? t('Choose another day or assign a task') : t('Try Overall to see every visible task.')}
                  </p>
                  {canCreateTasks(currentUser, rolePermissions) && (
                    <Button
                      onClick={() => handleAddTaskForDate(selectedDate)}
                      variant="secondary"
                      className="min-h-11 px-2.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t('Assign Task')}
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
                        'rounded-control border bg-surface p-3 transition-colors',
                        isOverdue ? 'border-red-200 border-l-4 border-l-red-500' : 'border-line',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', isClientUser ? 'bg-accent' : getDeptDot(task.department))} />
                        <div className="min-w-0 flex-1">
                          <Link
                            data-i18n-skip
                            to={`/tasks?taskId=${encodeURIComponent(task.id)}`}
                      className={clsx(
                        'rounded-sm text-sm font-semibold leading-snug text-ink transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                        task.isCompleted && 'text-muted line-through',
                        isOverdue && 'text-red-900',
                      )}
                          >
                            {task.title}
                          </Link>
                          <p data-i18n-skip className="mt-0.5 truncate text-[10px] text-slate-400">
                            {isClientUser
                              ? task.serviceType
                              : [task.clientName, task.projectName].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {!isClientUser && (
                        <Badge tone={task.isCompleted ? 'emerald' : task.priority === 'Urgent' ? 'red' : task.priority === 'High' ? 'amber' : 'slate'}>
                          {task.priority}
                        </Badge>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {!isClientUser && (
                        <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold', getDeptBadge(task.department))}>
                          {task.department}
                        </span>
                        )}
                        {!isClientUser && (
                          <span className="flex items-center gap-1 text-[10px] text-muted">
                            <User className="h-2.5 w-2.5" aria-hidden="true" /> {getUserName(task.assignedTo)}
                        </span>
                        )}
                        {!isClientUser && task.createdBy && task.createdBy !== task.assignedTo && (
                          <span className="text-[10px] text-muted">
                            {t('Created by')} {getUserName(task.createdBy, 'Unknown')}
                        </span>
                        )}
                        <Badge tone={task.status === 'Completed' ? 'emerald' : task.status === 'Cancelled' ? 'slate' : 'blue'} className="px-1.5 py-0.5 text-[10px]">
                          {task.status}
                        </Badge>
                      </div>

                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openDateEditor(task)}
                          disabled={savingTaskId === task.id || hasBlockedMutation}
                          aria-label={`${t('Edit dates for')} ${task.title}`} data-i18n-skip
                          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-control border border-line bg-inset px-2.5 py-2 text-left transition-colors hover:border-accent/30 hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingTaskId === task.id ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
                          ) : (
                            <CalendarRange className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-medium text-muted">{t('Schedule')}</span>
                            <span className="block truncate text-xs font-semibold text-ink">{localizedTaskScheduleLabel(task)}</span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="mt-3 flex min-h-11 items-center gap-2 rounded-control border border-line bg-inset px-2.5 py-2">
                          <CalendarRange className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block text-[10px] font-medium text-muted">{t('Schedule')}</span>
                          <span className="block truncate text-xs font-semibold text-ink">{localizedTaskScheduleLabel(task)}</span>
                          </span>
                        </div>
                      )}

                      {dueDate && (
                        <p
                          className={clsx(
                            'mt-2 flex items-center gap-1 text-[10px] font-medium',
                            isOverdue ? 'font-bold text-red-700' : 'text-slate-500',
                          )}
                        >
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {t(getRelativeDueDateString(task.dueDate, task.isCompleted, task.status))}
                        </p>
                      )}
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
          closeOnBackdrop={savingTaskId !== editingTask.id}
          panelClassName="max-w-md"
        >
          <div className={panelHeader}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
              <CalendarRange className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="calendar-date-editor-title" className="truncate text-lg font-semibold text-ink">
                {t('Edit task dates')}
              </h2>
              <p id="calendar-date-editor-description" className="truncate text-sm text-muted">
                {editingTask.title}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDateEditor}
              disabled={savingTaskId === editingTask.id}
              aria-label={t('Close date editor')}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleDateEditorSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="rounded-control border border-line bg-inset px-4 py-3">
                <p className="text-xs font-medium text-muted">{t('Current range')}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{localizedTaskDateLabel(editingTask)}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={fieldLabel}>{t('Start Date')}</span>
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
                  <span className={fieldLabel}>{t('Due Date')} <span className="font-normal text-muted">({t('optional')})</span></span>
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
                <p className="text-xs leading-5 text-muted">
                  {t('Leave Due Date blank to show this task only on its Start Date.')}
                </p>
                {dateDraft.dueDate && (
                  <button
                    type="button"
                    disabled={Boolean(editingPendingAttempt)}
                    onClick={() => {
                      setDateDraft(current => current ? { ...current, dueDate: '' } : current);
                      setDateDraftError('');
                    }}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-xs font-semibold text-accent hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    {t('Clear due date')}
                  </button>
                )}
              </div>

              {dateDraftError && (
                <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700" role="alert">
                  {dateDraftError}
                </div>
              )}
              {editingPendingAttempt ? (
                <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="alert">
                  <p className="font-semibold">{t('Attempted range retained')}</p>
                  <p className="mt-1 leading-5">
                    {t('Retry will save')} {editingPendingAttempt.attempted.startDate}
                    {editingPendingAttempt.attempted.dueDate
                      ? ` ${t('to')} ${editingPendingAttempt.attempted.dueDate}`
                      : ` ${t('with no due date')}`}
                    . {t('Use latest will discard this attempt.')}
                  </p>
                </div>
              ) : hasBlockedMutation && (
                <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800" role="alert">
                  {t('Resolve the current sync issue with Retry or Discard before changing these dates.')}
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
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-3 text-sm font-semibold text-muted transition-colors hover:bg-inset hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {t('Open task')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
                      {t('Use latest')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleRetryDates()}
                      disabled={savingTaskId === editingTask.id || backend.status === 'offline'}
                    >
                      {savingTaskId === editingTask.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {savingTaskId === editingTask.id ? t('Retrying') : t('Retry dates')}
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
                      {t('Cancel')}
                    </Button>
                    <Button
                      type="submit"
                      disabled={savingTaskId === editingTask.id || hasBlockedMutation}
                    >
                      {savingTaskId === editingTask.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {savingTaskId === editingTask.id ? t('Saving') : t('Save dates')}
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
