import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameMonth, isSameDay, parseISO, addWeeks, subWeeks
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Flag } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Badge, PageHeader, cardBase, pageShell } from '../components/ui';
import { getVisibleTasks } from '../lib/access';
import { getHolidaysForDate, HOLIDAY_COLORS, MalaysiaHoliday } from '../lib/malaysiaHolidays';

const Calendar: React.FC = () => {
  const { tasks: allTasks, users, currentUser } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [showHolidays, setShowHolidays] = useState(true);

  const tasks = useMemo(() => getVisibleTasks(currentUser, allTasks), [allTasks, currentUser]);

  const nextPeriod = () => setCurrentDate(viewMode === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  const prevPeriod = () => setCurrentDate(viewMode === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = viewMode === 'month' ? startOfWeek(monthStart) : startOfWeek(currentDate);
  const endDate = viewMode === 'month' ? endOfWeek(monthEnd) : endOfWeek(currentDate);

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';
  
  const getTasksForDay = (day: Date) => {
    return tasks.filter(task => {
      const dueDate = parseISO(task.dueDate);
      return isSameDay(dueDate, day);
    });
  };

  const getHolidaysForDay = (day: Date): MalaysiaHoliday[] => {
    if (!showHolidays) return [];
    return getHolidaysForDate(format(day, 'yyyy-MM-dd'));
  };

  const selectedDayTasks = getTasksForDay(selectedDate);
  const selectedDayHolidays = getHolidaysForDay(selectedDate);

  const getDepartmentColor = (dept: string) => {
    switch (dept) {
      case 'Designer': return 'bg-pink-100 text-pink-700 border-pink-200';
      case 'Editor': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Videoshooting': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Ads Management': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Account & Finance': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Management': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'Operation': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className={`${pageShell} flex flex-col h-full`}>
      <PageHeader
        title="Team Calendar"
        description="Company timeline, upcoming deadlines, and Malaysia public holidays."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {/* Holiday toggle */}
            <button
              onClick={() => setShowHolidays(v => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
                showHolidays
                  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              )}
              title="Toggle Malaysia public holidays"
            >
              <Flag className="w-3.5 h-3.5" />
              MY Holidays
            </button>

            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1">
              <button onClick={() => setViewMode('month')} className={clsx("px-3 py-2 text-sm font-medium rounded-md transition-colors", viewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                Month
              </button>
              <button onClick={() => setViewMode('week')} className={clsx("px-3 py-2 text-sm font-medium rounded-md transition-colors", viewMode === 'week' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                Week
              </button>
            </div>
            <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm p-1">
              <button onClick={prevPeriod} className="p-2 hover:bg-slate-100 rounded-md transition-colors text-slate-600">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={today} className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                {viewMode === 'month' ? format(currentDate, 'MMMM yyyy') : `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`}
              </button>
              <button onClick={nextPeriod} className="p-2 hover:bg-slate-100 rounded-md transition-colors text-slate-600">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      />

      {/* Legend */}
      {showHolidays && (
        <div className="flex flex-wrap items-center gap-3 px-1 pb-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Holidays:</span>
          {(['national', 'religious', 'cultural', 'federal'] as const).map(cat => (
            <span key={cat} className="flex items-center gap-1.5 capitalize">
              <span className={`w-2 h-2 rounded-full ${HOLIDAY_COLORS[cat].dot}`} />
              {cat}
            </span>
          ))}
        </div>
      )}

      <div className={clsx(`${cardBase} overflow-hidden flex-1 flex flex-col`, viewMode === 'month' ? 'min-h-[520px] sm:min-h-[600px]' : 'min-h-[320px]')}>
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-xs sm:text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>
        
        <div className={clsx("grid grid-cols-7 flex-1 auto-rows-fr", viewMode === 'week' && "min-h-[260px]")}>
          {days.map((day) => {
            const dayTasks = getTasksForDay(day);
            const dayHolidays = getHolidaysForDay(day);
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDate = isSameDay(day, new Date());
            const isHoliday = dayHolidays.length > 0;
            const primaryHoliday = dayHolidays[0];
            const holidayColors = primaryHoliday ? HOLIDAY_COLORS[primaryHoliday.category] : null;
            
            return (
              <div 
                key={day.toString()} 
                className={clsx(
                  "min-h-[120px] p-2 border-b border-r border-slate-100 relative group transition-colors cursor-pointer",
                  viewMode === 'month' && !isCurrentMonth && "bg-slate-50/50 text-slate-400",
                  isCurrentMonth && !isHoliday && "bg-white",
                  isCurrentMonth && isHoliday && holidayColors?.bg,
                  isTodayDate && "bg-indigo-50/30",
                  isSameDay(day, selectedDate) && "ring-2 ring-inset ring-indigo-200"
                )}
                onClick={() => setSelectedDate(day)}
              >
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className={clsx(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full shrink-0",
                    isTodayDate ? "bg-indigo-600 text-white" : (viewMode === 'week' || isCurrentMonth ? "text-slate-700" : "text-slate-400")
                  )}>
                    {format(day, 'd')}
                  </div>
                  {/* Holiday flag icon */}
                  {isHoliday && isCurrentMonth && (
                    <Flag className={clsx("w-3 h-3 shrink-0 mt-1", holidayColors?.text)} />
                  )}
                </div>

                {/* Holiday label(s) */}
                {isHoliday && isCurrentMonth && (
                  <div className="space-y-0.5 mb-1">
                    {dayHolidays.map(h => (
                      <div
                        key={h.date + h.name}
                        className={clsx(
                          'hidden sm:block text-[10px] font-semibold px-1.5 py-0.5 rounded border truncate leading-tight',
                          HOLIDAY_COLORS[h.category].badge
                        )}
                        title={h.name}
                      >
                        🇲🇾 {h.name}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="space-y-1 mt-1 max-h-[calc(100%-3.5rem)] overflow-y-auto no-scrollbar">
                  {dayTasks.length > 0 && (
                    <div className="sm:hidden">
                      <Badge tone={dayTasks.some(task => task.priority === 'Urgent') ? 'red' : 'indigo'} className="px-2 py-0.5">
                        {dayTasks.length}
                      </Badge>
                    </div>
                  )}
                  {dayTasks.map(task => (
                    <div 
                      key={task.id} 
                      className={clsx(
                        "hidden sm:flex text-xs p-1.5 rounded-md border shadow-sm truncate flex-col gap-0.5 transition-all hover:scale-[1.02] cursor-pointer",
                        getDepartmentColor(task.department),
                        task.isCompleted && "opacity-50 line-through"
                      )}
                      title={`${task.title} - ${getUserName(task.assignedTo)}`}
                    >
                      <span className="font-semibold truncate">{task.title}</span>
                      <span className="text-[10px] opacity-80 truncate">{getUserName(task.assignedTo)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile selected day panel */}
      <div className={`sm:hidden ${cardBase} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{format(selectedDate, 'EEEE, MMM d')}</h2>
            <p className="text-xs text-slate-500">{selectedDayTasks.length} task{selectedDayTasks.length === 1 ? '' : 's'} due</p>
          </div>
          {selectedDayTasks.length > 0 && <Badge tone="indigo">{selectedDayTasks.length}</Badge>}
        </div>

        {/* Mobile holiday notice */}
        {selectedDayHolidays.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {selectedDayHolidays.map(h => (
              <div key={h.date + h.name} className={clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border', HOLIDAY_COLORS[h.category].badge)}>
                <Flag className="w-3.5 h-3.5 shrink-0" />
                <span>🇲🇾 {h.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {selectedDayTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No tasks due on this day.</div>
          ) : selectedDayTasks.map(task => (
            <Link key={task.id} to={`/tasks?taskId=${task.id}`} className="block rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{task.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{task.clientName} - {getUserName(task.assignedTo)}</div>
                </div>
                <Badge tone={task.isCompleted ? 'emerald' : task.priority === 'Urgent' ? 'red' : 'amber'}>{task.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Calendar;
