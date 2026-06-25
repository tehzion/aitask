import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../store';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, parseISO, addWeeks, subWeeks, isToday,
  isBefore,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Flag, Clock, User, GripVertical, CheckCircle2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { getRelativeDueDateString } from '../lib/utils';
import { Link } from 'react-router-dom';
import { Badge, PageHeader, Button, cardBase, pageShell } from '../components/ui';
import { canEditTask as canEditTaskByRole, getVisibleTasks, canCreateTasks } from '../lib/access';
import { getHolidaysForDate, HOLIDAY_COLORS, MalaysiaHoliday } from '../lib/malaysiaHolidays';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Calendar: React.FC = () => {
  const { tasks: allTasks, users, currentUser, rolePermissions, updateTaskDueDate, setCreateTaskModalOpen } = useStore();
  const [currentDate, setCurrentDate]   = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode]         = useState<'month' | 'week'>('month');
  const [showHolidays, setShowHolidays] = useState(true);

  // Drag state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null); // 'YYYY-MM-DD'
  const [dropSuccess, setDropSuccess]       = useState<string | null>(null); // task title for flash
  const dragOriginDate = useRef<string | null>(null);

  const tasks = useMemo(() => getVisibleTasks(currentUser, allTasks), [allTasks, currentUser]);

  const nextPeriod = () => setCurrentDate(viewMode === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  const prevPeriod = () => setCurrentDate(viewMode === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  const goToday    = () => { setCurrentDate(new Date()); setSelectedDate(new Date()); };
  
  const handleAddTask = () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    useStore.setState({ createTaskInitialDate: dateStr });
    setCreateTaskModalOpen(true);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(monthStart);
  const startDate  = viewMode === 'month' ? startOfWeek(monthStart) : startOfWeek(currentDate);
  const endDate    = viewMode === 'month' ? endOfWeek(monthEnd)     : endOfWeek(currentDate);
  const days       = eachDayOfInterval({ start: startDate, end: endDate });

  const getUserName       = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  const getTasksForDay    = (day: Date) => tasks.filter(t => isSameDay(parseISO(t.dueDate), day));
  const getHolidaysForDay = (day: Date): MalaysiaHoliday[] =>
    showHolidays ? getHolidaysForDate(format(day, 'yyyy-MM-dd')) : [];

  const canDragTask = useCallback(
    (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      return task ? canEditTaskByRole(currentUser, task, rolePermissions) : false;
    },
    [tasks, currentUser, rolePermissions]
  );

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, taskId: string, originDateStr: string) => {
    e.dataTransfer.setData('application/x-aitask-task-id', taskId);
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
    dragOriginDate.current = originDateStr;
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDropTargetDate(null);
    dragOriginDate.current = null;
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetDate(dateStr);
  };

  const handleDragLeave = (e: React.DragEvent, dateStr: string) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) return;
    setDropTargetDate(current => (current === dateStr ? null : current));
  };

  const handleDrop = (e: React.DragEvent, targetDay: Date) => {
    e.preventDefault();
    const taskId =
      e.dataTransfer.getData('application/x-aitask-task-id') ||
      e.dataTransfer.getData('taskId') ||
      e.dataTransfer.getData('text/plain');
    const targetStr = format(targetDay, 'yyyy-MM-dd');
    setDropTargetDate(null);
    setDraggingTaskId(null);

    if (!taskId || targetStr === dragOriginDate.current) return;
    if (!canDragTask(taskId)) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    updateTaskDueDate(taskId, targetStr);
    setSelectedDate(targetDay);
    setCurrentDate(targetDay);

    // Brief success flash
    setDropSuccess(task.title);
    setTimeout(() => setDropSuccess(null), 2500);
  };

  const handleExactDateChange = (taskId: string, nextDate: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    if (!canDragTask(taskId)) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.dueDate === nextDate) return;

    const targetDay = parseISO(nextDate);
    updateTaskDueDate(taskId, nextDate);
    setSelectedDate(targetDay);
    setCurrentDate(targetDay);
    setDropSuccess(task.title);
    setTimeout(() => setDropSuccess(null), 2500);
  };

  // ── Colour helpers ────────────────────────────────────────────────────────

  const getDeptDot = (dept: string) => {
    switch (dept) {
      case 'Designer':          return 'bg-pink-400';
      case 'Editor':            return 'bg-blue-400';
      case 'Videoshooting':     return 'bg-purple-400';
      case 'Ads Management':    return 'bg-amber-400';
      case 'Account & Finance': return 'bg-emerald-400';
      case 'Management':        return 'bg-indigo-400';
      case 'Operation':         return 'bg-slate-400';
      default:                  return 'bg-gray-400';
    }
  };

  const getDeptBadge = (dept: string) => {
    switch (dept) {
      case 'Designer':          return 'bg-pink-100 text-pink-700';
      case 'Editor':            return 'bg-blue-100 text-blue-700';
      case 'Videoshooting':     return 'bg-purple-100 text-purple-700';
      case 'Ads Management':    return 'bg-amber-100 text-amber-700';
      case 'Account & Finance': return 'bg-emerald-100 text-emerald-700';
      case 'Management':        return 'bg-indigo-100 text-indigo-700';
      case 'Operation':         return 'bg-slate-100 text-slate-700';
      default:                  return 'bg-gray-100 text-gray-700';
    }
  };

  const selectedDayTasks    = getTasksForDay(selectedDate);
  const selectedDayHolidays = getHolidaysForDay(selectedDate);
  const selectedDateStr     = format(selectedDate, 'yyyy-MM-dd');
  const isSelectedDropTarget = dropTargetDate === selectedDateStr;

  return (
    <div className={pageShell}>
      <PageHeader
        title="Team Calendar"
        description="Drag tasks between days to reschedule. Malaysia public holidays shown."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowHolidays(v => !v)}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors shrink-0',
                showHolidays
                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              )}
            >
              <Flag className="w-3 h-3" /> MY Holidays
            </button>

            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1">
              <button onClick={() => setViewMode('month')} className={clsx('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', viewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>Month</button>
              <button onClick={() => setViewMode('week')}  className={clsx('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', viewMode === 'week'  ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>Week</button>
            </div>

            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1">
              <button onClick={prevPeriod} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToday} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4" />
                {viewMode === 'month'
                  ? format(currentDate, 'MMMM yyyy')
                  : `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`}
              </button>
              <button onClick={nextPeriod} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronRight className="w-4 h-4" /></button>
            </div>

            {canCreateTasks(currentUser, rolePermissions) && (
              <Button onClick={handleAddTask} className="flex items-center gap-1">
                <Plus className="w-4 h-4" /> New Task
              </Button>
            )}
          </div>
        )}
      />

      {/* Legend row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {showHolidays && (
            <>
              <span className="font-semibold text-slate-600">🇲🇾 Holidays:</span>
              {(['national', 'religious', 'cultural', 'federal'] as const).map(cat => (
                <span key={cat} className="flex items-center gap-1.5 capitalize">
                  <span className={`w-2.5 h-2.5 rounded-sm ${HOLIDAY_COLORS[cat].dot}`} /> {cat}
                </span>
              ))}
            </>
          )}
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <GripVertical className="w-3 h-3" /> Drag tasks to reschedule
        </p>
      </div>

      {/* Drop success toast */}
      {dropSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="max-w-xs truncate">"{dropSuccess}" rescheduled</span>
        </div>
      )}

      {/* Main layout */}
      <div className="flex gap-4 flex-col lg:flex-row">

        {/* ── Calendar Grid ──────────────────────────────────── */}
        <div className={clsx(cardBase, 'overflow-hidden flex-1 min-w-0')}>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {days.map(day => {
              const dayTasks   = getTasksForDay(day);
              const dayHols    = getHolidaysForDay(day);
              const inMonth    = viewMode === 'week' || isSameMonth(day, monthStart);
              const todayDay   = isToday(day);
              const selected   = isSameDay(day, selectedDate);
              const dateStr    = format(day, 'yyyy-MM-dd');
              const isDropTarget = dropTargetDate === dateStr;
              const primaryHol = dayHols[0];
              const maxTaskChips = viewMode === 'month' ? 2 : 4;

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDate(day)}
                  onDragOver={e => handleDragOver(e, dateStr)}
                  onDragLeave={e => handleDragLeave(e, dateStr)}
                  onDrop={e => handleDrop(e, day)}
                  className={clsx(
                    'relative cursor-pointer transition-all select-none',
                    viewMode === 'month' ? 'h-32' : 'h-44',
                    !inMonth && 'bg-slate-50',
                    inMonth && !primaryHol && !isDropTarget && 'bg-white hover:bg-slate-50',
                    inMonth && primaryHol && !isDropTarget && HOLIDAY_COLORS[primaryHol.category].bg + ' hover:brightness-95',
                    // Drop target highlight
                    isDropTarget && 'bg-indigo-100 ring-2 ring-inset ring-indigo-400',
                    selected && !isDropTarget && 'ring-2 ring-inset ring-indigo-300',
                  )}
                >
                  {/* Date number + flag */}
                  <div className="p-1.5 flex items-center justify-between">
                    <span className={clsx(
                      'w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold',
                      todayDay ? 'bg-indigo-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300',
                    )}>
                      {format(day, 'd')}
                    </span>
                    {dayHols.length > 0 && inMonth && (
                      <span title={dayHols.map(h => h.name).join(', ')}>
                        <Flag className={clsx('w-3 h-3', HOLIDAY_COLORS[primaryHol!.category].text)} />
                      </span>
                    )}
                  </div>

                  {/* Drop zone label */}
                  {isDropTarget && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 rounded px-1.5 py-0.5 border border-indigo-300">
                        Drop here
                      </span>
                    </div>
                  )}

                  {/* Holiday name strip */}
                  {dayHols.length > 0 && inMonth && !isDropTarget && (
                    <div
                      className={clsx('mx-1 mb-0.5 px-1 py-0.5 rounded text-[9px] font-bold leading-tight truncate', HOLIDAY_COLORS[primaryHol!.category].badge)}
                      title={dayHols.map(h => h.name).join(' · ')}
                    >
                      {dayHols[0].name}
                    </div>
                  )}

                  {/* Task chips (desktop) */}
                  {dayTasks.length > 0 && inMonth && !isDropTarget && (
                    <div className="hidden md:flex flex-col gap-1 px-1.5 pt-0.5 overflow-hidden">
                      {dayTasks.slice(0, maxTaskChips).map(t => {
                        const canDrag = canDragTask(t.id);
                        return (
                          <Link
                            key={t.id}
                            to={`/tasks?taskId=${t.id}`}
                            draggable={canDrag}
                            onClick={e => e.stopPropagation()}
                            onDragStart={canDrag ? e => { e.stopPropagation(); handleDragStart(e, t.id, dateStr); } : undefined}
                            onDragEnd={handleDragEnd}
                            title={`${t.title}${canDrag ? ' - drag to reschedule' : ''}`}
                            className={clsx(
                              'flex min-h-6 items-center gap-1 rounded-md border bg-white/90 px-1.5 py-1 text-[10px] font-semibold leading-none shadow-sm transition-all',
                              canDrag ? 'cursor-grab active:cursor-grabbing hover:border-orange-300 hover:bg-orange-50' : 'cursor-pointer',
                              draggingTaskId === t.id && 'opacity-40 scale-[0.97]',
                            )}
                          >
                            {canDrag && <GripVertical className="h-3 w-3 shrink-0 text-slate-300" />}
                            <span className={clsx('h-2 w-2 rounded-full shrink-0', getDeptDot(t.department))} />
                            <span className="min-w-0 flex-1 truncate text-slate-700">{t.title}</span>
                          </Link>
                        );
                      })}
                      {dayTasks.length > maxTaskChips && (
                        <span className="px-1.5 text-[9px] font-bold text-slate-500 leading-tight">
                          +{dayTasks.length - maxTaskChips} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Task count (mobile) */}
                  {dayTasks.length > 0 && inMonth && (
                    <div className="md:hidden absolute bottom-1 right-1">
                      <span className="text-[9px] font-bold bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
                        {dayTasks.length}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Side Panel ─────────────────────────────────────── */}
        <div className={clsx(cardBase, 'w-full lg:w-72 xl:w-80 shrink-0 overflow-hidden flex flex-col')}>
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected day</p>
              <h2 className="text-base font-bold text-slate-800 mt-0.5">
                {format(selectedDate, 'EEEE, d MMMM yyyy')}
              </h2>
            </div>
            {canCreateTasks(currentUser, rolePermissions) && (
              <button
                onClick={handleAddTask}
                title="Add task for this day"
                className="p-1 hover:bg-slate-100 rounded-md transition-colors text-indigo-600 hover:text-indigo-800 shrink-0"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Holidays */}
            {selectedDayHolidays.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Flag className="w-3 h-3" /> Public Holiday
                </p>
                {selectedDayHolidays.map(h => (
                  <div key={h.date + h.name} className={clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border', HOLIDAY_COLORS[h.category].badge)}>
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', HOLIDAY_COLORS[h.category].dot)} />
                    🇲🇾 {h.name}
                  </div>
                ))}
              </div>
            )}

            {/* Tasks */}
            <div
              className={clsx(
                '-m-2 space-y-2 rounded-xl p-2 ring-2 ring-inset ring-transparent transition-all',
                isSelectedDropTarget && 'bg-indigo-50 ring-indigo-300'
              )}
              onDragOver={e => handleDragOver(e, selectedDateStr)}
              onDragLeave={e => handleDragLeave(e, selectedDateStr)}
              onDrop={e => handleDrop(e, selectedDate)}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {selectedDayTasks.length} Task{selectedDayTasks.length !== 1 ? 's' : ''} Due
              </p>

              {selectedDayTasks.length === 0 ? (
                <div
                  className={clsx(
                    'rounded-lg border-2 border-dashed py-8 flex flex-col items-center justify-center text-center gap-1 transition-colors',
                    isSelectedDropTarget ? 'border-indigo-300 bg-white text-indigo-700' : 'border-slate-200'
                  )}
                >
                  <p className="text-sm text-slate-400">No tasks due</p>
                  <p className="text-xs text-slate-300 mb-1">Drop a task here</p>
                  {canCreateTasks(currentUser, rolePermissions) && (
                    <Button onClick={handleAddTask} variant="secondary" className="h-7 px-2.5 text-xs flex items-center gap-1 font-semibold">
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </Button>
                  )}
                </div>
              ) : (
                selectedDayTasks.map(task => {
                  const canDrag     = canDragTask(task.id);
                  const selectedStr = format(selectedDate, 'yyyy-MM-dd');
                  const dueDateParsed = parseISO(task.dueDate);
                  const isOverdue = !task.isCompleted && task.status !== 'Cancelled' && isBefore(dueDateParsed, new Date()) && !isToday(dueDateParsed);

                  return (
                    <div
                      key={task.id}
                      draggable={canDrag}
                      onDragStart={canDrag ? e => handleDragStart(e, task.id, selectedStr) : undefined}
                      onDragEnd={handleDragEnd}
                      className={clsx(
                        'rounded-lg border bg-white p-3 transition-all',
                        isOverdue
                          ? 'border-red-200 border-l-4 border-l-red-500 bg-red-50/20'
                          : 'border-slate-200',
                        canDrag && 'cursor-grab active:cursor-grabbing hover:border-orange-300 hover:shadow-sm',
                        draggingTaskId === task.id && 'opacity-40 scale-[0.97]',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {/* Drag handle */}
                        {canDrag && (
                          <GripVertical className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                        )}
                        <span className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', getDeptDot(task.department))} />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/tasks?taskId=${task.id}`}
                            onClick={e => e.stopPropagation()}
                            className={clsx(
                              'text-sm font-semibold text-slate-800 leading-snug hover:text-orange-700 transition-colors',
                              task.isCompleted && 'line-through text-slate-400',
                              isOverdue && 'text-red-900',
                            )}
                          >
                            {task.title}
                          </Link>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', getDeptBadge(task.department))}>
                              {task.department}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <User className="w-2.5 h-2.5" />{getUserName(task.assignedTo)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{task.clientName}</p>
                          <p
                            className={clsx("text-[10px] mt-1 font-medium", isOverdue ? "text-red-700 font-bold" : "text-stone-500")}
                            title={`Due: ${format(dueDateParsed, 'yyyy-MM-dd')}`}
                          >
                            {getRelativeDueDateString(task.dueDate, task.isCompleted, task.status)}
                          </p>
                          {canDrag && (
                            <label className="mt-2 block" onClick={e => e.stopPropagation()}>
                              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                                Due date
                              </span>
                              <input
                                type="date"
                                value={task.dueDate}
                                draggable={false}
                                onPointerDown={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                onDragStart={e => e.stopPropagation()}
                                onChange={e => handleExactDateChange(task.id, e.target.value)}
                                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                              />
                            </label>
                          )}
                        </div>
                        <Badge tone={task.isCompleted ? 'emerald' : task.priority === 'Urgent' ? 'red' : task.priority === 'High' ? 'amber' : 'orange'}>
                          {task.priority}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
