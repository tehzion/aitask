import React from 'react';
import { CheckCircle2, Flag, RotateCcw, ShieldCheck, Star, UserPlus, type LucideIcon } from 'lucide-react';
import '../lib/pageCopy';
import { buildTaskTimeline, type TimelineAudience, type TimelineEntry, type TimelineKind } from '../lib/taskTimeline';
import { formatLocalizedDate } from '../lib/i18n';
import { formatLocalizedDistanceToNow } from '../lib/relativeTime';
import type { Task, User } from '../types';
import { cn } from '../lib/utils';
import { useI18n } from './I18nProvider';

const icons: Record<TimelineKind, LucideIcon> = {
  assigned: UserPlus,
  internal_review: ShieldCheck,
  client_approved: CheckCircle2,
  client_changes: RotateCcw,
  rated: Star,
  completed: Flag,
};

const tones: Record<TimelineKind, string> = {
  assigned: 'bg-inset text-muted',
  internal_review: 'bg-inset text-muted',
  client_approved: 'bg-emerald-50 text-emerald-800',
  client_changes: 'bg-amber-50 text-amber-900',
  rated: 'bg-amber-50 text-amber-900',
  completed: 'bg-emerald-50 text-emerald-800',
};

interface TaskTimelineProps {
  task: Task;
  users: readonly User[];
  audience: TimelineAudience;
  className?: string;
}

const TaskTimeline = ({ task, users, audience, className }: TaskTimelineProps) => {
  const { locale, t } = useI18n();
  const entries = buildTaskTimeline(task, users, audience);
  if (entries.length === 0) return null;

  const who = (entry: TimelineEntry) => entry.actorName
    ? <span data-i18n-skip className="font-semibold text-ink">{entry.actorName}</span>
    : <span className="font-semibold text-ink">{t(audience === 'client' ? 'Agency team' : 'Someone')}</span>;

  const sentence = (entry: TimelineEntry) => {
    switch (entry.kind) {
      case 'assigned':
        return <>{who(entry)} {t('assigned this to')} {entry.targetName ? <span data-i18n-skip className="font-semibold text-ink">{entry.targetName}</span> : t('a team member')}</>;
      case 'internal_review':
        return <>{who(entry)} {t('passed the internal review')}</>;
      case 'client_approved':
        return <>{who(entry)} {t('approved the delivery')}</>;
      case 'client_changes':
        return <>{who(entry)} {t('requested changes')} <span className="text-muted">({t('timeline.revisionRound', { count: entry.revision ?? 1 })})</span></>;
      case 'rated':
        return <>{who(entry)} {t('rated the delivery')} <span className="sr-only">{t('rating.stars', { count: entry.stars ?? 0 })}</span><span aria-hidden="true" className="ml-1 text-amber-700">{'★'.repeat(entry.stars ?? 0)}<span className="text-muted">{'★'.repeat(5 - (entry.stars ?? 0))}</span></span></>;
      case 'completed':
        return <span className="font-semibold text-ink">{t('Delivery completed')}</span>;
    }
  };

  return (
    <ol className={cn('space-y-3', className)} aria-label={t('Delivery timeline')}>
      {entries.map(entry => {
        const Icon = icons[entry.kind];
        const date = new Date(entry.at);
        return (
          <li key={entry.id} className="flex gap-3">
            <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', tones[entry.kind])}><Icon aria-hidden="true" className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6 text-muted">{sentence(entry)}</p>
              <time dateTime={entry.at} title={formatLocalizedDate(date, locale)} className="text-xs text-muted">{formatLocalizedDistanceToNow(date, locale)}</time>
              {entry.note && <p data-i18n-skip className="mt-1 whitespace-pre-wrap rounded-control bg-inset px-3 py-2 text-sm leading-6 text-ink">{entry.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default TaskTimeline;
