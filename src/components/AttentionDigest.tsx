import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import '../lib/pageCopy';
import { digestHiddenKey, type AttentionDigest as Digest } from '../lib/attentionDigest';
import { formatLocalizedWeekdayDate } from '../lib/i18n';
import { useI18n } from './I18nProvider';
import { Surface } from './ui';

interface AttentionDigestProps {
  digest: Digest;
  userId: string;
  now: Date;
  onOpen: (taskId: string) => void;
}

const readHidden = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };

/**
 * "Today" for a PM or HOD: what is overdue, at risk or waiting on them, with
 * links straight to those lists. It can be hidden for the rest of the day and
 * comes back tomorrow; the choice lives only in this browser.
 */
const AttentionDigest: React.FC<AttentionDigestProps> = ({ digest, userId, now, onOpen }) => {
  const { locale, t } = useI18n();
  const hiddenKey = digestHiddenKey(userId, now);
  const [hidden, setHidden] = React.useState(() => readHidden(hiddenKey));
  React.useEffect(() => { setHidden(readHidden(hiddenKey)); }, [hiddenKey]);
  if (hidden) return null;

  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(hiddenKey, '1'); } catch { /* The summary still hides for this visit. */ }
  };
  const stats: { key: string; count: number; label: string; to: string }[] = [
    { key: 'overdue', count: digest.overdue.length, label: t('ui.overdueCount', { count: digest.overdue.length }), to: '/manage?tab=active&filter=overdue' },
    { key: 'risk', count: digest.atRisk.length, label: t('ui.atRiskCount', { count: digest.atRisk.length }), to: '/manage?tab=active&filter=risk' },
    { key: 'review', count: digest.review.length, label: t('ui.needYourReviewCount', { count: digest.review.length }), to: '/manage?tab=review' },
  ];

  return (
    <Surface as="section" aria-labelledby="attention-digest-title" className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="attention-digest-title" className="text-sm font-semibold text-ink">{t('Today')}</h2>
          <p className="mt-0.5 text-xs text-muted">{formatLocalizedWeekdayDate(now, locale)}</p>
        </div>
        <button
          type="button"
          onClick={hide}
          aria-label={t('Hide today’s summary')}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-control text-muted hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
        ><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      {digest.total === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('Nothing needs your attention today.')}{digest.withClient > 0 ? ` ${t('ui.withClientCount', { count: digest.withClient })}` : ''}</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-2">
            {stats.filter(stat => stat.count > 0).map(stat => (
              <li key={stat.key}>
                <Link to={stat.to} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm font-medium text-ink transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{stat.label}</Link>
              </li>
            ))}
            {digest.withClient > 0 && <li><span className="inline-flex min-h-9 items-center px-1 text-sm text-muted">{t('ui.withClientCount', { count: digest.withClient })}</span></li>}
          </ul>
          <ul className="mt-3 divide-y divide-line/60" aria-label={t('Most urgent')}>
            {digest.top.map(task => (
              <li key={task.id}>
                <button type="button" onClick={() => onOpen(task.id)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
                  <span data-i18n-skip className="min-w-0 truncate font-medium text-ink">{task.title}</span>
                  <span data-i18n-skip className="shrink-0 text-xs text-muted">{task.clientName}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Surface>
  );
};

export default AttentionDigest;
