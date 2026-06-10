import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, parseISO, addWeeks, subWeeks, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Flag, Clock, User } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Badge, PageHeader, cardBase, pageShell } from '../components/ui';
import { getVisibleTasks } from '../lib/access';
import { getHolidaysForDate, HOLIDAY_COLORS, MalaysiaHoliday } from '../lib/malaysiaHolidays';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Calendar: React.FC = () => {
  const { tasks: allTasks, users, currentUser } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [showHolidays, setShowHolidays] = useState(true);

  const tasks = useMemo(() => getVisibleTasks(currentUser, allTasks), [allTasks, currentUser]);

  const nextPeriod = () => setCurrentDate(viewMode === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  const prevPeriod = () => setCurrentDate(viewMode === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  const goToday = () => { setCurrentDate(new Date()); setSelectedDate(new Date()); };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = viewMode === 'month' ? startOfWeek(monthStart) : startOfWeek(currentDate);
  const endDate = viewMode === 'month' ? endOfWeek(monthEnd) : endOfWeek(currentDate);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';

  const getTasksForDay = (day: Date) =>
    tasks.filter(t => isSameDay(parseISO(t.dueDate), day));

  const getHolidaysForDay = (day: Date): MalaysiaHoliday[] =>
    showHolidays ? getHolidaysForDate(format(day, 'yyyy-MM-dd')) : [];

  const selectedDayTasks = getTasksForDay(selectedDate);
  const selectedDayHolidays = getHolidaysForDay(selectedDate);

  const getDeptColor = (dept: string) => {
    switch (dept) {
      case 'Designer':         return 'bg-pink-400';
      case 'Editor':           return 'bg-blue-400';
      case 'Videoshooting':    return 'bg-purple-400';
      case 'Ads Management':   return 'bg-amber-400';
      case 'Account & Finance':return 'bg-emerald-400';
      case 'Management':       return 'bg-indigo-400';
      case 'Operation':        return 'bg-slate-400';
      default:                 return 'bg-gray-400';
    }
  };

  const getDeptBadge = (dept: string) => {
    switch (dept) {
      case 'Designer':         return 'bg-pink-100 text-pink-700';
      case 'Editor':           return 'bg-blue-100 text-blue-700';
      case 'Videoshooting':    return 'bg-purple-100 text-purple-700';
      case 'Ads Management':   return 'bg-amber-100 text-amber-700';
      case 'Account & Finance':return 'bg-emerald-100 text-emerald-700';
      case 'Management':       return 'bg-indigo-100 text-indigo-700';
      case 'Operation':        return 'bg-slate-100 text-slate-700';
      default:                 return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className={pageShell}>
      <PageHeader
        title="Team Calendar"
        description="Company timeline, upcoming deadlines, and Malaysia public holidays."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {/* Holiday toggle */}
            <button
              onClick={() => setShowHolidays(v => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                showHolidays
                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              )}
            >
              <Flag className="w-3.5 h-3.5" />
              MY Holidays
            </button>

            {/* Month / Week toggle */}
            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1">
              <button
                onClick={() => setViewMode('month')}
                className={clsx('px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  viewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >Month</button>
              <button
                onClick={() => setViewMode('week')}
                className={clsx('px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  viewMode === 'week' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >Week</button>
            </div>

            {/* Navigation */}
            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1">
              <button onClick={prevPeriod} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToday} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4" />
                {viewMode === 'month'
                  ? format(currentDate, 'MMMM yyyy')
                  : `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`}
              </button>
              <button onClick={nextPeriod} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      />

      {/* Legend */}
      {showHolidays && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">🇲🇾 Holidays:</span>
          {(['national', 'religious', 'cultural', 'federal'] as const).map(cat => (
            <span key={cat} className="flex items-center gap-1.5 capitalize">
              <span className={`w-2.5 h-2.5 rounded-sm ${HOLIDAY_COLORS[cat].dot}`} />
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Main layout: Calendar + Side panel */}
      <div className="flex gap-4 flex-col lg:flex-row">

        {/* ── Calendar Grid ───────────────────────────────────── */}
        <div className={clsx(cardBase, 'overflow-hidden flex-1 min-w-0')}>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {days.map(day => {
              const dayTasks    = getTasksForDay(day);
              const dayHols     = getHolidaysForDay(day);
              const inMonth     = viewMode === 'week' || isSameMonth(day, monthStart);
              const todayDay    = isToday(day);
              const selected    = isSameDay(day, selectedDate);
              const maxDots     = 3; // max task dots before "+N"
              const primaryHol  = dayHols[0];

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDate(day)}
                  className={clsx(
                    'relative cursor-pointer transition-colors select-none',
                    viewMode === 'month' ? 'h-24' : 'h-32',
                    !inMonth && 'bg-slate-50',
                    inMonth && !primaryHol && 'bg-white hover:bg-slate-50',
                    inMonth && primaryHol && HOLIDAY_COLORS[primaryHol.category].bg + ' hover:brightness-95',
                    selected && 'ring-2 ring-inset ring-indigo-400',
                  )}
                >
                  {/* Date number */}
                  <div className="p-1.5 flex items-center justify-between">
                    <span className={clsx(
                      'w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold',
                      todayDay ? 'bg-indigo-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300',
                    )}>
                      {format(day, 'd')}
                    </span>

                    {/* Holiday flag dot */}
                    {dayHols.length > 0 && inMonth && (
                      <span title={dayHols.map(h => h.name).join(', ')}>
                        <Flag className={clsx('w-3 h-3', HOLIDAY_COLORS[primaryHol!.category].text)} />
                      </span>
                    )}
                  </div>

                  {/* Holiday name strip — 1 line, truncated */}
                  {dayHols.length > 0 && inMonth && (
                    <div
                      className={clsx(
                        'mx-1 mb-0.5 px-1 py-0.5 rounded text-[9px] font-bold leading-tight truncate',
                        HOLIDAY_COLORS[primaryHol!.category].badge,
                      )}
                      title={dayHols.map(h => h.name).join(' · ')}
                    >
                      {dayHols[0].name}
                    </div>
                  )}

                  {/* Task dots (desktop) */}
                  {dayTasks.length > 0 && inMonth && (
                    <div className="hidden sm:flex flex-wrap gap-0.5 px-1.5 pt-0.5">
                      {dayTasks.slice(0, maxDots).map(t => (
                        <span
                          key={t.id}
                          title={t.title}
                          className={clsx('w-2 h-2 rounded-full shrink-0', getDeptColor(t.department))}
                        />
                      ))}
                      {dayTasks.length > maxDots && (
                        <span className="text-[9px] font-bold text-slate-500 leading-tight">
                          +{dayTasks.length - maxDots}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Task count badge (mobile) */}
                  {dayTasks.length > 0 && inMonth && (
                    <div className="sm:hidden absolute bottom-1 right-1">
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

        {/* ── Side Panel: Selected Day ─────────────────────────── */}
        <div className={clsx(cardBase, 'w-full lg:w-72 xl:w-80 shrink-0 overflow-hidden flex flex-col')}>
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected day</p>
            <h2 className="text-base font-bold text-slate-800 mt-0.5">
              {format(selectedDate, 'EEEE, d MMMM yyyy')}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Holidays for selected day */}
            {selectedDayHolidays.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Flag className="w-3 h-3" /> Public Holiday
                </p>
                {selectedDayHolidays.map(h => (
                  <div
                    key={h.date + h.name}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border',
                      HOLIDAY_COLORS[h.category].badge,
                    )}
                  >
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', HOLIDAY_COLORS[h.category].dot)} />
                    <span>🇲🇾 {h.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tasks for selected day */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {selectedDayTasks.length} Task{selectedDayTasks.length !== 1 ? 's' : ''} Due
              </p>

              {selectedDayTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                  No tasks due
                </div>
              ) : (
                selectedDayTasks.map(task => (
                  <Link
                    key={task.id}
                    to={`/tasks?taskId=${task.id}`}
                    className="block rounded-lg border border-slate-200 bg-white hover:bg-slate-50 p-3 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', getDeptColor(task.department))} />
                      <div className="min-w-0 flex-1">
                        <p className={clsx(
                          'text-sm font-semibold text-slate-800 leading-snug',
                          task.isCompleted && 'line-through text-slate-400',
                        )}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', getDeptBadge(task.department))}>
                            {task.department}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <User className="w-2.5 h-2.5" />
                            {getUserName(task.assignedTo)}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{task.clientName}</p>
                      </div>
                      <Badge
                        tone={
                          task.isCompleted ? 'emerald'
                          : task.priority === 'Urgent' ? 'red'
                          : task.priority === 'High' ? 'amber'
                          : 'indigo'
                        }
                      >
                        {task.priority}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
