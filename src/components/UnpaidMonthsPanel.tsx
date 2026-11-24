import '../lib/pageCopy';
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useI18n } from './I18nProvider';
import { formatMoney } from '../lib/serviceManagement';
import { formatLocalizedDate } from '../lib/i18n';
import { parseOptionalDate } from '../lib/utils';
import type { UnpaidMonth } from '../lib/unpaidMonths';
import { cardBase } from './uiTokens';

const PREVIEW_ROWS = 5;

/** Months that have started and are not fully paid, oldest first, each linking to its client workspace. */
const UnpaidMonthsPanel: React.FC<{ rows: UnpaidMonth[] }> = ({ rows }) => {
  const { locale, t } = useI18n();
  const [showAll, setShowAll] = React.useState(false);
  if (!rows.length) return null;
  const visible = showAll ? rows : rows.slice(0, PREVIEW_ROWS);
  const owedMinor = rows.reduce((sum, row) => sum + row.remainingMinor, 0);
  const monthLabel = (iso: string) => formatLocalizedDate(parseOptionalDate(iso)!, locale);
  return (
    <section className={`${cardBase} p-4 sm:p-5`} aria-labelledby="unpaid-months-title" data-testid="unpaid-months">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="unpaid-months-title" className="font-semibold text-ink">{t('Unpaid months')}</h2>
        <p className="text-sm text-muted">{rows.length} {t('months')} · {formatMoney(owedMinor, 'MYR', locale)} {t('still owed')}</p>
      </div>
      <ul className="mt-3 divide-y divide-line/70">
        {visible.map(row => (
          <li key={row.cycleId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-ink" data-i18n-skip>{row.clientName}</p>
              <p className="text-muted">{monthLabel(row.periodStart)} – {monthLabel(row.periodEnd)}{row.daysPastEnd > 0 ? ` · ${row.daysPastEnd} ${t('days past month end')}` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="calm-number font-semibold text-ink">{formatMoney(row.remainingMinor, 'MYR', locale)}</span>
              <Link to={`/clients/${encodeURIComponent(row.clientId)}`} className="inline-flex min-h-10 items-center gap-1 text-accent underline-offset-2 hover:underline" aria-label={`${t('Open')} ${row.clientName}`}>{t('Record payment')} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > PREVIEW_ROWS && <button type="button" className="mt-2 min-h-10 text-sm font-medium text-accent underline-offset-2 hover:underline" onClick={() => setShowAll(value => !value)}>{showAll ? t('Show fewer') : `${t('Show all')} (${rows.length})`}</button>}
    </section>
  );
};

export default UnpaidMonthsPanel;
