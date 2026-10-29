import '../lib/taskStageCopy';
import React from 'react';
import { TASK_STAGE_FILTER_LABELS, TASK_STAGE_FILTERS, type TaskStageFilter } from '../lib/taskStage';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';

export interface TaskQuickFilter {
  id: string;
  label: string;
  active: boolean;
  count?: number;
  onToggle: () => void;
}

interface TaskStageFilterBarProps {
  /** null when an explicit status filter or task link overrides the stage tabs. */
  value: TaskStageFilter | null;
  counts: Record<TaskStageFilter, number>;
  onChange: (value: TaskStageFilter) => void;
  quickFilters: TaskQuickFilter[];
}

/**
 * The task list header every internal role shares: lifecycle stage tabs with
 * counts, then independent quick filters (needs action, due today, overdue).
 */
const TaskStageFilterBar: React.FC<TaskStageFilterBarProps> = ({ value, counts, onChange, quickFilters }) => {
  const { t } = useI18n();
  const stripRef = React.useRef<HTMLDivElement>(null);
  // Keep the selected tab visible on narrow screens without scrolling the page.
  React.useLayoutEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !active) return;
    const overflowRight = active.offsetLeft + active.offsetWidth - (strip.scrollLeft + strip.clientWidth);
    if (overflowRight > 0) strip.scrollLeft += overflowRight + 16;
    else if (active.offsetLeft < strip.scrollLeft) strip.scrollLeft = Math.max(0, active.offsetLeft - 16);
  }, [value]);
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div ref={stripRef} className="no-scrollbar relative -mx-4 min-w-0 overflow-x-auto px-4 xl:mx-0 xl:px-0">
        <div className="flex w-max gap-1 border-b border-line" role="group" aria-label={t('Task stages')}>
          {TASK_STAGE_FILTERS.map(stage => {
            const isActive = value === stage;
            return (
              <button
                key={stage}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange(stage)}
                className={cn(
                  'relative min-h-11 shrink-0 px-3 text-sm font-semibold transition-colors duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40',
                  isActive ? 'text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent' : 'text-muted hover:text-ink',
                )}
              >
                {t(TASK_STAGE_FILTER_LABELS[stage])}{' '}
                <span className="calm-number ml-1 text-xs font-medium opacity-70">{counts[stage]}</span>
              </button>
            );
          })}
        </div>
      </div>
      {quickFilters.length > 0 && <div className="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label={t('Quick task filters')}>
        {quickFilters.map(filter => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={filter.active}
            onClick={filter.onToggle}
            className={cn(
              'min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors duration-160 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              filter.active ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            {filter.label}{typeof filter.count === 'number' && <>{' '}<span className="calm-number ml-0.5 opacity-70">{filter.count}</span></>}
          </button>
        ))}
      </div>}
    </div>
  );
};

export default TaskStageFilterBar;
