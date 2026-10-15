import React from 'react';
import type { ServiceCycle } from '../types';
import { monthlyRecordLabel } from '../lib/monthlyRecords';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { inputBase } from './uiTokens';

const MonthlyRecordPicker = ({ records, selected, current, unavailable, onChange }: {
  records: ServiceCycle[]; selected?: ServiceCycle; current?: ServiceCycle; unavailable: boolean;
  onChange: (id: string | null) => void;
}) => {
  const { t, locale } = useI18n();
  const id = React.useId();
  return <section aria-label={t('Monthly company record')} className="rounded-panel border border-line bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label htmlFor={id} className="block min-w-0 flex-1 text-sm font-medium text-ink">{t('Billing period')}
        <select id={id} value={selected?.id || ''} onChange={event => onChange(event.target.value === current?.id ? null : event.target.value || null)} className={`${inputBase} mt-2 px-3 py-2`}>
          {!selected && <option value="">{t(unavailable ? 'Monthly record unavailable' : 'No current cycle')}</option>}
          {records.map(cycle => <option key={cycle.id} value={cycle.id}>{monthlyRecordLabel(cycle, locale)} · {t(cycle.status)}{cycle.id === current?.id ? ` · ${t('Current')}` : ''}</option>)}
        </select>
      </label>
      {(selected?.id !== current?.id || unavailable) && <Button variant="secondary" onClick={() => onChange(null)}>{t('Current billing period')}</Button>}
    </div>
    <p className="mt-3 text-sm leading-6 text-muted" role="status">{unavailable
      ? t('This monthly record is unavailable for your account. Choose another billing period.')
      : selected ? t(selected.id === current?.id ? 'This month’s scope and prices are saved with this record. Plan changes apply to the next cycle.' : 'Historical scope and prices are preserved. Delivery progress and late files stay with this period.')
        : t('No cycle is available for the current billing period. You can still browse earlier records.')}</p>
  </section>;
};

export default MonthlyRecordPicker;
