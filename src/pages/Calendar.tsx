import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameMonth, isSameDay, parseISO, addWeeks, subWeeks
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Badge, PageHeader, cardBase, pageShell } from '../components/ui';
import { getVisibleTasks } from '../lib/access';

const Calendar: React.FC = () => {
  const { tasks: allTasks, users, currentUser } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

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

  const selectedDayTasks = getTasksForDay(selectedDate);

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
        description="Company timeline and upcoming deadlines."
        action={(
          <div className="flex flex-wrap items-center gap-2">
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
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDate = isSameDay(day, new Date());
            
            return (
              <div 
                key={day.toString()} 
                className={clsx(
                  "min-h-[120px] p-2 border-b border-r border-slate-100 relative group transition-colors",
                  viewMode === 'month' && !isCurrentMonth && "bg-slate-50/50 text-slate-400",
                  isCurrentMonth && "bg-white",
                  isTodayDate && "bg-indigo-50/30",
                  isSameDay(day, selectedDate) && "ring-2 ring-inset ring-indigo-200"
                )}
                onClick={() => setSelectedDate(day)}
              >
                <div className={clsx(
                  "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1",
                  isTodayDate ? "bg-indigo-600 text-white" : (viewMode === 'week' || isCurrentMonth ? "text-slate-700" : "text-slate-400")
                )}>
                  {format(day, 'd')}
                </div>
                
                <div className="space-y-1 mt-2 max-h-[calc(100%-2rem)] overflow-y-auto no-scrollbar">
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

      <div className={`sm:hidden ${cardBase} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{format(selectedDate, 'EEEE, MMM d')}</h2>
            <p className="text-xs text-slate-500">{selectedDayTasks.length} task{selectedDayTasks.length === 1 ? '' : 's'} due</p>
          </div>
          {selectedDayTasks.length > 0 && <Badge tone="indigo">{selectedDayTasks.length}</Badge>}
        </div>
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
